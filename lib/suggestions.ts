// lib/suggestions.ts — pure logic for AI-reported corrections (2026-08-10).
//
// The AI NEVER edits qa text: it reports mistakes as a suggestions list on the
// qa block, and the USER decides per row. This module owns the three rules:
//   1. visibleSuggestions — a suggestion only shows while its `original` still
//      exists verbatim in the field it targets (cosmetic stale filter: the user
//      may have edited the text since the AI reported the error).
//   2. applySuggestion   — replaces the FIRST occurrence of `original` in the
//      target field with `suggestion` (literal string replace — no regex),
//      removes ONLY that suggestion, and re-filters the survivors against the
//      updated text (an applied edit can invalidate an overlapping suggestion).
//      A stale suggestion (original no longer in the text) only gets dismissed.
//   3. dismissSuggestion — removes the row from the list (a content mutation,
//      so a dismissed suggestion never reappears on re-render).
// Pure functions — no React, no DOM — fully covered by tests/smoke-m6.ts.

import type { QaContent, Suggestion } from "./types";

/** The text a suggestion's `field` targets in the qa content. */
export function targetText(c: QaContent, s: Suggestion): string {
  return s.field === "question" ? c.question : (c.modelAnswer ?? "");
}

/** Suggestions that still match their field's current text (render filter). */
export function visibleSuggestions(c: QaContent): Suggestion[] {
  return (c.suggestions ?? []).filter((s) => targetText(c, s).includes(s.original));
}

/** True when the suggestion's `original` still exists in its target field. */
function stillMatches(c: QaContent, s: Suggestion): boolean {
  return targetText(c, s).includes(s.original);
}

/**
 * Apply ONE suggestion: fix the first occurrence in its field, drop that row,
 * and drop any surviving row whose original no longer matches the updated text.
 * Returns a new content object (the caller renders it via onUpdate).
 */
export function applySuggestion(c: QaContent, s: Suggestion): QaContent {
  const text = targetText(c, s);
  if (!text.includes(s.original)) {
    // Stale — the text changed since the AI reported this. Dismiss only,
    // never touch the user's text.
    return dismissSuggestion(c, s.id);
  }
  const applied = text.replace(s.original, s.suggestion); // first occurrence only
  const next: QaContent = { ...c, [s.field]: applied };
  next.suggestions = (next.suggestions ?? [])
    .filter((x) => x.id !== s.id)
    .filter((x) => stillMatches(next, x));
  return next;
}

/** Remove a suggestion from the list (user dismissed it) — content mutation. */
export function dismissSuggestion(c: QaContent, id: string): QaContent {
  return { ...c, suggestions: (c.suggestions ?? []).filter((x) => x.id !== id) };
}
