// /api/documents — list (GET) and create (POST) documents.
//
// Owner scope (2026-09-28): the caller is resolved from the session cookie and
// the ownerId is NEVER read from `?owner=` (that parameter used to be accepted
// and ignored; accepting an identity hint, even an ignored one, invites the next
// developer to trust it). GET returns only the caller's documents.
//
// POST is a CREATE, not an upsert (2026-09-28, the overwrite bug): the previous
// implementation did `replaceOne({_id: doc.id}, {...doc}, {upsert: true})` with no
// existence check, so ANY client could POST a body carrying somebody else's
// document id and silently overwrite — and snapshot — their work. Now the route
// checks for an existing id (409 on collision) and builds the stored row itself:
// a fresh `crypto.randomUUID()` id, the session ownerId, and server timestamps.
// ownerId / createdAt / _id / id / folderId / instructionsSnapshot / sourceHtml /
// opensInPractice are all stripped from the payload before it is persisted.

import { NextResponse } from "next/server";

import { getStorage } from "@/lib/storage";
import { authorize, isAuthorized } from "@/lib/api-auth";
import { saveDocumentPayloadSchema } from "@/lib/schemas";
import { persistDocument } from "@/lib/save";
import { isValidDocumentId } from "@/lib/ids";
import type { Document } from "@/lib/types";

export async function GET() {
  const auth = await authorize();
  if (!isAuthorized(auth)) return auth;
  const documents = await getStorage().listDocuments(auth.ownerId);
  return NextResponse.json({ documents });
}

export async function POST(request: Request) {
  const auth = await authorize();
  if (!isAuthorized(auth)) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = saveDocumentPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid document payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { doc, instructionsVersion } = parsed.data;

  // An id that does not look like an id is a 400 before it can reach storage —
  // route params and bodies both end up in query filters and (historically) in
  // a `$regex`.
  if (!isValidDocumentId(doc.id)) {
    return NextResponse.json({ error: "Invalid document id" }, { status: 400 });
  }

  const storage = getStorage();
  // 409 instead of an overwrite: creating over an existing id is never what the
  // client meant, and silently replacing somebody's work is data loss.
  if (await storage.getDocument(doc.id, auth.ownerId)) {
    return NextResponse.json({ error: "A document with that id already exists" }, { status: 409 });
  }

  // folderId is the one client-supplied reference that is KEPT — "New document
  // in this folder" is a shipped behaviour (M7 round 6b) and silently dropping it
  // would break that flow. It is still validated: an id the caller does not own
  // (or that does not exist) is dropped, so a create can never plant a dangling
  // or cross-account folder reference.
  let folderId: string | undefined;
  if (doc.folderId) {
    folderId = (await storage.getFolder(doc.folderId, auth.ownerId)) ? doc.folderId : undefined;
  }

  const now = new Date().toISOString();
  const stored: Document = {
    ...doc,
    // Server-assigned identity and ownership. instructionsSnapshot is recorded by
    // the conversion flow, sourceHtml only ever comes from the sanitizing import
    // route, and opensInPractice is set by the Test generator — none of them can
    // be set by a request body.
    id: crypto.randomUUID(),
    ownerId: auth.ownerId,
    createdAt: now,
    updatedAt: now,
    folderId,
    instructionsSnapshot: undefined,
    sourceHtml: undefined,
    opensInPractice: undefined,
  };

  // 2026-08-13: no file artifacts — html/pdf render on demand; the snapshot
  // rides on the document. (`html` stays in the wire schema for compat.)
  await persistDocument(storage, stored, instructionsVersion);
  return NextResponse.json({ doc: stored }, { status: 201 });
}
