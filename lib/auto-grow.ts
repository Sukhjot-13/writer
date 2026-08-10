// lib/auto-grow.ts — grow a textarea to fit its content (FR-25, 2026-08-10).
// Extracted from Block.tsx so Q&A cards, paragraph/essay enrichment and the
// practice answer boxes share one implementation. Pure DOM — no React.

/** Callback-ref / event-handler helper: reset to auto, then clamp to content. */
export function autoGrow(el: HTMLTextAreaElement | null): void {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}
