// POST /api/documents/[id]/regenerate — FR-20: re-convert a document from its
// JSON (template mode) and re-render the PDF without any manual steps.
//
// Reads the document from storage, regenerates styled HTML from block data via
// the template renderer, and persists document.html + document.pdf alongside
// document.json. Uses the same persist path as save so artifacts stay in sync.

import { NextResponse } from "next/server";

import { getStorage } from "@/lib/storage";
import { getTokens } from "@/lib/design-tokens";
import { generateTemplateHTML } from "@/lib/html-template";
import { persistDocument } from "@/lib/save";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const storage = getStorage();
  const doc = await storage.getDocument(id);
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  const tokens = await getTokens();
  const html = generateTemplateHTML(doc, tokens);
  await persistDocument(storage, doc, html);

  return NextResponse.json({ ok: true });
}
