// POST /api/documents/import-html — paste HTML back from any external AI (FR-40).
//
// Receives { html, title? } → validates/wraps per FR-10 → creates a new
// document (source: "external-html", empty blocks — HTML is the source) →
// persists document.html + document.pdf → returns { doc, html } so the editor
// can preview immediately and continue the normal pipeline (FR-17–20).
//
// Best-effort "Parse to blocks" (FR-41) lands in M5 via lib/html-to-blocks.

import { NextResponse } from "next/server";
import { z } from "zod";

import { getStorage } from "@/lib/storage";
import { createDocument } from "@/lib/types";
import { validateAndWrapHtml } from "@/lib/validate";
import { persistDocument } from "@/lib/save";
import { getTokens } from "@/lib/design-tokens";

const payloadSchema = z.object({
  html: z.string().min(1),
  title: z.string().optional(),
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
  const wrapped = validateAndWrapHtml(html);

  const doc = createDocument(title || titleFromHtml(wrapped) || "Imported document");
  doc.source = "external-html"; // blocks stay empty — HTML is the source (FR-40)

  const storage = getStorage();
  const tokens = await getTokens();
  await persistDocument(storage, doc, wrapped);

  return NextResponse.json({ doc, html: wrapped }, { status: 201 });
}
