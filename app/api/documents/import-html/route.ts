// POST /api/documents/import-html — paste HTML back from any external AI (FR-40).
//
// Receives { html, title? } → SANITIZES + wraps per FR-10 → creates a new
// document (source: "external-html", empty blocks — HTML is the source) →
// saves the document with the wrapped HTML on it as `sourceHtml` (2026-08-13:
// was a document.html FILE write, which required Vercel Blob) → returns
// { doc, html } so the editor can preview immediately and continue the normal
// pipeline (FR-17–20).
//
// 2026-09-28 (stored XSS): `validateAndWrapHtml` only stripped code fences, so
// `<script>`, `onerror=`, `<base>` and `javascript:` hrefs were stored verbatim
// and later served from the app's own origin as text/html by
// GET /api/documents/[id]/html. Everything is now scrubbed by lib/sanitize.ts
// on the way IN (and the response route carries a CSP as the second layer).
//
// The document is owner-scoped and its id is server-generated, so a pasted body
// cannot land on top of an existing document.
//
// Best-effort "Parse to blocks" (FR-41) lands in M5 via lib/html-to-blocks.

import { NextResponse } from "next/server";
import { z } from "zod";

import { getStorage } from "@/lib/storage";
import { authorize, isAuthorized } from "@/lib/api-auth";
import { createDocument } from "@/lib/types";
import { validateAndWrapHtml } from "@/lib/validate";
import { sanitizeImportedHtml } from "@/lib/sanitize";
import { persistDocument } from "@/lib/save";

const payloadSchema = z.object({
  html: z.string().min(1).max(2_000_000),
  title: z.string().max(300).optional(),
});

/** Extract a readable title from HTML <title> or the first <h1>. */
export function titleFromHtml(html: string): string | null {
  const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleTag?.[1]?.trim()) return titleTag[1].trim().slice(0, 120);
  const h1 = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (h1?.[1]?.trim()) return h1[1].trim().slice(0, 120);
  return null;
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

  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Paste some HTML to import" }, { status: 400 });
  }

  const { html, title } = parsed.data;
  // Sanitize BEFORE wrapping: the wrapper only adds the doctype/head/body shell,
  // so anything dangerous that survived the scrub is still dangerous afterwards.
  const wrapped = validateAndWrapHtml(sanitizeImportedHtml(html));

  const doc = createDocument(title || titleFromHtml(wrapped) || "Imported document");
  doc.source = "external-html"; // blocks stay empty — HTML is the source (FR-40)

  const storage = getStorage();
  doc.ownerId = auth.ownerId; // from the session, never from the body
  doc.sourceHtml = wrapped; // the HTML IS the source (FR-40) — rides on the doc
  await persistDocument(storage, doc);

  return NextResponse.json({ doc, html: wrapped }, { status: 201 });
}
