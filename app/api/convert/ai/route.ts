// POST /api/convert/ai — AI-mode conversion via DeepSeek (FR-8).
// Receives { doc, goal? }, reads the active instructions from storage as the
// system prompt (FR-12/21), calls the DeepSeek client (lib/ai.ts), validates
// the output (FR-10) and returns { html }. Same frontend flow as template
// mode: Convert → preview → then PDF (FR-46).
//
// Missing API key → 400 with an actionable message (FR-30).

import { NextResponse } from "next/server";

import { documentSchema } from "@/lib/schemas";
import { getStorage } from "@/lib/storage";
import { convertWithAI, hasAIKey, AIError } from "@/lib/ai";
import { buildAIPrompt } from "@/lib/prompt";
import { validateAndWrapHtml } from "@/lib/validate";
import { resolveConversionInstructions } from "@/lib/instructions";

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
      {
        error:
          "DeepSeek API key missing — add DEEPSEEK_API_KEY to .env.local, or use Template (offline) mode.",
      },
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
    const html = validateAndWrapHtml(raw);
    return NextResponse.json({ html });
  } catch (e) {
    if (e instanceof AIError) {
      return NextResponse.json({ error: e.message }, { status: e.status ?? 502 });
    }
    console.error("[convert/ai]", e);
    return NextResponse.json({ error: "AI conversion failed — see server logs." }, { status: 500 });
  }
}
