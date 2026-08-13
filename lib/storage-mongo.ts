// lib/storage-mongo.ts — MongoDB + Vercel Blob storage backend (M5, FR-44).
//
// ResumeBuilder stack: documents + instructions live in MongoDB. The html/pdf/
// snapshot attachment files live in Vercel Blob — 2026-08-13 rework: the app
// no longer WRITES them (html/pdf render on demand, the snapshot + imported
// html ride on the document as plain fields), so Vercel Blob is only touched
// on read (legacy-file fallbacks) and delete (old artifacts). BLOB_READ_WRITE_TOKEN
// is therefore unnecessary for normal operation. Activated by MONGODB_URI via
// the factory in lib/storage.ts — app code never talks to either directly.
//
// Layout:
//   collection documents     — { _id: docId, ...Document }
//   collection files         — { _id: "<docId>/<filename>", url, contentType }  (blob handle map, legacy artifacts)
//   collection instructions  — { _id: "active" | "history:<version>", content, savedAt }
//   collection folders       — { _id: folderId, name, createdAt, updatedAt }  (2026-08-10 M7 round 6)
//
// Lazy Mongo connection keeps the getStorage() factory synchronous — the
// first storage call pays the connect. Blob read uses the public URL from
// the files collection; `del` only when deleting a document.

import { MongoClient, type Db } from "mongodb";
import { put, del } from "@vercel/blob";
import { promises as fs } from "node:fs";

import type { Document, Folder } from "./types";
import type { StorageBackend } from "./storage";
import { REPO_INSTRUCTIONS_PATH } from "./tokens";
import { syncActiveFromRepo } from "./instructions";

const DOCS = "documents";
const FILES = "files";
const INSTR = "instructions";
const FOLDERS = "folders";
const ACTIVE_KEY = "active";

let cachedDb: Promise<Db> | null = null;

function getDb(): Promise<Db> {
  if (!cachedDb) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI is not set — filesystem storage should be used (remove MONGODB_URI).");
    cachedDb = new MongoClient(uri).connect().then((client) => client.db("writer-app"));
  }
  return cachedDb;
}

interface DocRow {
  _id: string;
  [key: string]: unknown;
}
interface FileRow {
  _id: string;
  url: string;
  contentType?: string;
}
interface InstrRow {
  _id: string;
  content: string;
  savedAt: string | Date;
}

function stripId(raw: DocRow): Document {
  const { _id, ...rest } = raw;
  void _id;
  return rest as unknown as Document;
}

/** "docId/filename" → blob URL via the files collection. */
async function blobUrl(db: Db, key: string): Promise<string | null> {
  const file = await db.collection<FileRow>(FILES).findOne({ _id: key });
  return file?.url ?? null;
}

