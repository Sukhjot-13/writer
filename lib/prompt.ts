// lib/prompt.ts — prompt assembly + block serialization (FR-12, Plan §9.1).
//
// The user section serializes every block with type markers exactly as specced:
// <TITLE>…</TITLE>, <PARAGRAPH>…</PARAGRAPH>, <QA>…</QA> with per-block
// HIDE_TRANSLATION / HIDE_MODEL_ANSWER flags. This exact format is ALSO what
// "Copy for AI" exposes to external AIs (FR-39), making the copy→AI→paste
// round-trip reliable (FR-42).

import type { Block, Document, QaContent } from "./types";

/** Serialize one QA block in the <QA>…</QA> marker format (FR-12/39). */
function serializeQa(c: QaContent): string {
  const lines = [`QUESTION: ${c.question}`];
  if (c.questionTranslation) lines.push(`QUESTION_TRANSLATION: ${c.questionTranslation}`);
  if (c.grammarNote) lines.push(`GRAMMAR_NOTE: ${c.grammarNote}`);
  if (c.responseLabel) lines.push(`RESPONSE_LABEL: ${c.responseLabel}`);
  if (c.userAnswer) lines.push(`USER_ANSWER: ${c.userAnswer}`);
  if (c.modelAnswer) lines.push(`MODEL_ANSWER: ${c.modelAnswer}`);
  if (c.answerTranslation) lines.push(`ANSWER_TRANSLATION: ${c.answerTranslation}`);
  if (c.analysis) lines.push(`ANALYSIS: ${c.analysis}`);
  if (c.vocab?.length) lines.push(`VOCAB: ${c.vocab.map((v) => `${v.term}|${v.def}`).join("; ")}`);
  if (c.expressions?.length) lines.push(`EXPRESSIONS: ${c.expressions.map((v) => `${v.term}|${v.def}`).join("; ")}`);
  lines.push(`HIDE_TRANSLATION: ${Boolean(c.hideTranslation)}`);
  lines.push(`HIDE_MODEL_ANSWER: ${Boolean(c.hideModelAnswer)}`);
  return lines.join("\n");
}

/** Serialize the whole document's blocks with type markers (FR-12, FR-39). */
export function serializeBlocksForAI(doc: Document): string {
  const parts: string[] = [];
  for (const block of doc.blocks) {
    switch (block.type) {
      case "title":
        parts.push(`<TITLE>${block.content.text}</TITLE>`);
        break;
      case "heading":
        parts.push(`<HEADING LEVEL="${block.content.level === 3 ? 3 : 2}">${block.content.text}</HEADING>`);
        break;
      case "paragraph":
        parts.push(
          `<PARAGRAPH${block.content.format === "markdown" ? ' FORMAT="markdown"' : ""}>${block.content.text}</PARAGRAPH>`,
        );
        break;
      case "separator":
        parts.push("<SEPARATOR/>");
        break;
      case "qa":
        parts.push(`<QA>\n${serializeQa(block.content)}\n</QA>`);
        break;
    }
  }
  return parts.join("\n\n");
}

export interface AIPrompt {
  system: string;
  user: string;
}

/**
 * Build the AI prompt (FR-12): system = the active instructions verbatim;
 * user = optional GOAL line + block serialization. The response instruction
 * demands a complete, valid, self-contained HTML document only.
 */
export function buildAIPrompt(doc: Document, instructions: string, goal?: string): AIPrompt {
  const goalLine = goal?.trim() ? `GOAL: ${goal.trim()}\n\n` : "";
  const user = `${goalLine}${serializeBlocksForAI(doc)}

Convert the content above into a single complete, valid, self-contained HTML document following the system instructions precisely. Return the HTML document only — no markdown fences, no explanations, no surrounding text.`;
  return { system: instructions, user };
}

/** Plain-text flattening for quick sharing (FR-39 third option). */
export function serializePlainText(doc: Document): string {
  const parts: string[] = [];
  for (const block of doc.blocks) {
    switch (block.type) {
      case "title":
        parts.push(block.content.text);
        break;
      case "heading":
        parts.push(block.content.text);
        break;
      case "paragraph":
        parts.push(block.content.text);
        break;
      case "separator":
        parts.push("─".repeat(20));
        break;
      case "qa":
        parts.push(`Q: ${block.content.question}`);
        if (block.content.userAnswer) parts.push(`My answer: ${block.content.userAnswer}`);
        if (block.content.modelAnswer) parts.push(`Answer: ${block.content.modelAnswer}`);
        break;
    }
  }
  return parts.join("\n\n");
}
