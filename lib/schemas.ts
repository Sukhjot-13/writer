// lib/schemas.ts — zod schemas for API payload validation (Plan §3, §10).
// Mirrors lib/types.ts; `loose()` on content objects keeps unknown/future fields
// intact through save/load round-trips (blocks gain fields in later milestones).

import { z } from "zod";

const tagSchema = z.array(z.string());

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
