// /api/documents/[id] — get (GET), update/save (PUT), delete (DELETE),
// move to folder (PATCH, 2026-08-10 M7 round 6).
// PUT accepts { doc, html?, instructionsVersion? } — html is accepted for
// wire compatibility only; nothing is written to files anymore (2026-08-13:
// html/pdf render on demand, the FR-23 snapshot rides on the document).
// PATCH accepts { folderId: string | null } — moves the document between
// library folders without touching its content.
//
// Owner scope (2026-09-28): every handler resolves the session first, validates
// the route id shape (400), and passes the session-derived ownerId to storage.
// A document that exists but belongs to somebody else answers 404, never 403 —
// a 403 would confirm it exists.
//
// 2026-09-28 fixes folded in:
//   • the storage handle is resolved ONCE per request (it was fetched twice)
//   • DELETE answers 404 when nothing was removed (it always answered 204)
//   • PATCH validates the target folder exists (it accepted any folderId and
//     produced a dangling reference)

import { NextResponse } from "next/server";

import { getStorage } from "@/lib/storage";
import { authorize, isAuthorized } from "@/lib/api-auth";
import { saveDocumentPayloadSchema, moveDocumentPayloadSchema } from "@/lib/schemas";
import { persistDocument } from "@/lib/save";
import { hashVersion } from "@/lib/instructions";
import { isValidDocumentId } from "@/lib/ids";

type RouteParams = { params: Promise<{ id: string }> };

const BAD_ID = () => NextResponse.json({ error: "Invalid document id" }, { status: 400 });
const NOT_FOUND = () => NextResponse.json({ error: "Document not found" }, { status: 404 });

export async function GET(_request: Request, { params }: RouteParams) {
  const auth = await authorize();
  if (!isAuthorized(auth)) return auth;
  const { id } = await params;
  if (!isValidDocumentId(id)) return BAD_ID();

  const storage = getStorage();
  const doc = await storage.getDocument(id, auth.ownerId);
  if (!doc) return NOT_FOUND();
  // FR-23: tell the editor whether this document has a recorded instructions
  // snapshot and whether it differs from the active rules (drives the
  // "convert with snapshot rules" toggle).
  // 2026-08-13: the snapshot rides on the document; the legacy
  // instructions.snapshot.md file is still read for older documents.
  const snapshot =
    doc.instructionsSnapshot ??
    (await storage.readFile(id, "instructions.snapshot.md", auth.ownerId))?.toString("utf8") ??
    null;
  let snapshotInfo: { version: string; differs: boolean } | null = null;
  if (snapshot) {
    const active = await storage.readInstructions();
    snapshotInfo = { version: hashVersion(snapshot), differs: snapshot !== active };
  }
  return NextResponse.json({ doc, snapshotInfo });
}

export async function PUT(request: Request, { params }: RouteParams) {
  const auth = await authorize();
  if (!isAuthorized(auth)) return auth;
  const { id } = await params;
  if (!isValidDocumentId(id)) return BAD_ID();

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
  if (doc.id !== id) {
    return NextResponse.json(
      { error: "Document id in payload does not match route id" },
      { status: 400 },
    );
  }

  const storage = getStorage();
  const existing = await storage.getDocument(id, auth.ownerId);
  if (!existing) return NOT_FOUND();

  // 2026-09-28: the owner, the creation stamp and the folder placement are the
  // SERVER's to keep — accepting them here let a client re-point a document at
  // another account or silently unfile it. instructionsSnapshot is written by
  // the conversion flow (below) and sourceHtml only ever comes from the
  // sanitizing import route, so neither may be re-supplied by a save; that is
  // what stops an owner parking unsanitized markup on their own document and
  // having it served from the app origin.
  const merged = {
    ...doc,
    ownerId: auth.ownerId,
    createdAt: existing.createdAt,
    updatedAt: existing.updatedAt,
    folderId: existing.folderId,
    instructionsSnapshot: existing.instructionsSnapshot,
    sourceHtml: existing.sourceHtml,
    opensInPractice: existing.opensInPractice,
  };

  await persistDocument(storage, merged, instructionsVersion);
  return NextResponse.json({ doc: merged });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const auth = await authorize();
  if (!isAuthorized(auth)) return auth;
  const { id } = await params;
  if (!isValidDocumentId(id)) return BAD_ID();

  // 2026-09-28: report a miss. The old handler always answered 204, so a delete
  // of someone else's (or a non-existent) id looked exactly like a success.
  const deleted = await getStorage().deleteDocument(id, auth.ownerId);
  if (!deleted) return NOT_FOUND();
  return new NextResponse(null, { status: 204 });
}

/** Move the document into (or out of) a library folder — content untouched. */
export async function PATCH(request: Request, { params }: RouteParams) {
  const auth = await authorize();
  if (!isAuthorized(auth)) return auth;
  const { id } = await params;
  if (!isValidDocumentId(id)) return BAD_ID();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = moveDocumentPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid move payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const storage = getStorage();
  const doc = await storage.getDocument(id, auth.ownerId);
  if (!doc) return NOT_FOUND();

  // 2026-09-28: reject a folder that does not exist (or is not the caller's) —
  // the old handler wrote whatever id it was given, leaving a dangling
  // folderId that the library UI could never resolve.
  const folderId = parsed.data.folderId ?? undefined;
  if (folderId && !(await storage.getFolder(folderId, auth.ownerId))) {
    return NextResponse.json({ error: "Folder not found" }, { status: 400 });
  }

  // folderId null = unfiled. updatedAt is intentionally untouched — moving
  // between folders is organization, not content editing (it would otherwise
  // reshuffle the home "recent" list for no reason).
  const next = { ...doc, folderId };
  await storage.saveDocument(next);
  return NextResponse.json({ doc: next });
}
