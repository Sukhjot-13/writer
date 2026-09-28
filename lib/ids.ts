// lib/ids.ts — id shape validation for route params (2026-09-28).
//
// Route params arrive from the URL and end up in a Mongo `_id`, a filesystem
// path (the FS backend) and — before the 2026-09-28 fix — a Mongo `$regex`.
// Every one of those needs a closed character class, so the shape is validated
// ONCE here and rejected with 400 at the edge of each route.
//
// The document id is the single most dangerous one: an unescaped `*` in
// `find({_id: {$regex: "^*/"}})` matches EVERY file row in the store, which
// turned DELETE /api/documents/%2A into a whole-store wipe.

/** uuids (createDocument) and the legacy filesystem ids both fit. */
export const DOCUMENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** Instructions history versions are sha1 prefixes / ISO stamps. */
export const VERSION_PATTERN = /^[A-Za-z0-9_.:-]{1,64}$/;

export function isValidDocumentId(id: unknown): id is string {
  return typeof id === "string" && DOCUMENT_ID_PATTERN.test(id);
}

export function isValidVersion(version: unknown): version is string {
  return typeof version === "string" && VERSION_PATTERN.test(version);
}
