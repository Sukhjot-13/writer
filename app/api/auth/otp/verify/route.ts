// POST /api/auth/otp/verify — redeem a sign-in code and open a session.
//
// The code is compared in constant time, is single-use, expires after 10 minutes
// and is destroyed after 5 wrong attempts (lib/auth.ts). On success the account
// is created if it does not exist (open signup) and a 32-byte opaque session
// token is issued as an httpOnly, SameSite=Lax, Secure cookie.
//
// The response never distinguishes "no such code" from "wrong code" from
// "expired" — one generic failure, no account enumeration.

import { NextResponse } from "next/server";

import { SESSION_COOKIE, SESSION_TTL_MS, signInWithOtp } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { normalizeEmail, isValidEmail } from "@/lib/user";

const GENERIC_FAILURE = { error: "That code is not valid. Request a new one and try again." };
const RATE_KEY = "otp-verify";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Enter the 6-digit code." }, { status: 400 });
  }

  const payload = (body ?? {}) as { email?: unknown; code?: unknown };
  const email = typeof payload.email === "string" ? normalizeEmail(payload.email) : "";
  const code = typeof payload.code === "string" ? payload.code.trim() : "";
  if (!isValidEmail(email) || !/^\d{6}$/.test(code)) {
    return NextResponse.json(GENERIC_FAILURE, { status: 400 });
  }

  // Brute-force ceiling independent of the per-OTP attempt counter, so a
  // "send → guess → send → guess" loop is still throttled.
  const limit = rateLimit(`${RATE_KEY}:${email}`, 10, 10 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Request a new code and wait a few minutes." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  try {
    const result = await signInWithOtp(email, code);
    if (!result) return NextResponse.json(GENERIC_FAILURE, { status: 401 });

    const response = NextResponse.json({
      ok: true,
      user: { id: result.user.id, email: result.user.email },
    });
    response.cookies.set({
      name: SESSION_COOKIE,
      value: result.token,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: Math.floor(SESSION_TTL_MS / 1000),
    });
    return response;
  } catch (error) {
    console.error("[auth/otp/verify]", error);
    return NextResponse.json({ error: "Could not sign you in. Try again shortly." }, { status: 500 });
  }
}
