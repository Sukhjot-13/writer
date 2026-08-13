// lib/test-generator.ts — test document assembly (to-do item 5, 2026-08-13).
//
// The "Test" dialog (home + library) builds a fresh practice document from the
// qa/essay blocks of EXISTING documents. Two paths:
//   - RANDOM path (this module, no AI): pick counts.questions qa blocks +
//     counts.essays essay blocks locally from the chosen docs and assemble a
//     new document. Instant and free.
//   - AI path (POST /api/test): serialize the chosen docs for the AI
//     (serializeBlocksForAI — practice answers never included) and let it
//     pick/create the test. The route reuses the same testTitle().
// Pure + exported so the smoke tests pin the selection rules down.

import { createDocument, setBlockContent } from "./types";
import type { Block, Document } from "./types";

/** Random-average rule when the user gives no count: 3–5 questions. */
export function defaultQuestionCount(): number {
  return 3 + Math.floor(Math.random() * 3); // 3, 4 or 5
}

/** Random-average rule when the user gives no count: 1–2 essays. */
export function defaultEssayCount(): number {
  return 1 + Math.floor(Math.random() * 2); // 1 or 2
}

/** "Test — 13 Aug" — the date helps identify the test at a glance. */
export function testTitle(now = new Date()): string {
  const day = now.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `Test — ${day}`;
}

export interface TestCounts {
  questions?: number | null;
  essays?: number | null;
}

function pickRandom<T>(pool: T[]): T {
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Random path: pick qa + essay blocks from the given documents and assemble a
 * fresh test document. Counts default to the random-average rule (3–5
 * questions, 1–2 essays) and are clamped to what the source documents offer.
 * Practice answers (userAnswer) never carry over — a test starts clean.
 */
export function buildTestDocument(docs: Document[], counts: TestCounts = {}): Document {
  const qaPool: Block[] = [];
  const essayPool: Block[] = [];
  for (const doc of docs) {
    for (const block of doc.blocks) {
      if (block.type === "qa" && block.content.question.trim()) qaPool.push(block);
      else if (block.type === "essay") essayPool.push(block);
    }
  }

  const nQuestions = Math.min(counts.questions ?? defaultQuestionCount(), qaPool.length);
  const nEssays = Math.min(counts.essays ?? defaultEssayCount(), essayPool.length);

  const picked: Block[] = [];
  const usedQa = new Set<string>();
  for (let i = 0; i < nQuestions; i++) {
    const block = pickRandom(qaPool.filter((b) => !usedQa.has(b.id)));
    usedQa.add(block.id);
    picked.push(setBlockContent(block, { ...block.content, userAnswer: undefined }));
  }
  const usedEssays = new Set<string>();
  for (let i = 0; i < nEssays; i++) {
    const block = pickRandom(essayPool.filter((b) => !usedEssays.has(b.id)));
    usedEssays.add(block.id);
    picked.push(setBlockContent(block, { ...block.content, userAnswer: undefined }));
  }

  const doc = createDocument(testTitle());
  doc.blocks = picked;
  return doc;
}
