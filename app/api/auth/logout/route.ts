// POST /api/auth/logout — drop the current session (2026-09-28).
//
// Deletes the session ROW (not just the cookie) so a stolen copy of the token is
// dead immediately, then clears the cookie. Idempotent: signing out twice is not
// an error.

import { NextResponse } from "next/server";

import { SESSION_COOKIE, destroySession } from "@/lib/auth";

export async function POST() {
  await destroySession();
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
