// components/FloatingNextUnanswered.tsx — jump to the first unanswered item
// (2026-08-20, user: "add a floating button to go to first unanswered question
// or para which ever comes first as now i have to scroll a lot to go to bottom
// where i have to continue answering").
//
// Practice-mode-only fixed pill, bottom-right STACKED ABOVE the Detailed pill
// (bottom-16 right-5 vs its bottom-5 right-5). Shows the live unanswered
// count (qa + paragraph + essay blocks with an empty userAnswer, in document
// order); clicking smooth-scrolls to the FIRST unanswered block and flashes
// it (the .unanswered-flash keyframe in globals.css). When nothing is left it
// becomes a quiet "All answered ✓" — no interaction, just confirmation.
// The pill renders whenever practice mode is on (it is useful at the top of
// the document too — "where do I continue?"), so unlike the Detailed/theme
// pills it has no scroll listener of its own.

"use client";

import { useMemo } from "react";
import type { Block } from "@/lib/types";

/** qa / paragraph / essay blocks without a written practice answer. */
function isUnanswered(b: Block): boolean {
  return (
    (b.type === "qa" || b.type === "paragraph" || b.type === "essay") &&
    !(b.content as { userAnswer?: string }).userAnswer
  );
}

export default function FloatingNextUnanswered({ blocks }: { blocks: Block[] }) {
  const unanswered = useMemo(() => blocks.filter(isUnanswered), [blocks]);
  const first = unanswered[0]?.id ?? null;

  const jump = () => {
    if (!first) return;
    const el = document.querySelector(`[data-block-id="${CSS.escape(first)}"]`);
    if (!el) return;
    // -100px clears the (possibly visible) two-row toolbar.
    const top = Math.max(0, el.getBoundingClientRect().top + window.scrollY - 100);
    window.scrollTo({ top, behavior: "smooth" });
    el.classList.add("unanswered-flash");
    window.setTimeout(() => el.classList.remove("unanswered-flash"), 1500);
  };

  if (unanswered.length === 0) {
    return (
      <div className="fixed bottom-16 right-5 z-40 rounded-full bg-white px-3.5 py-2 text-sm font-medium text-zinc-400 shadow-lg ring-1 ring-zinc-900/5">
        All answered ✓
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={jump}
      title={
        unanswered.length === 1
          ? "Jump to the first unanswered question or paragraph"
          : `Jump to the first unanswered question or paragraph (${unanswered.length} left)`
      }
      className="fixed bottom-16 right-5 z-40 flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-sm font-medium text-blue-700 shadow-lg ring-1 ring-zinc-900/5 transition-colors hover:bg-blue-50"
    >
      ↓ <span className="font-semibold">{unanswered.length}</span> unanswered
    </button>
  );
}
