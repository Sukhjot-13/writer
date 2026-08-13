// lib/save.ts — save flow (FR-17/20): persists a document and its snapshot.
//
// 2026-08-13 rework (user: "we can just do on request right... i dont think we
// have to make the pdf html file in advance"): the pre-generated FILE artifacts
// (document.html, document.pdf, instructions.snapshot.md — written to Blob on
// the Mongo backend, which hard-failed without BLOB_READ_WRITE_TOKEN) are GONE.
// document.json is always written (the editable truth). HTML and PDF are
// generated ON DEMAND from current blocks (GET /html + the pdf route both
// render fresh; the backup ZIP generates its own PDF). The one genuinely
// load-bearing artifact — the FR-23 instructions snapshot — now rides ON THE
// DOCUMENT as `doc.instructionsSnapshot` (plain data, works in every backend,
// no Blob). Legacy snapshot/html files (FS + Blob) are still READ as a
// fallback for older documents, never written.

import type { StorageBackend } from "./storage";
import type { Document } from "./types";

/** Shared by POST /api/documents and PUT /api/documents/[id]. */
export async function persistDocument(
  storage: StorageBackend,
  doc: Document,
  instructionsVersion?: string,
): Promise<void> {
  // FR-23: record which instructions this conversion was made with, so
  // re-converting later can use the same rules (or the latest, per toggle).
  // 2026-08-13: stored on the document itself (was a file write).
  if (instructionsVersion) {
    doc.instructionsSnapshot = await storage.readInstructions();
  }
  await storage.saveDocument(doc);
}
