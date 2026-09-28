// POST /api/auth/otp/send — issue a 6-digit sign-in code (2026-09-28).
//
// Passwordless: the code is the only credential. It is generated with a CSPRNG,
// stored only as a SHA-256 hash, mailed through the Brevo REST API and valid for
// 10 minutes / 5 attempts.
//
// Anti-enumeration: the response is IDENTICAL whether or not the address has an
// account (it always does — signup is open), and no route ever reveals whether a
// given email exists.
//
// Rate limited: 3 per email / 10 min and 10 per IP / 10 min (lib/rate-limit.ts)
// → 429 with Retry-After.

import { NextResponse } from "next/server";

import { createOtp, OTP_PER_EMAIL, OTP_PER_IP, OTP_WINDOW_MS } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { normalizeEmail, isValidEmail } from "@/lib/user";

const RATE_KEY = "otp";

/** Never echo the reason a send failed in a way that identifies an account. */
const GENERIC_FAILURE = { error: "Could not send the sign-in code. Try again shortly." };
const GENERIC_SENT = { ok: true, message: "If that address can receive mail, a code is on its way." };

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Enter your email address." }, { status: 400 });
  }

  const raw = (body as { email?: unknown } | null)?.email;
  const email = typeof raw === "string" ? normalizeEmail(raw) : "";
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const ip = clientIp(request);
  const perEmail = rateLimit(`${RATE_KEY}:email:${email}`, OTP_PER_EMAIL, OTP_WINDOW_MS);
  const perIp = rateLimit(`${RATE_KEY}:ip:${ip}`, OTP_PER_IP, OTP_WINDOW_MS);
  if (!perEmail.allowed || !perIp.allowed) {
    return NextResponse.json(
      { error: "Too many codes requested. Wait a few minutes and try again." },
      { status: 429, headers: { "Retry-After": String(Math.max(perEmail.retryAfterSeconds, perIp.retryAfterSeconds)) } },
    );
  }

  try {
    await createOtp(email);
    return NextResponse.json(GENERIC_SENT);
  } catch (error) {
    // A Brevo outage, a missing BREVO_API_KEY or an invalid address must not
    // leak through — but the operator needs the reason in the server log.
    console.error("[auth/otp/send]", error);
    return NextResponse.json(GENERIC_FAILURE, { status: 500 });
  }
}
