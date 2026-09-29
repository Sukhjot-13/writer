// middleware.ts — the coarse authentication gate (2026-09-28).
//
// Before this file the app had NO authentication at all: all 18 /api/* routes
// and every page were world-readable and world-writable, so anyone could list,
// read, rewrite and delete every document in the database.
//
// What it does:
//   • requires a valid, non-expired session for EVERY page and EVERY /api/*
//     route, except the auth endpoints themselves, Next internals and static
//     assets
//   • enforces a request-body size ceiling before the body is ever read
//   • FAILS CLOSED: any error (no database, malformed cookie, driver failure)
//     produces a 401, never a pass-through
//
// It runs on the Node.js runtime (`runtime = "nodejs"`) because validating a
// session means hashing the cookie and looking it up in MongoDB, which the edge
// runtime cannot do.
//
// Defense in depth: routes ALSO call `authorize()` (lib/api-auth.ts) and every
// storage call is owner-scoped, so bypassing this file alone still grants
// nothing.
//
// 2026-09-28: every denial is also reported to Manager (optional, no-op when
// unconfigured) through lib/manager/index.js. This middleware is the app's
// cheapest real error signal: an unauthenticated hit on any page or /api/*
// route lands in the central log viewer with no credentials needed.

import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE } from "./lib/auth";
import { logServerError, managerLog } from "./lib/manager";

// The session lookup needs the MongoDB driver + node:crypto.
export const runtime = "nodejs";

/**
 * Prefixes that are public by design. `/login` MUST be here — a page path that
 * requires a session is redirected to it, so gating it too would bounce an
 * anonymous visitor straight back to itself forever.
 */
const PUBLIC_PREFIXES = [
  "/login",
  "/api/auth",
  "/_next",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
];

/** Largest request body any route accepts (the HTML import cap is 2 MB). */
const MAX_BODY_BYTES = 5 * 1024 * 1024;

function isPublic(pathname: string): boolean {
  if (PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return true;
  }
  // Static assets from /public are served at the ROOT as a single segment with an
  // extension (e.g. /next.svg). Deliberately narrow: a generic "any dotted last
  // segment is a file" rule would treat `/api/documents/a.b` as public and skip
  // the session check for a real API route.
  return /^\/[^/]+\.[a-zA-Z0-9]{1,8}$/.test(pathname);
}

// Every denial is a real, credential-free event (a scanner hitting /api/*), so it
// is reported to Manager next to the existing console.warn. No-op when Manager is
// not configured.
function deny(request: NextRequest, reason: string, status: number): NextResponse {
  if (reason) {
    console.warn(`[middleware] denied ${request.nextUrl.pathname}: ${reason}`);
    managerLog("warn", "middleware_denied", {
      path: request.nextUrl.pathname,
      reason,
      status,
    });
  }
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Authentication required" }, { status });
  }
  const login = new URL("/login", request.url);
  login.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(login, 302);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  // Body ceiling — checked before authentication work so an unauthenticated
  // flood never reaches a route handler.
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return deny(request, `body of ${declared} bytes exceeds the ${MAX_BODY_BYTES} byte limit`, 413);
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    return deny(request, "no session cookie", 401);
  }

  // Validate for real (hash + non-expired session row + existing user). Any
  // throw inside is caught and turned into a 401 — fail closed.
  try {
    const { userForSessionToken } = await import("./lib/auth");
    const user = await userForSessionToken(token);
    if (!user) return deny(request, "session not found, expired, or revoked", 401);
  } catch (error) {
    console.error("[middleware] session lookup failed — denying:", error);
    logServerError("middleware_session_lookup_failed", error, {
      path: request.nextUrl.pathname,
    });
    return deny(request, "session lookup failed", 401);
  }

  return NextResponse.next();
}

export const config = {
  // Everything except Next's own internals and real files in /public.
  matcher: ["/((?!_next/static|_next/image).*)"],
};
