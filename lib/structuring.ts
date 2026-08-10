// lib/structuring.ts — AI block structuring (M6 redesign).
//
// "Convert with AI" now returns EDITABLE STRUCTURED BLOCKS (not a one-shot
// HTML document): the DeepSeek response is a JSON array of block objects that
// this module parses into real Block[] via createBlock/setBlockContent.
// Tolerant parsing: fences stripped, array located by first "[" … last "]",
// each entry validated with its own zod schema (bad entries dropped), so a
// single malformed item never kills a whole conversion.
//
// The JSON-array transport precedent is the paste-questions flow
// (lib/questions.ts) — this module is the single canonical JSON-extraction
// implementation, and lib/questions.ts reuses extractJsonArray.

import { z } from "zod";
import { stripMarkdownFences } from "./ai";
import type { Block, Suggestion } from "./types";
import { createBlock, setBlockContent } from "./types";
import { suggestionSchema } from "./schemas";

/**
 * Locate the outermost JSON array in the AI response (markdown fences
 * stripped) and parse it. Returns null when no valid array is present.
 */
export function extractJsonArray(raw: string): unknown {
  const cleaned = stripMarkdownFences(raw).trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

const vocabItemSchema = z.object({ term: z.string(), def: z.string() });

/** Sparse per-block shapes the AI may emit (see buildAIPrompt's JSON schema). */
const aiBlockEntrySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("title"), text: z.string() }).loose(),
  z
    .object({ type: z.literal("heading"), text: z.string(), level: z.union([z.literal(2), z.literal(3)]).optional() })
    .loose(),
  z
    .object({
      type: z.literal("paragraph"),
      text: z.string(),
      translation: z.string().optional(),
      analysis: z.string().optional(),
      vocab: z.array(vocabItemSchema).optional(),
      expressions: z.array(vocabItemSchema).optional(),
    })
    .loose(),
  // Essay (design pass 2026-08-10): 1..n paragraphs of ONE continuous text,
  // with ONE shared enrichment set — the AI must never split an essay into
  // per-paragraph parts (that's the q/a antipattern the user flagged).
  z
    .object({
      type: z.literal("essay"),
      paragraphs: z.array(z.string()),
      translation: z.string().optional(),
      analysis: z.string().optional(),
      vocab: z.array(vocabItemSchema).optional(),
      expressions: z.array(vocabItemSchema).optional(),
    })
    .loose(),
  z
    .object({
      type: z.literal("qa"),
      question: z.string(),
      questionTranslation: z.string().optional(),
      grammarNote: z.string().optional(),
      responseLabel: z.string().optional(),
      modelAnswer: z.string().optional(),
      answerTranslation: z.string().optional(),
      analysis: z.string().optional(),
      vocab: z.array(vocabItemSchema).optional(),
      expressions: z.array(vocabItemSchema).optional(),
      // 2026-08-10: AI-reported corrections. .catch([]) keeps the whole qa
      // block alive when ONE suggestion object is malformed (the module's
      // drop-tolerant philosophy — a single bad entry never kills a block).
      suggestions: z.array(suggestionSchema).catch([]).optional(),
    })
    .loose(),
  z.object({ type: z.literal("separator") }).loose(),
]);

/** Trim to undefined when empty. */
function opt(s: string | undefined): string | undefined {
  return s && s.trim() ? s.trim() : undefined;
}

/** Normalize an optional list — undefined when empty. */
function optList(items: { term: string; def: string }[] | undefined): { term: string; def: string }[] | undefined {
  return items && items.length ? items : undefined;
}

/** Normalize AI suggestions (2026-08-10): trim, drop empty entries, cap at 10,
 * assign a stable id. Field mismatches are NOT dropped here — the editor's
 * render-time filter (lib/suggestions.ts) handles them losslessly. */
function optSuggestions(
  items: z.infer<typeof suggestionSchema>[] | undefined,
): Suggestion[] | undefined {
  if (!items) return undefined;
  const cleaned = items
    .map((s) => ({
      kind: s.kind,
      field: s.field,
      original: (s.original ?? "").trim(),
      suggestion: (s.suggestion ?? "").trim(),
      reason: s.reason?.trim() || undefined,
    }))
    .filter((s) => s.original.length > 0 && s.suggestion.length > 0)
    .slice(0, 10)
    .map((s) => ({ id: crypto.randomUUID(), ...s }));
  return cleaned.length ? cleaned : undefined;
}

/**
 * Parse the AI's JSON array into canonical blocks. Entries that fail
 * validation (or are empty) are dropped; zero blocks means the response was
 * not structure-able at all (the route turns that into a 502).
 */
export function parseStructuredBlocksResponse(raw: string): Block[] {
  const parsed = extractJsonArray(raw);
  if (!Array.isArray(parsed)) return [];

  const blocks: Block[] = [];
  for (const entry of parsed) {
    const check = aiBlockEntrySchema.safeParse(entry);
    if (!check.success) continue;
    const d = check.data;
    switch (d.type) {
      case "title":
        if (d.text.trim()) {
          blocks.push(setBlockContent(createBlock("title"), { text: d.text }));
        }
        break;
      case "heading":
        if (d.text.trim()) {
          blocks.push(setBlockContent(createBlock("heading"), { text: d.text, level: d.level ?? 2 }));
        }
        break;
      case "paragraph":
        if (d.text.trim()) {
          blocks.push(
            setBlockContent(createBlock("paragraph"), {
              text: d.text,
              format: "plain",
              translation: opt(d.translation),
              analysis: opt(d.analysis),
              vocab: optList(d.vocab),
              expressions: optList(d.expressions),
            }),
          );
        }
        break;
      case "essay": {
        // Keep only non-empty paragraphs; a fully empty essay is dropped.
        const paragraphs = d.paragraphs.map((p) => p.trim()).filter(Boolean);
        if (paragraphs.length) {
          blocks.push(
            setBlockContent(createBlock("essay"), {
              paragraphs,
              translation: opt(d.translation),
              analysis: opt(d.analysis),
              vocab: optList(d.vocab),
              expressions: optList(d.expressions),
            }),
          );
        }
        break;
      }
      case "qa":
        if (d.question.trim()) {
          blocks.push(
            setBlockContent(createBlock("qa"), {
              question: d.question,
              questionTranslation: opt(d.questionTranslation),
              grammarNote: opt(d.grammarNote),
              responseLabel: opt(d.responseLabel) ?? "RÉPONSE",
              modelAnswer: opt(d.modelAnswer),
              answerTranslation: opt(d.answerTranslation),
              analysis: opt(d.analysis),
              vocab: optList(d.vocab),
              expressions: optList(d.expressions),
              suggestions: optSuggestions(d.suggestions),
              hideTranslation: false,
              hideModelAnswer: false,
            }),
          );
        }
        break;
      case "separator":
        blocks.push(createBlock("separator"));
        break;
    }
  }
  return blocks;
}
