// components/FloatingNextUnanswered.tsx — jump to the first unanswered item
// (2026-08-20, user: "add a floating button to go to first unanswered question
// or para which ever comes first as now i have to scroll a lot to go to bottom
// where i have to continue answering").
//
// Fixed pill, bottom-right STACKED ABOVE the Detailed pill (bottom-16 right-5
// vs its bottom-5 right-5). Shows the live unanswered count; clicking
// smooth-scrolls to the FIRST unanswered block and flashes it (the
// .unanswered-flash keyframe in globals.css). When nothing is left it becomes
// a quiet "All answered ✓" — no interaction, just confirmation.
// What counts as unanswered is MODE-AWARE (see isUnanswered): writing mode =
// qa blocks with an empty answer field; practice mode = qa/paragraph/essay
// blocks with an empty "My answer".
// 2026-08-20 follow-ups: (1) it was practice-mode-only and therefore invisible
// while editing — the Editor now renders it ALWAYS (user: "i cant see the
// floating button...only detailed"); (2) it counted every paragraph's empty
// practice answer as "unanswered", inflating the count and jumping to the
// first paragraph — now only blocks that HAVE an answer field count (user:
// "it is taking me to first question even though it is answered and showing
// worng number of unanswed questions"). The pill has no scroll listener of
// its own — unlike the Detailed/theme pills it is useful at the very top too
// ("where do I continue?").

"use client";

import { useMemo } from "react";
import type { Block } from "@/lib/types";

// 2026-08-20 follow-up (user: "it is taking me to first question even though it
// is answered and showing worng number of unanswed questions"): what counts as
// "unanswered" depends on the mode —
//   * NORMAL (writing) mode: a QA block whose ANSWER field (modelAnswer) is
//     empty. Paragraphs/essays have NO answer field, so they never count —
//     the original version counted their empty practice answer, which
//     inflated the count by every paragraph and made the button jump to the
//     first paragraph ("it is taking me to first thing").
//   * PRACTICE mode: qa / paragraph / essay blocks without a written practice
//     answer (userAnswer) — the "My answer" box.
function isUnanswered(b: Block, practice: boolean): boolean {
  const content = b.content as { userAnswer?: string; modelAnswer?: string };
  if (practice) {
    return (
      (b.type === "qa" || b.type === "paragraph" || b.type === "essay") &&
      !content.userAnswer
    );
  }
  return b.type === "qa" && !content.modelAnswer;
}

export default function FloatingNextUnanswered({
  blocks,
  practiceMode,
}: {
  blocks: Block[];
  practiceMode: boolean;
}) {
  const unanswered = useMemo(
    () => blocks.filter((b) => isUnanswered(b, practiceMode)),
    [blocks, practiceMode],
  );
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

  const jumpTitle = practiceMode
    ? unanswered.length === 1
      ? "Jump to the first unanswered question or paragraph"
      : `Jump to the first unanswered question or paragraph (${unanswered.length} left)`
    : unanswered.length === 1
      ? "Jump to the first question with no answer written"
      : `Jump to the first question with no answer written (${unanswered.length} left)`;

  return (
    <button
      type="button"
      onClick={jump}
      title={jumpTitle}
      className="fixed bottom-16 right-5 z-40 flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-sm font-medium text-blue-700 shadow-lg ring-1 ring-zinc-900/5 transition-colors hover:bg-blue-50"
    >
      ↓ <span className="font-semibold">{unanswered.length}</span> unanswered
    </button>
  );
}
