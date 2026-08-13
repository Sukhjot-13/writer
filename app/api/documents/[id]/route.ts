// /api/documents/[id] — get (GET), update/save (PUT), delete (DELETE),
// move to folder (PATCH, 2026-08-10 M7 round 6).
// PUT accepts { doc, html?, instructionsVersion? } — html is accepted for
// wire compatibility only; nothing is written to files anymore (2026-08-13:
// html/pdf render on demand, the FR-23 snapshot rides on the document).
// PATCH accepts { folderId: string | null } — moves the document between
// library folders without touching its content.

import { NextResponse } from "next/server";

import { getStorage } from "@/lib/storage";
import { saveDocumentPayloadSchema, moveDocumentPayloadSchema } from "@/lib/schemas";
import { persistDocument } from "@/lib/save";
import { hashVersion } from "@/lib/instructions";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const doc = await getStorage().getDocument(id);
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });
  // FR-23: tell the editor whether this document has a recorded instructions
  // snapshot and whether it differs from the active rules (drives the
  // "convert with snapshot rules" toggle).
  const storage = getStorage();
  // 2026-08-13: the snapshot rides on the document; the legacy
  // instructions.snapshot.md file is still read for older documents.
  const snapshot =
    doc.instructionsSnapshot ??
    (await storage.readFile(id, "instructions.snapshot.md"))?.toString("utf8") ??
    null;
  let snapshotInfo: { version: string; differs: boolean } | null = null;
  if (snapshot) {
    const active = await storage.readInstructions();
    snapshotInfo = { version: hashVersion(snapshot), differs: snapshot !== active };
  }
  return NextResponse.json({ doc, snapshotInfo });
}

export async function PUT(request: Request, { params }: RouteParams) {
  const { id } = await params;

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

  await persistDocument(getStorage(), doc, instructionsVersion);
  return NextResponse.json({ doc });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  await getStorage().deleteDocument(id);
  return new NextResponse(null, { status: 204 });
}

/** Move the document into (or out of) a library folder — content untouched. */
export async function PATCH(request: Request, { params }: RouteParams) {
  const { id } = await params;

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
  const doc = await storage.getDocument(id);
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  // folderId null = unfiled. updatedAt is intentionally untouched — moving
  // between folders is organization, not content editing (it would otherwise
  // reshuffle the home "recent" list for no reason).
  const next = { ...doc, folderId: parsed.data.folderId ?? undefined };
  await storage.saveDocument(next);
  return NextResponse.json({ doc: next });
}
