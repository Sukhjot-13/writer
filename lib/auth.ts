// lib/auth.ts — passwordless email-OTP authentication (2026-09-28).
//
// Design (deliberately dependency-free — Node's `crypto` covers everything):
//
//   1. POST /api/auth/otp/send     → createOtp(email) mails a 6-digit code
//   2. POST /api/auth/otp/verify   → verifyOtp(email, code) + createSession(userId)
//   3. every other page/API        → requireOwner() reads the opaque `session`
//                                     cookie and returns the one and only
//                                     owner id the rest of the app may use
//
// OPAQUE RANDOM TOKENS, not JWT. A session is 32 bytes from crypto.randomBytes;
// the server stores ONLY sha256(token) and hands the raw token to the browser as
// an httpOnly cookie. There is nothing to decode and nothing to forge — losing
// the server-side row revokes the session immediately.
//
// The owner id is NEVER read from a request body, query string or header: it is
// derived from the verified session row inside `requireOwner`/`getSessionUser`
// and handed to storage as the `ownerId` filter. Routes cannot spoof it because
// they never accept it.
//
// `next/headers` is imported lazily so this module stays importable from the
// node smoke suites (which have no Next request scope).

import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

import { getDb } from "./db";
import { requireEnv } from "./env";
import { findUserById, findOrCreateUser, normalizeEmail, isValidEmail, type User } from "./user";

/** Cookie name carrying the raw session token. */
export const SESSION_COOKIE = "session";

/** A session lives 30 days. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** An OTP expires 10 minutes after it is issued. */
export const OTP_TTL_MS = 10 * 60 * 1000;

/** Wrong-code attempts allowed per issued OTP before the row is destroyed. */
export const OTP_MAX_ATTEMPTS = 5;

/** Rate limits for OTP sends (per window). */
export const OTP_PER_EMAIL = 3;
export const OTP_PER_IP = 10;
export const OTP_WINDOW_MS = 10 * 60 * 1000;

const OTPS = "otps";
const SESSIONS = "sessions";
const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

interface OtpRow {
  _id: string;
  email: string;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  consumedAt: Date | null;
  createdAt: Date;
}

interface SessionRow {
  _id: string;
  tokenHash: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
  lastSeenAt: Date;
}

/** Thrown by requireUser/requireOwner — routes turn it into a 401. */
export class AuthError extends Error {
  readonly status = 401;
  constructor(message = "Authentication required") {
    super(message);
    this.name = "AuthError";
  }
}

// ---- pure helpers (unit-tested in tests/smoke-m10.ts) ----

/** 6-digit code from a CSPRNG, zero-padded. */
export function generateOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/** sha256 hex of a session token. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * The stored OTP hash is salted with the address, so a leaked hash row cannot
 * be brute-forced against other addresses, and the raw code is never stored.
 */
export function hashOtpCode(email: string, code: string): string {
  return createHash("sha256")
    .update(`${normalizeEmail(email)}:${code}`, "utf8")
    .digest("hex");
}

/**
 * Length-safe constant-time comparison. Buffers of different length are
 * compared by hash so the early return never leaks the length of the secret
 * (both inputs here are fixed-width hex digests, so this is belt and braces).
 */
export function safeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(hashToken(a), "hex");
  const bufB = Buffer.from(hashToken(b), "hex");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** True when the issued OTP is past its 10-minute window. */
export function otpIsExpired(expiresAt: Date, now: number = Date.now()): boolean {
  return expiresAt.getTime() <= now;
}

/** True when the row has burned through its attempt budget (and is now locked out). */
export function otpIsLocked(attempts: number, max: number = OTP_MAX_ATTEMPTS): boolean {
  return attempts >= max;
}

/** A session token is 32 random bytes as lowercase hex. */
export function isWellFormedSessionToken(token: string | undefined | null): boolean {
  return typeof token === "string" && /^[a-f0-9]{64}$/.test(token);
}

// ---- email delivery (Brevo REST) ----

async function sendOtpEmail(email: string, code: string): Promise<void> {
  const apiKey = requireEnv("BREVO_API_KEY");
  const sender = requireEnv("BREVO_SENDER_EMAIL");
  const res = await fetch(BREVO_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": apiKey },
    body: JSON.stringify({
      sender: { email: sender, name: "Writer App" },
      to: [{ email }],
      subject: "Your Writer App sign-in code",
      textContent:
        `Your sign-in code is ${code}.\n\n` +
        `It expires in 10 minutes and can be used once. If you did not request it, ` +
        `you can ignore this email — nothing has changed.`,
    }),
  });
  if (!res.ok) {
    throw new Error(`Brevo rejected the OTP email (${res.status}).`);
  }
}

// ---- OTP lifecycle ----

/**
 * Issue an OTP: destroy every prior unconsumed code for the address, store the
 * SHA-256 of the new one (never the code), and mail it. Returns only the
 * expiry — the caller has no way to learn the code.
 */
