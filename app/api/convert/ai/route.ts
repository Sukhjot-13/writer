// POST /api/convert/ai — AI conversion via DeepSeek (FR-8, M6 redesign).
// Receives { doc, goal?, useSnapshot? }, reads the instructions from storage
// as the system prompt (FR-12/21), calls the DeepSeek client (lib/ai.ts), and
// returns EDITABLE STRUCTURED BLOCKS: { blocks, instructionsVersion } parsed
// by lib/structuring.ts — NOT a one-shot HTML document. The editor replaces
// its blocks with the response and re-renders locally; no repeat conversions.
//
// Missing API key → 400 with an actionable message (FR-30).

import { NextResponse } from "next/server";

import { documentSchema } from "@/lib/schemas";
import { getStorage } from "@/lib/storage";
import { convertWithAI, hasAIKey, AIError } from "@/lib/ai";
import { buildAIPrompt } from "@/lib/prompt";
import { parseStructuredBlocksResponse } from "@/lib/structuring";
import { resolveConversionInstructions, hashVersion } from "@/lib/instructions";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const payload = (body ?? {}) as { doc?: unknown; goal?: unknown; useSnapshot?: unknown };
  const parsed = documentSchema.safeParse(payload.doc ?? body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid document payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (!hasAIKey()) {
    return NextResponse.json(
      { error: "DeepSeek API key missing — add DEEPSEEK_API_KEY to .env.local." },
      { status: 400 },
    );
  }

  const goal = typeof payload.goal === "string" && payload.goal.trim() ? payload.goal.trim() : undefined;
  const useSnapshot = payload.useSnapshot === true;

  try {
    const storage = getStorage();
    // FR-23: with the toggle on, convert with the rules this document was made
    // with (its instructions.snapshot.md) instead of the latest active file.
    const instructions = await resolveConversionInstructions(storage, parsed.data.id, useSnapshot);
    const { system, user } = buildAIPrompt(parsed.data, instructions, goal);
    const raw = await convertWithAI(system, user);
    const blocks = parseStructuredBlocksResponse(raw);
    if (blocks.length === 0) {
      // Old HTML-era instructions snapshots make the AI return HTML instead of
      // the JSON block array — surface that as an actionable 502 (no data loss).
      return NextResponse.json(
        {
          error:
            "The AI response could not be parsed as structured blocks. If the snapshot-rules toggle is on, try disabling it (this document's saved rules may be from before block conversion).",
        },
        { status: 502 },
      );
    }
    return NextResponse.json({ blocks, instructionsVersion: hashVersion(instructions) });
  } catch (e) {
    if (e instanceof AIError) {
      return NextResponse.json({ error: e.message }, { status: e.status ?? 502 });
    }
    console.error("[convert/ai]", e);
    return NextResponse.json({ error: "AI conversion failed — see server logs." }, { status: 500 });
  }
}
