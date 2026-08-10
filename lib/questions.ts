// lib/questions.ts — question import (FR-32/38).
//
// Template mode (offline): a local parser splits numbered lines ("1. …") or
// blank-line-separated items into question-only Q&A blocks.
//
// AI mode: the same list is sent to DeepSeek (instructions file as system
// prompt) which returns structured Q&A content — per question: translation,
// grammar note, model answer, answer translation, analysis, vocab/expressions.
// The response is a JSON array; parsing is tolerant and reuses the canonical
// extractJsonArray from lib/structuring.ts (single JSON-extraction impl).

import type { Block, QaContent } from "./types";
import { createBlock } from "./types";
import { extractJsonArray } from "./structuring";
import { z } from "zod";

/**
 * Split raw pasted text into questions. Supports:
 *  - numbered lines: "1. Question" / "1) Question" (continuation lines merge)
 *  - blank-line-separated paragraphs
 *  - bullet-ish "- Question" lines
 * Empty text → [].
 */
export function splitQuestions(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const items: string[] = [];
  let current: string[] | null = null;
  let currentNumber: number | null = null;

  const push = () => {
    if (current) {
      const q = current.join(" ").replace(/\s+/g, " ").trim();
      if (q) items.push(q);
      current = null;
      currentNumber = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      push(); // blank line ends the current item
      continue;
    }
    const numbered = line.match(/^(\d+)[.)]\s+(.*)$/);
    const bulleted = line.match(/^[-*]\s+(.*)$/);
    if (numbered) {
      push(); // a numbered line always starts a new item
      current = [numbered[2]];
      currentNumber = Number(numbered[1]);
    } else if (bulleted) {
      push(); // a bulleted line always starts a new item
      current = [bulleted[1]];
    } else if (current) {
      current.push(line); // continuation line of the current item
    } else {
      current = [line];
    }
  }
  push();
  return items;
}

/** Turn parsed questions into question-only Q&A blocks (FR-32 template mode). */
export function questionsToQaBlocks(questions: string[]): Extract<Block, { type: "qa" }>[] {
  return questions.map((q) => {
    const block = createBlock("qa") as Extract<Block, { type: "qa" }>;
    block.content = { question: q, responseLabel: "RÉPONSE" };
    return block;
  });
}

/** User-side instruction for the structuring call (returns JSON, not HTML). */
export function buildStructuringUserPrompt(questions: string[]): string {
  const numbered = questions.map((q, i) => `${i + 1}. ${q}`).join("\n");
  return `Structure the following ${questions.length} question(s) into practice Q&A content.

${numbered}

Return ONLY a JSON array (no markdown fences, no explanations). Each element:
{
  "question": "<the question, primary language>",
  "questionTranslation": "<English translation, omit if unknown>",
  "grammarNote": "<short grammar note, omit if unknown>",
  "responseLabel": "RÉPONSE",
  "modelAnswer": "<a good model answer in the primary language>",
  "answerTranslation": "<English translation of the answer, omit if unknown>",
  "analysis": "<short linguistic breakdown, omit if unknown>",
  "vocab": [{"term": "<word>", "def": "<meaning>"}],
  "expressions": [{"term": "<expression>", "def": "<meaning>"}]
}
Fill every field you confidently can; use the same language as the questions for model answers.`;
}

const structuredEntrySchema = z
  .object({
    question: z.string().min(1),
    questionTranslation: z.string().optional(),
    grammarNote: z.string().optional(),
    responseLabel: z.string().optional(),
    modelAnswer: z.string().optional(),
    answerTranslation: z.string().optional(),
    analysis: z.string().optional(),
    vocab: z.array(z.object({ term: z.string(), def: z.string() })).optional(),
    expressions: z.array(z.object({ term: z.string(), def: z.string() })).optional(),
  })
  .loose();

/** Parse the AI's JSON array of structured Q&A entries, tolerantly. */
export function parseStructuredQaResponse(raw: string): QaContent[] {
  const parsed = extractJsonArray(raw);
  if (!Array.isArray(parsed)) return [];

  const results: QaContent[] = [];
  for (const entry of parsed) {
    const check = structuredEntrySchema.safeParse(entry);
    if (check.success) {
      const d = check.data;
      results.push({
        question: d.question,
        questionTranslation: d.questionTranslation || undefined,
        grammarNote: d.grammarNote || undefined,
        responseLabel: d.responseLabel || undefined,
        modelAnswer: d.modelAnswer || undefined,
        answerTranslation: d.answerTranslation || undefined,
        analysis: d.analysis || undefined,
        vocab: d.vocab && d.vocab.length ? d.vocab : undefined,
        expressions: d.expressions && d.expressions.length ? d.expressions : undefined,
        hideTranslation: false,
        hideModelAnswer: false,
      });
    }
  }
  return results;
}
