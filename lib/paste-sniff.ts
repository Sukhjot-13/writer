// lib/paste-sniff.ts — smart-paste kind detection (to-do item 9, 2026-08-13).
//
// The "Smart paste" box is ONE textarea that works for anything: it sniffs the
// pasted content and routes to the right importer. Pure + exported so the smoke
// tests pin the rules down:
//   starts with "["  → blocks  (the JSON array from Copy for AI — PasteBlocks)
//   starts with "<"  → html    (markup from an external AI — PasteHtml)
//   anything else    → questions (a plain question list — PasteQuestions)
// The three dedicated Paste buttons stay as shortcuts (to-do item 9).

export type PasteKind = "blocks" | "html" | "questions";

export function sniffPasteKind(text: string): PasteKind {
  const t = text.trimStart();
  if (t.startsWith("[")) return "blocks";
  if (t.startsWith("<")) return "html";
  return "questions";
}
