// lib/db.ts — the ONE MongoDB connection for the whole app (2026-09-28).
//
// It used to live privately inside lib/storage-mongo.ts, which meant the new
// auth layer (lib/auth.ts, lib/user.ts) would have needed its own client. A
// single lazy singleton keeps the connection count at one and gives every module
// the same index bootstrap, so the owner-scoping guarantees (unique natural
// keys) are applied wherever the first query lands.
//
// Fail-closed: a missing MONGODB_URI throws through requireEnv (never a
// fallback backend) — see the note in lib/storage.ts.

import { MongoClient, type Collection, type Db, type Document as MongoDocument } from "mongodb";

import { requireEnv } from "./env";

/** Database name — unchanged from the original storage-mongo connection. */
const DB_NAME = "writer-app";

let cachedDb: Promise<Db> | null = null;
let indexesEnsured: Promise<void> | null = null;

/** Lazy `MongoClient.connect` cache. The first storage/auth call pays the connect. */
export function getDb(): Promise<Db> {
  if (!cachedDb) {
    const uri = requireEnv("MONGODB_URI");
    cachedDb = new MongoClient(uri)
      .connect()
      .then(async (client) => {
        const db = client.db(DB_NAME);
        // Indexes are created once, lazily, on the first connection — the owner
        // natural keys and the session/OTP TTLs must exist before the first
        // query, and doing it here covers storage AND auth with one code path.
        await ensureIndexes(db);
        return db;
      })
      .catch((error) => {
        // Never cache a failed connect — the next request must retry.
        cachedDb = null;
        throw error;
      });
  }
  return cachedDb;
}

/** Typed collection accessor: `collection<DocRow>("documents")`. */
export function collection<T extends MongoDocument>(name: string, db: Db): Collection<T> {
  return db.collection<T>(name);
}

/**
 * Owner-scoping indexes. `documents._id` is already unique, so the compound
 * `{ ownerId, id }` is the NATURAL key of a document: it makes "two owners can
 * never collide on one document row" a database-enforced invariant instead of an
 * application convention. `users.email` is the other natural key (one account
 * per address, enforced by the unique index — open signup still works because
 * the first OTP verification creates the row).
 *
 * Sessions/OTPs additionally get TTL indexes so expired rows disappear without
 * a sweeper. Index creation is best-effort: a pre-existing duplicate (legacy
 * data) logs instead of taking the app down — the CODE still scopes every query
 * by owner, so the index is defence in depth, not the access-control boundary.
 */
export async function ensureIndexes(db: Db): Promise<void> {
  if (!indexesEnsured) {
    indexesEnsured = (async () => {
      const specs: {
        collection: string;
        keys: Record<string, 1 | -1>;
        options?: { unique?: boolean; expireAfterSeconds?: number };
      }[] = [
        { collection: "documents", keys: { ownerId: 1, id: 1 }, options: { unique: true } },
        {
          collection: "docversions",
          keys: { ownerId: 1, docId: 1, version: 1 },
          options: { unique: true },
        },
        { collection: "files", keys: { ownerId: 1, _id: 1 } },
        { collection: "folders", keys: { ownerId: 1, _id: 1 } },
        { collection: "users", keys: { email: 1 }, options: { unique: true } },
        { collection: "sessions", keys: { tokenHash: 1 }, options: { unique: true } },
        { collection: "sessions", keys: { expiresAt: 1 }, options: { expireAfterSeconds: 0 } },
        { collection: "otps", keys: { email: 1 } },
        { collection: "otps", keys: { expiresAt: 1 }, options: { expireAfterSeconds: 0 } },
      ];
      for (const spec of specs) {
        try {
          await db.collection(spec.collection).createIndex(spec.keys, spec.options ?? {});
        } catch (error) {
          console.warn(`[db] index ${JSON.stringify(spec.keys)} on ${spec.collection} failed:`, error);
        }
      }
    })().catch((error) => {
      indexesEnsured = null;
      throw error;
    });
  }
  return indexesEnsured;
}
