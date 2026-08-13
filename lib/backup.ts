// lib/backup.ts — pure helpers for the library backup ZIP (M5; folder naming
// refined 2026-08-13, to-do item 7). Lives OUTSIDE the route so smoke tests can
// import it without dragging in the PDF renderer.

/** Sanitize a document title into a zip folder name ANY OS can unzip:
 *  characters forbidden in folder names (`/ \ : * ? " < > |`) → `_`,
 *  whitespace collapsed, trailing dots/spaces stripped, length-capped. */
export function sanitizeBackupFolder(title: string): string {
  const clean = title
    .trim()
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "")
    .slice(0, 80);
  return clean || "document";
}

/** Short random suffix (4 chars) — same-titled documents never collide in one zip. */
export function shortCode(): string {
  return Math.random().toString(36).slice(2, 6);
}
