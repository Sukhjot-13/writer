// POST /api/convert/template — offline template-mode conversion (FR-9/23).
// Receives { doc, useSnapshot? }, returns { html } generated deterministically
// from block data + design tokens. No AI, no API key, always available.
// With useSnapshot: true, tokens are parsed from the document's own
// instructions.snapshot.md so re-converting an old document keeps the exact
// rules it was made with (FR-23).

import { NextResponse } from "next/server";

import { documentSchema } from "@/lib/schemas";
import { getTokens, getTokensFromInstructions } from "@/lib/design-tokens";
import { generateTemplateHTML } from "@/lib/html-template";
import { getStorage } from "@/lib/storage";
import { resolveConversionInstructions } from "@/lib/instructions";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const payload = (body ?? {}) as { doc?: unknown; useSnapshot?: unknown };
  const parsed = documentSchema.safeParse(payload.doc ?? body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid document payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const useSnapshot = payload.useSnapshot === true;
  const tokens = useSnapshot
    ? getTokensFromInstructions(
        await resolveConversionInstructions(getStorage(), parsed.data.id, true),
      )
    : await getTokens();

  const html = generateTemplateHTML(parsed.data, tokens);
  return NextResponse.json({ html });
}
