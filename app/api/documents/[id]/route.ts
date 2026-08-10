// /api/documents/[id] — get (GET), update/save (PUT), delete (DELETE).
// PUT accepts { doc, html? } — when a preview is present, document.html and
// document.pdf are persisted alongside document.json (FR-17, FR-46).

import { NextResponse } from "next/server";

import { getStorage } from "@/lib/storage";
import { saveDocumentPayloadSchema } from "@/lib/schemas";
import { persistDocument } from "@/lib/save";
import { readDocumentSnapshot, hashVersion } from "@/lib/instructions";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const doc = await getStorage().getDocument(id);
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });
  // FR-23: tell the editor whether this document has a recorded instructions
  // snapshot and whether it differs from the active rules (drives the
  // "convert with snapshot rules" toggle).
  const storage = getStorage();
  const snapshot = await storage.readFile(id, "instructions.snapshot.md");
  let snapshotInfo: { version: string; differs: boolean } | null = null;
  if (snapshot) {
    const content = snapshot.toString("utf8");
    const active = await storage.readInstructions();
    snapshotInfo = { version: hashVersion(content), differs: content !== active };
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

  const { doc, html } = parsed.data;
  if (doc.id !== id) {
    return NextResponse.json(
      { error: "Document id in payload does not match route id" },
      { status: 400 },
    );
  }

  await persistDocument(getStorage(), doc, html);
  return NextResponse.json({ doc });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  await getStorage().deleteDocument(id);
  return new NextResponse(null, { status: 204 });
}
