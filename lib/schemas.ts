// lib/schemas.ts — zod schemas for API payload validation (Plan §3, §10).
// Mirrors lib/types.ts; `loose()` on content objects keeps unknown/future fields
// intact through save/load round-trips (blocks gain fields in later milestones).

import { z } from "zod";

const tagSchema = z.array(z.string());

/**
 * AI-reported correction for a qa block (2026-08-10) — see lib/types.ts.
 * `id` is optional on the wire (AI output has no ids — lib/structuring.ts
 * assigns them) but the transform guarantees one, so the inferred type IS a
 * Suggestion and saved docs round-trip with their ids intact.
 * Tolerance: per-field .catch() degrades a malformed entry to an empty
 * original/suggestion, which lib/structuring.ts drops — ONE bad suggestion
 * never kills the list or the qa block.
 */
export const suggestionSchema = z
  .object({
    id: z.string().optional(),
    kind: z.enum(["spelling", "grammar", "punctuation"]).default("spelling"),
    field: z.enum(["question", "modelAnswer"]).catch("modelAnswer"),
    original: z.string().min(1).max(500).catch(""), // verbatim substring as written
    suggestion: z.string().min(1).max(500).catch(""), // corrected replacement
    reason: z.string().optional(),
  })
  .transform((s) => ({ ...s, id: s.id ?? crypto.randomUUID() }));

const qaContentSchema = z
  .object({
    question: z.string(),
    questionTranslation: z.string().optional(),
    grammarNote: z.string().optional(),
    responseLabel: z.string().optional(),
    userAnswer: z.string().optional(),
    modelAnswer: z.string().optional(),
    answerTranslation: z.string().optional(),
    analysis: z.string().optional(),
    vocab: z.array(z.object({ term: z.string(), def: z.string() })).optional(),
    expressions: z.array(z.object({ term: z.string(), def: z.string() })).optional(),
    hideTranslation: z.boolean().optional(),
    hideModelAnswer: z.boolean().optional(),
    suggestions: z.array(suggestionSchema).optional(), // AI corrections (2026-08-10)
  })
  .loose();

export const blockSchema = z.discriminatedUnion("type", [
  z.object({
    id: z.string(),
    type: z.literal("title"),
    tags: tagSchema,
    content: z.object({ text: z.string() }).loose(),
  }),
  z.object({
    id: z.string(),
    type: z.literal("heading"),
    tags: tagSchema,
    content: z
      .object({ text: z.string(), level: z.union([z.literal(2), z.literal(3)]).optional() })
      .loose(),
  }),
  z.object({
    id: z.string(),
    type: z.literal("paragraph"),
    tags: tagSchema,
    content: z
      .object({
        text: z.string(),
        format: z.enum(["plain", "markdown"]).optional(),
        translation: z.string().optional(),
        analysis: z.string().optional(),
        vocab: z.array(z.object({ term: z.string(), def: z.string() })).optional(),
        expressions: z.array(z.object({ term: z.string(), def: z.string() })).optional(),
        userAnswer: z.string().optional(), // practice answer (M6, FR-33 parity with qa)
      })
      .loose(),
  }),
  // Essay (design pass 2026-08-10): a continuous piece of writing (1..n
  // paragraphs) with ONE shared enrichment set + ONE practice answer — the
  // user writes the essay as a single thing, never per-paragraph.
  z.object({
    id: z.string(),
    type: z.literal("essay"),
    tags: tagSchema,
    content: z
      .object({
        heading: z.string().optional(), // 2026-08-10 #5: optional essay title
        paragraphs: z.array(z.string()),
        translation: z.string().optional(),
        analysis: z.string().optional(),
        vocab: z.array(z.object({ term: z.string(), def: z.string() })).optional(),
        expressions: z.array(z.object({ term: z.string(), def: z.string() })).optional(),
        userAnswer: z.string().optional(), // practice answer (single, whole essay)
      })
      .loose(),
  }),
  z.object({ id: z.string(), type: z.literal("qa"), tags: tagSchema, content: qaContentSchema }),
  z.object({
    id: z.string(),
    type: z.literal("separator"),
    tags: tagSchema,
    content: z.object({}).loose(),
  }),
]);

export const documentSchema = z.object({
  id: z.string(),
  title: z.string(),
  ownerId: z.string().nullable().optional(),
  source: z.enum(["editor", "external-html"]),
  createdAt: z.string(),
  updatedAt: z.string(),
  tags: z.array(z.string()),
  blocks: z.array(blockSchema),
  practice: z
    .object({ hideTranslations: z.boolean(), hideModelAnswers: z.boolean() })
    .optional(),
});

/** Payload accepted by document create/update routes: { doc, html?, instructionsVersion? }. */
export const saveDocumentPayloadSchema = z.object({
  doc: documentSchema,
  html: z.string().optional(),
  instructionsVersion: z.string().optional(),
});

/** Preview/PDF field toggles (2026-08-10): `true` = that enrichment section is
 *  hidden. Optional object — absent means nothing hidden. Shared by the preview
 *  route and the PDF route (POST body `{ doc, hidden, emptyLines }`). */
export const hiddenOptionsSchema = z
  .object({
    translations: z.boolean().optional(),
    analyses: z.boolean().optional(),
    vocab: z.boolean().optional(),
    modelAnswers: z.boolean().optional(),
  })
  .optional();
