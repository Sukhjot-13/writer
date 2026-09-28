// lib/user.ts — the account record behind a session (2026-09-28).
//
// Signup is OPEN: any address that can receive the emailed OTP gets an account
// the first time it verifies. There is no password — the OTP exchange is the
// only credential, and it happens in lib/auth.ts.
//
// `email` is the natural key: lowercased + trimmed on the way in, enforced
// unique by the `{ email: 1 }` unique index in lib/db.ts.

import { getDb } from "./db";

export interface User {
  id: string;
  /** Lowercased + trimmed. Unique. */
  email: string;
  name?: string;
  createdAt: string;
  lastLoginAt: string;
}

interface UserRow {
  _id: string;
  email: string;
  name?: string;
  createdAt: string;
  lastLoginAt: string;
}

/** Canonical form used for storage AND lookup — case/space insensitive. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Pragmatic shape check — rejects the obvious garbage before we email it. */
export function isValidEmail(email: string): boolean {
  const value = normalizeEmail(email);
  if (value.length === 0 || value.length > 254) return false;
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(value);
}

function stripId(row: UserRow): User {
  const { _id, ...rest } = row;
  return { ...rest, id: _id };
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const db = await getDb();
  const row = await db.collection<UserRow>("users").findOne({ email: normalizeEmail(email) });
  return row ? stripId(row) : null;
}

export async function findUserById(id: string): Promise<User | null> {
  const db = await getDb();
  const row = await db.collection<UserRow>("users").findOne({ _id: id });
  return row ? stripId(row) : null;
}

/**
 * Open signup: the FIRST verification for an address creates the account, every
 * later one just refreshes `lastLoginAt`. A duplicate-key race (two concurrent
 * first logins) is not an error — the winner's row is returned.
 */
export async function findOrCreateUser(email: string, name?: string): Promise<User> {
  const normalized = normalizeEmail(email);
  const now = new Date().toISOString();
  const db = await getDb();
  const users = db.collection<UserRow>("users");

  const updated = await users.findOneAndUpdate(
    { email: normalized },
    { $set: { lastLoginAt: now } },
    { returnDocument: "after" },
  );
  if (updated) return stripId(updated);

  const row: UserRow = {
    _id: crypto.randomUUID(),
    email: normalized,
    ...(name?.trim() ? { name: name.trim() } : {}),
    createdAt: now,
    lastLoginAt: now,
  };
  try {
    await users.insertOne(row);
  } catch {
    const raced = await users.findOne({ email: normalized });
    if (!raced) throw new Error("Could not create the user record.");
    return stripId(raced);
  }
  return stripId(row);
}
