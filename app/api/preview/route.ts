// POST /api/preview — on-demand HTML preview (M6 redesign).
//
// Stateless: the editor sends its CURRENT document (unsaved edits included)
// and gets back the styled HTML that the full-screen preview sheet renders.
// No save required, no artifact written. Rendered from block data via
// generateTemplateHTML + the shared design tokens — the same renderer the
// [id]/html download route uses.

import { NextResponse } from "next/server";

import { documentSchema } from "@/lib/schemas";
import { getTokens } from "@/lib/design-tokens";
import { generateTemplateHTML } from "@/lib/html-template";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // The editor sends { doc, ... } (same wire shape as /pdf and /convert/ai) —
  // unwrap the document from the payload, falling back to the raw body.
  const payload = (body ?? {}) as { doc?: unknown };
  const parsed = documentSchema.safeParse(payload.doc ?? body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid document payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const tokens = await getTokens();
  // A4-sheet preview (2026-08-10 #4): renders the spec's SCREEN design — base
  // font (11.5px) and page margins (18mm) — with true print rules inside
  // @media print, so the preview matches the spec and printing the sheet is
  // still a clean A4 at print size (10.5px, 14mm).
  const html = generateTemplateHTML(parsed.data, tokens, { printMode: true });
  return NextResponse.json({ html });
}
