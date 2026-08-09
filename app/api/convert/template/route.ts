// POST /api/convert/template — offline template-mode conversion (FR-9).
// Receives { doc }, returns { html } generated deterministically from block
// data + the shared design tokens. No AI, no API key, always available.

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

  const parsed = documentSchema.safeParse(body?.doc ?? body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid document payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const tokens = await getTokens();
  const html = generateTemplateHTML(parsed.data, tokens);
  return NextResponse.json({ html });
}
