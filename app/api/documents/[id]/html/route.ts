// GET /api/documents/[id]/html — download the document's HTML (FR-19).
// Returns the saved document.html when present, else generates a fresh one
// from block data (regenerate behavior, FR-20).

import { NextResponse } from "next/server";

import { getStorage } from "@/lib/storage";
import { getTokens } from "@/lib/design-tokens";
import { generateTemplateHTML } from "@/lib/html-template";

type RouteParams = { params: Promise<{ id: string }> };

/** "My Notes" → "My-Notes" — safe attachment filename. */
function safeFilename(title: string): string {
  const clean = title.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return (clean || "document") + ".html";
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const storage = getStorage();
  const doc = await storage.getDocument(id);
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  const saved = await storage.readFile(id, "document.html");
  const html = saved ? saved.toString("utf8") : generateTemplateHTML(doc, await getTokens());

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeFilename(doc.title)}"`,
    },
  });
}