export async function createOtp(email: string): Promise<{ expiresAt: Date }> {
  const normalized = normalizeEmail(email);
  if (!isValidEmail(normalized)) {
    throw new Error("That email address does not look valid.");
  }
  const db = await getDb();
  const otps = db.collection<OtpRow>(OTPS);
  await otps.deleteMany({ email: normalized, consumedAt: null });

  const code = generateOtpCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);
  const codeHash = hashOtpCode(normalized, code);
  await otps.insertOne({
    _id: `${normalized}:${codeHash}`,
    email: normalized,
    codeHash,
    expiresAt,
    attempts: 0,
    consumedAt: null,
    createdAt: new Date(),
  });

  await sendOtpEmail(normalized, code);
  return { expiresAt };
}

/**
 * Redeem an OTP. Constant-time compare, 10-minute expiry, at most
 * OTP_MAX_ATTEMPTS wrong guesses (the row is deleted on the 5th, so the address
 * must request a fresh code), and the row is destroyed on success — a code is
 * single-use, which is what makes it safe to mail a 6-digit secret.
 */
export async function verifyOtp(email: string, code: string): Promise<boolean> {
  const normalized = normalizeEmail(email);
  const candidate = typeof code === "string" ? code.trim() : "";
  const db = await getDb();
  const otps = db.collection<OtpRow>(OTPS);
  const row = await otps.findOne({ email: normalized, consumedAt: null });

  if (!row) {
    // No code outstanding: still burn the comparison so a missing row and a
    // wrong code take the same path.
    safeEquals(hashOtpCode(normalized, candidate), hashOtpCode(normalized, "000000"));
    return false;
  }

  if (!safeEquals(row.codeHash, hashOtpCode(normalized, candidate))) {
    const attempts = row.attempts + 1;
    if (otpIsLocked(attempts)) {
      await otps.deleteOne({ _id: row._id });
    } else {
      await otps.updateOne({ _id: row._id }, { $set: { attempts } });
    }
    return false;
  }

  if (otpIsExpired(row.expiresAt)) {
    await otps.deleteOne({ _id: row._id });
    return false;
  }

  await otps.deleteOne({ _id: row._id });
  return true;
}

// ---- sessions ----

/** Create a session row and return the RAW token (the only time it exists). */
export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const now = new Date();
  const db = await getDb();
  await db.collection<SessionRow>(SESSIONS).insertOne({
    _id: tokenHash,
    tokenHash,
    userId,
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
    createdAt: now,
    lastSeenAt: now,
  });
  return token;
}

/**
 * Resolve a raw cookie value to its user. Returns null for a malformed token,
 * an unknown hash, an expired row, or a session whose user was removed — the
 * caller cannot tell those apart, and none of them grants access.
 */
export async function userForSessionToken(token: string | undefined | null): Promise<User | null> {
  if (!isWellFormedSessionToken(token)) return null;
  const db = await getDb();
  const sessions = db.collection<SessionRow>(SESSIONS);
  const row = await sessions.findOne({ tokenHash: hashToken(token as string) });
  if (!row) return null;
  if (otpIsExpired(row.expiresAt)) {
    await sessions.deleteOne({ _id: row._id });
    return null;
  }
  const user = await findUserById(row.userId);
  if (!user) {
    await sessions.deleteOne({ _id: row._id });
    return null;
  }
  await sessions.updateOne({ _id: row._id }, { $set: { lastSeenAt: new Date() } });
  return user;
}

/** Read the `session` cookie and resolve it. Any failure → null (fail closed). */
export async function getSessionUser(): Promise<User | null> {
  try {
    const { cookies } = await import("next/headers");
    const jar = await cookies();
    return await userForSessionToken(jar.get(SESSION_COOKIE)?.value);
  } catch {
    return null;
  }
}

/** Like getSessionUser but throws AuthError — for routes and server pages. */
export async function requireUser(): Promise<User> {
  const user = await getSessionUser();
  if (!user) throw new AuthError();
  return user;
}

/**
 * THE ONLY SOURCE of an owner id. Returns the session user and the owner id that
 * must be threaded into every storage call. It is derived from the server-side
 * session row — never from a body, query or header.
 */
export async function requireOwner(): Promise<{ user: User; ownerId: string }> {
  const user = await requireUser();
  return { user, ownerId: user.id };
}

/** Delete the current session row (logout). No-op when already signed out. */
export async function destroySession(): Promise<void> {
  try {
    const { cookies } = await import("next/headers");
    const jar = await cookies();
    const token = jar.get(SESSION_COOKIE)?.value;
    if (!isWellFormedSessionToken(token)) return;
    const db = await getDb();
    await db.collection<SessionRow>(SESSIONS).deleteOne({ tokenHash: hashToken(token as string) });
  } catch {
    // Logout is idempotent — a failure here must never block the response.
  }
}

/**
 * Verify an OTP and open a session in one step (the /api/auth/otp/verify route).
 * The account is created on first success — open signup, no admin approval.
 */
export async function signInWithOtp(
  email: string,
  code: string,
): Promise<{ user: User; token: string } | null> {
  if (!isValidEmail(email)) return null;
  if (!(await verifyOtp(email, code))) return null;
  const user = await findOrCreateUser(email);
  const token = await createSession(user.id);
  return { user, token };
}
