// lib/save.ts — save flow (FR-17/20): persists a document plus its artifacts.
//
// document.json is always written (the editable truth). document.html and
// document.pdf are written only when a preview exists — the PDF always
// reflects what was previewed (FR-46).

import type { StorageBackend } from "./storage";
import type { Document } from "./types";
import { getTokens } from "./design-tokens";
import { generatePDFBuffer } from "./pdf";

/** Shared by POST /api/documents and PUT /api/documents/[id]. */
export async function persistDocument(
  storage: StorageBackend,
  doc: Document,
  html?: string,
): Promise<void> {
  await storage.saveDocument(doc);
  if (html) {
    await storage.writeFile(doc.id, "document.html", Buffer.from(html, "utf8"));
    const tokens = await getTokens();
    const pdf = await generatePDFBuffer(doc, tokens);
    await storage.writeFile(doc.id, "document.pdf", pdf);
    // FR-23: record which instructions this conversion was made with, so
    // re-converting later can use the same rules (or the latest, per toggle).
    const instructions = await storage.readInstructions();
    await storage.writeFile(doc.id, "instructions.snapshot.md", Buffer.from(instructions, "utf8"));
  }
}