export function createMongoBlobStorage(): StorageBackend {
  const backend: StorageBackend = {
    async listDocuments(ownerId) {
      const db = await getDb();
      const filter = ownerId ? { ownerId } : {};
      const docs = await db.collection<DocRow>(DOCS).find(filter).sort({ updatedAt: -1 }).toArray();
      return docs.map(stripId);
    },

    async getDocument(id, _ownerId) {
      const db = await getDb();
      const doc = await db.collection<DocRow>(DOCS).findOne({ _id: id });
      return doc ? stripId(doc) : null;
    },

    async saveDocument(doc) {
      const db = await getDb();
      await db.collection<DocRow>(DOCS).replaceOne({ _id: doc.id }, { ...doc }, { upsert: true });
    },

    async deleteDocument(id) {
      const db = await getDb();
      // Remove blob files first (need their URLs), then the Mongo rows.
      const files = await db.collection<FileRow>(FILES).find({ _id: { $regex: `^${id}/` } }).toArray();
      const urls = files.map((f) => f.url);
      if (urls.length) {
        await del(urls).catch(() => {
          // Blob removal is best-effort on document delete — orphaned files
          // would only linger in the store, never in the app.
        });
      }
      await db.collection<FileRow>(FILES).deleteMany({ _id: { $regex: `^${id}/` } });
      await db.collection<DocRow>(DOCS).deleteOne({ _id: id });
    },

    // ---- library folders (2026-08-10 M7 round 6) — mirror of the FS backend.
    // Deleting a folder UNFILES its documents (unset folderId) — never deletes them.
    async listFolders() {
      const db = await getDb();
      const rows = await db.collection<DocRow>(FOLDERS).find({}).toArray();
      return rows
        .map((r) => stripId(r) as unknown as Folder)
        .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
    },

    async createFolder(name) {
      const db = await getDb();
      const now = new Date().toISOString();
      const folder: Folder = { id: crypto.randomUUID(), name, createdAt: now, updatedAt: now };
      await db.collection<DocRow>(FOLDERS).insertOne({ _id: folder.id, ...folder });
      return folder;
    },

    async renameFolder(id, name) {
      const db = await getDb();
      const res = await db
        .collection<DocRow>(FOLDERS)
        .findOneAndUpdate({ _id: id }, { $set: { name, updatedAt: new Date().toISOString() } });
      if (!res) return null;
      return stripId(res) as unknown as Folder;
    },

    async deleteFolder(id) {
      const db = await getDb();
      await db.collection<DocRow>(FOLDERS).deleteOne({ _id: id });
      // Unfile the folder's documents — the documents themselves are kept.
      await db.collection<DocRow>(DOCS).updateMany({ folderId: id }, { $unset: { folderId: "" } });
    },

    async readFile(docId, filename) {
      const db = await getDb();
      const key = `${docId}/${filename}`;
      const url = await blobUrl(db, key);
      if (!url) return null;
      const res = await fetch(url);
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    },

    // 2026-08-13: the app never WRITES attachment files anymore (html/pdf on
    // demand, snapshot/source on the document). Kept on the interface for
    // tests/compat — requires BLOB_READ_WRITE_TOKEN if actually called.
    async writeFile(docId, filename, data) {
      const db = await getDb();
      const key = `${docId}/${filename}`;
      const blob = await put(key, data, { access: "public" });
      await db
        .collection<FileRow>(FILES)
        .updateOne(
          { _id: key },
          { $set: { url: blob.url, contentType: blob.contentType, updatedAt: new Date().toISOString() } },
          { upsert: true },
        );
    },

    async deleteFile(docId, filename) {
      const db = await getDb();
      const key = `${docId}/${filename}`;
      const url = await blobUrl(db, key);
      if (url) await del([url]).catch(() => undefined);
      await db.collection<FileRow>(FILES).deleteOne({ _id: key });
    },

    /**
     * Active instructions: upsert the repo copy on first run (idempotent —
     * mirrors FS seeding, FR-21) and auto-sync whenever the repo copy is the
     * newer writer (to-do item 10 — no manual "Reset to repo file").
     */
    async readInstructions() {
      await syncActiveFromRepo(backend);
      const db = await getDb();
      const active = await db.collection<InstrRow>(INSTR).findOne({ _id: ACTIVE_KEY });
      if (active) return active.content;
      const repo = await fs.readFile(REPO_INSTRUCTIONS_PATH, "utf8");
      await db
        .collection<InstrRow>(INSTR)
        .updateOne({ _id: ACTIVE_KEY }, { $set: { content: repo, savedAt: new Date().toISOString() } }, { upsert: true });
      return repo;
    },

    async writeInstructions(content) {
      const db = await getDb();
      await db
        .collection<InstrRow>(INSTR)
        .updateOne({ _id: ACTIVE_KEY }, { $set: { content, savedAt: new Date().toISOString() } }, { upsert: true });
    },

    async snapshotInstructions(version) {
      const db = await getDb();
      const active = await db.collection<InstrRow>(INSTR).findOne({ _id: ACTIVE_KEY });
      const content = active?.content ?? (await fs.readFile(REPO_INSTRUCTIONS_PATH, "utf8"));
      await db
        .collection<InstrRow>(INSTR)
        .updateOne(
          { _id: `history:${version}` },
          { $set: { content, savedAt: new Date().toISOString() } },
          { upsert: true },
        );
    },

    async listInstructionsHistory() {
      const db = await getDb();
      const entries = await db.collection<InstrRow>(INSTR).find({ _id: { $regex: /^history:/ } }).sort({ savedAt: -1 }).toArray();
      return entries.map((e) => ({
        version: String(e._id).slice("history:".length),
        savedAt: typeof e.savedAt === "string" ? e.savedAt : new Date(e.savedAt).toISOString(),
      }));
    },

    async readInstructionsVersion(version) {
      const db = await getDb();
      const entry = await db.collection<InstrRow>(INSTR).findOne({ _id: `history:${version}` });
      return entry?.content ?? null;
    },

    async getInstructionsEditedAt() {
      const db = await getDb();
      const active = await db.collection<InstrRow>(INSTR).findOne({ _id: ACTIVE_KEY });
      if (!active) return 0; // no active row yet — the first read seeds (and syncs)
      return typeof active.savedAt === "string"
        ? Date.parse(active.savedAt)
        : active.savedAt.getTime();
    },
  };
  return backend;
}
