// /api/documents/[id] — get (GET), update/save (PUT), delete (DELETE).
// PUT accepts { doc, html? } — when a preview is present, document.html and
// document.pdf are persisted alongside document.json (FR-17, FR-46).

import { NextResponse } from "next/server";

import { getStorage } from "@/lib/storage";
import { saveDocumentPayloadSchema } from "@/lib/schemas";
import { persistDocument } from "@/lib/save";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const doc = await getStorage().getDocument(id);
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });
  return NextResponse.json({ doc });
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
