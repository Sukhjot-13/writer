// POST /api/test — AI path of the Test generator (to-do item 5, 2026-08-13).
//
// Receives { docIds, questions?, essays? }, loads the chosen documents,
// serializes them for the AI (serializeBlocksForAI — practice answers never
// included), and asks it to pick/create a test following the ACTIVE
// instructions + a TEST rule. The returned blocks are parsed with the existing
// parseStructuredBlocksResponse, saved as a new document titled
// "Test — <date>", and the new id is returned — the dialog then opens it.
// Missing API key → 400 with an actionable message (FR-30, same as convert/ai).

import { NextResponse } from "next/server";

import { getStorage } from "@/lib/storage";
import { convertWithAI, hasAIKey, AIError } from "@/lib/ai";
import { serializeBlocksForAI } from "@/lib/prompt";
import { parseStructuredBlocksResponse } from "@/lib/structuring";
import { resolveConversionInstructions } from "@/lib/instructions";
import { createDocument } from "@/lib/types";
import { testTitle } from "@/lib/test-generator";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { docIds, questions, essays } = (body ?? {}) as {
    docIds?: unknown;
    questions?: unknown;
    essays?: unknown;
  };
  if (!Array.isArray(docIds) || docIds.length === 0 || !docIds.every((d) => typeof d === "string")) {
    return NextResponse.json({ error: "Select at least one document." }, { status: 400 });
  }

  if (!hasAIKey()) {
    return NextResponse.json(
      { error: "DeepSeek API key missing — add DEEPSEEK_API_KEY to .env.local." },
      { status: 400 },
    );
  }

  try {
    const storage = getStorage();
    const docs = (await Promise.all(docIds.map((id) => storage.getDocument(id)))).filter(
      (d): d is NonNullable<typeof d> => d !== null,
    );
    if (docs.length === 0) {
      return NextResponse.json({ error: "None of the selected documents were found." }, { status: 404 });
    }

    const nQuestions = typeof questions === "number" && questions > 0 ? questions : null;
    const nEssays = typeof essays === "number" && essays > 0 ? essays : null;

    const instructions = await resolveConversionInstructions(storage, null, false);
    const material = docs.map((d) => serializeBlocksForAI(d)).join("\n\n");
    const user = [
      "Create a French practice TEST from the material below.",
      nQuestions
        ? `Include ${nQuestions} questions (pick from the QA material).`
        : "Include 3–5 questions (pick from the QA material).",
      nEssays
        ? `Include ${nEssays} essays (pick from the essay material).`
        : "Include 1–2 essays (pick from the essay material).",
      "Only pick content that is in the material — never invent questions or answers.",
      "Return ONLY a JSON array of block objects, exactly like the format shown above.",
      "",
      "<MATERIAL>",
      material,
      "</MATERIAL>",
    ].join("\n");

    const raw = await convertWithAI(instructions, user);
    const blocks = parseStructuredBlocksResponse(raw);
    if (blocks.length === 0) {
      return NextResponse.json(
        { error: "The AI response could not be parsed as structured blocks — try again." },
        { status: 502 },
      );
    }

    const doc = createDocument(testTitle());
    doc.blocks = blocks;
    // 2026-08-13: a test opens in practice mode — answers hidden until Check.
    doc.opensInPractice = true;
    await storage.saveDocument(doc);
    return NextResponse.json({ id: doc.id }, { status: 201 });
  } catch (e) {
    if (e instanceof AIError) {
      return NextResponse.json({ error: e.message }, { status: e.status ?? 502 });
    }
    console.error("[test]", e);
    return NextResponse.json({ error: "Test generation failed — see server logs." }, { status: 500 });
  }
}
