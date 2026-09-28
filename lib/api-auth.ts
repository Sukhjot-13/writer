// lib/api-auth.ts — the route-handler entry point for authorization.
//
// One rule, one place: every /api/* route starts by calling `authorize()` and
// bailing out when it gets a response back. There is no `isAdmin`, no numeric
// role comparison and no client-supplied identity anywhere in the app.
//
// Fail-closed by construction:
//   • no session cookie / unknown token / expired session → 401
//   • a storage or database error while resolving the session → 401 as well
//     (AuthError), never a silent "allow"
//   • the returned `ownerId` comes from the verified session row, so it cannot
//     be spoofed with a body field, query parameter or header
//
// Why the routes re-check even though middleware.ts already gates them: defense
// in depth. Middleware is a coarse first gate; this is the authoritative check
// that decides whether a document belongs to the caller.

import { NextResponse } from "next/server";

import { AuthError, requireOwner } from "./auth";
import type { User } from "./user";

export interface Authorized {
  user: User;
  /** The ONLY owner id any route may pass to storage. */
  ownerId: string;
}

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

/**
 * Resolve the caller, or return the 401 the route should send.
 *
 * Usage:
 *   const auth = await authorize();
 *   if (!isAuthorized(auth)) return auth;
 *   const { ownerId } = auth;
 */
export async function authorize(): Promise<Authorized | NextResponse> {
  try {
    return await requireOwner();
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401, headers: JSON_HEADERS });
    }
    // Anything unexpected (database down, malformed session row…) is a DENY,
    // never a fallback to an anonymous context.
    console.error("[auth] session resolution failed — denying:", error);
    return NextResponse.json({ error: "Authentication required" }, { status: 401, headers: JSON_HEADERS });
  }
}

export function isAuthorized(value: Authorized | NextResponse): value is Authorized {
  return !(value instanceof NextResponse);
}
