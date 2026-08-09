// GET /api/documents/[id]/pdf — download the document's A4 PDF (FR-14/15/19).
//
// The PDF is always generated from block data (document.json) via
// @react-pdf/renderer — never from HTML, no Chrome anywhere. Accepts an
// optional ?practice=true query (used in M2 for practice-mode PDFs).

import { NextResponse } from "next/server";

import { getStorage } from "@/lib/storage";
import { getTokens } from "@/lib/design-tokens";
import { generatePDFBuffer } from "@/lib/pdf";

type RouteParams = { params: Promise<{ id: string }> };

/** "My Notes" → "My-Notes" — safe attachment filename. */
function safeFilename(title: string): string {
  const clean = title.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return (clean || "document") + ".pdf";
}

export async function GET(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const storage = getStorage();
  const doc = await storage.getDocument(id);
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  const { searchParams } = new URL(request.url);
  const practice = searchParams.get("practice") === "true";

  const tokens = await getTokens();
  const buffer = await generatePDFBuffer(doc, tokens, { practice });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeFilename(doc.title)}"`,
    },
  });
}
