// POST /api/convert/structure — AI structuring of pasted questions (FR-32, AI mode).
// Receives { questions: string[] }, sends the list to DeepSeek with the active
// instructions as system prompt, parses the JSON response into Q&A content
// blocks (translations, grammar notes, model answers, vocab, expressions).
// Template mode of the same flow happens fully client-side (lib/questions.ts).

import { NextResponse } from "next/server";
import { z } from "zod";

import { getStorage } from "@/lib/storage";
import { convertWithAI, hasAIKey, AIError } from "@/lib/ai";
import { buildStructuringUserPrompt, parseStructuredQaResponse } from "@/lib/questions";

const payloadSchema = z.object({
  questions: z.array(z.string().min(1)).min(1).max(200),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Paste at least one question" }, { status: 400 });
  }

  if (!hasAIKey()) {
    return NextResponse.json(
      {
        error: "DeepSeek API key missing — add DEEPSEEK_API_KEY to .env.local, or use Parse locally (offline).",
      },
      { status: 400 },
    );
  }

  try {
    const storage = getStorage();
    const instructions = await storage.readInstructions();
    const user = buildStructuringUserPrompt(parsed.data.questions);
    const raw = await convertWithAI(instructions, user);
    const blocks = parseStructuredQaResponse(raw);
    if (blocks.length === 0) {
      return NextResponse.json(
        { error: "The AI response could not be parsed — try again or use Parse locally (offline)." },
        { status: 502 },
      );
    }
    return NextResponse.json({ blocks });
  } catch (e) {
    if (e instanceof AIError) {
      return NextResponse.json({ error: e.message }, { status: e.status ?? 502 });
    }
    console.error("[convert/structure]", e);
    return NextResponse.json({ error: "AI structuring failed — see server logs." }, { status: 500 });
  }
}
