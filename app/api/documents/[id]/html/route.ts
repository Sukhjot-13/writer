// GET /api/documents/[id]/html — download the document's HTML (FR-19).
// Returns the imported source when present (doc.sourceHtml field, legacy
// document.html file for older imports), else generates a fresh one from
// block data (regenerate behavior, FR-20).
//
// Owner scope (2026-09-28): session + id validation + owner-filtered lookup. A
// document belonging to another account answers 404.
//
// Response hardening (2026-09-28): this is the route that serves the pasted
// HTML back from the app's OWN origin as text/html, which is what turned an
// unsanitized import into stored XSS. The CSP below is the second layer:
// `default-src 'none'` means nothing loads or runs except the inline stylesheet
// and data: images, so a sanitizer miss cannot reach the network or execute.

import { NextResponse } from "next/server";

import { getStorage } from "@/lib/storage";
import { authorize, isAuthorized } from "@/lib/api-auth";
import { getTokens } from "@/lib/design-tokens";
import { generateTemplateHTML } from "@/lib/html-template";
import { isValidDocumentId } from "@/lib/ids";

type RouteParams = { params: Promise<{ id: string }> };

/** "My Notes" → "My-Notes" — safe attachment filename. */
function safeFilename(title: string): string {
  const clean = title.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return (clean || "document") + ".html";
}

export async function GET(_request: Request, { params }: RouteParams) {
  const auth = await authorize();
  if (!isAuthorized(auth)) return auth;
  const { id } = await params;
  if (!isValidDocumentId(id)) {
    return NextResponse.json({ error: "Invalid document id" }, { status: 400 });
  }

  const storage = getStorage();
  const doc = await storage.getDocument(id, auth.ownerId);
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  // 2026-08-13: imported HTML rides on the document (`sourceHtml`); the
  // legacy document.html file is still read for older imports, else we render
  // fresh from blocks (regenerate behavior, FR-20).
  const html =
    doc.sourceHtml ??
    (await storage.readFile(id, "document.html", auth.ownerId))?.toString("utf8") ??
    generateTemplateHTML(doc, await getTokens());

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeFilename(doc.title)}"`,
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}
