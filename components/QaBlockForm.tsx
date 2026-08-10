// components/QaBlockForm.tsx — Q&A card editor (M6 redesign, FR-4/26/33/34/37).
//
// Two modes driven by the Practice master key:
//   mode="normal"   — full editing. Question + ALWAYS-visible reference answer
//                     ("Answer"), plus optional extras behind "＋ chips"
//                     (question translation, grammar note, answer translation,
//                     analysis, vocab, expressions).
//   mode="practice" — question shown read-only with a "My answer" box to write
//                     into. Once the user checks answers, a green read-only
//                     "Model answer" box appears alongside their own answer.
// The two answers are separate fields (userAnswer = practice attempt,
// modelAnswer = reference), so practice never touches the reference data.
//
// 2026-08-10 M7 round 5 (user feedback): the 👁/🙈 hide toggles on the question
// translation and the answer are GONE — visibility now lives in the preview
// sheet's per-field checkboxes (render-time, no data mutation; the legacy
// hideTranslation/hideModelAnswer flags still exist in the data model and the
// renderers still honor them for older documents). The "Answer label"
// (responseLabel) field is GONE too — it is always "RÉPONSE", so there is no
// reason to edit it; the renderers keep using the stored value (default
// "RÉPONSE").

"use client";

import { useEffect, useState } from "react";
import type { QaContent } from "@/lib/types";
import { inputCls, labelCls, RowEditor } from "./RowEditor";
import AutoGrowTextarea from "./AutoGrowTextarea"; // 2026-08-10: auto-grow
import {
  applySuggestion,
  dismissSuggestion,
  visibleSuggestions,
} from "@/lib/suggestions"; // 2026-08-10: AI corrections — never auto-applied

type QaField =
  | "questionTranslation"
  | "grammarNote"
  | "answerTranslation"
  | "analysis"
  | "vocab"
  | "expressions";

// Display order (2026-08-10, user request): question → translation → analysis →
// answer → answer translation → grammar note → vocab → expressions.
// (2026-08-10 M7 round 5: the "Answer label" entry is gone — responseLabel is
// always "RÉPONSE" and no longer editable.)
const OPTIONAL_FIELDS: { key: QaField; label: string }[] = [
  { key: "questionTranslation", label: "Question translation" },
  { key: "analysis", label: "Analysis" },
  { key: "answerTranslation", label: "Answer translation" },
  { key: "grammarNote", label: "Grammar note" },
  { key: "vocab", label: "Vocabulary" },
  { key: "expressions", label: "Expressions" },
];

/** Which optional fields currently have content (auto-reveal on load). */
function usedFields(c: QaContent): Set<QaField> {
  const used = new Set<QaField>();
  if (c.questionTranslation) used.add("questionTranslation");
  if (c.grammarNote) used.add("grammarNote");
  if (c.answerTranslation) used.add("answerTranslation");
  if (c.analysis) used.add("analysis");
  if (c.vocab?.length) used.add("vocab");
  if (c.expressions?.length) used.add("expressions");
  return used;
}

// AI-reported corrections (2026-08-10). The AI never edits text — each row has
// an Apply button that changes ONLY that suggestion (first occurrence) and a ✕
// that dismisses it. visibleSuggestions() hides rows whose text the user has
// already changed; dismissed rows are removed from content and stay gone.
function SuggestionList({
  content,
  onUpdate,
}: {
  content: QaContent;
  onUpdate: (content: QaContent) => void;
}) {
  const suggestions = visibleSuggestions(content);
  if (suggestions.length === 0) return null;
  return (
    <div className="mt-1.5 space-y-1.5 rounded-md border border-amber-200 bg-amber-50/60 p-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">
        Suggested corrections — nothing changes until you apply
      </p>
      {suggestions.map((s) => (
        <div key={s.id} className="flex items-start gap-2 text-[12px] leading-snug">
          <span
            className={`mt-0.5 shrink-0 rounded px-1 py-px text-[9px] font-semibold uppercase tracking-wide ${
              s.kind === "spelling"
                ? "bg-amber-100 text-amber-800"
                : s.kind === "grammar"
                  ? "bg-orange-100 text-orange-800"
                  : "bg-rose-100 text-rose-800"
            }`}
          >
            {s.kind}
          </span>
          <span className="mt-0.5 shrink-0 text-zinc-400">
            {s.field === "question" ? "Question" : "Answer"}:
          </span>
          <span className="mt-0.5 line-through decoration-zinc-400 text-zinc-400">
            {s.original}
          </span>
          <span className="mt-0.5 text-zinc-400">→</span>
          <span className="mt-0.5 font-medium text-emerald-700">{s.suggestion}</span>
          {s.reason && <span className="mt-0.5 italic text-zinc-400">{s.reason}</span>}
          <button
            type="button"
            onClick={() => onUpdate(applySuggestion(content, s))}
            title="Apply only this correction to the text"
            className="ml-auto shrink-0 rounded-md border border-emerald-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-50"
          >
            Apply
          </button>
          <button
            type="button"
            onClick={() => onUpdate(dismissSuggestion(content, s.id))}
            title="Dismiss this suggestion"
            aria-label="Dismiss suggestion"
            className="shrink-0 rounded p-0.5 text-zinc-400 transition-colors hover:text-red-500"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

interface QaBlockFormProps {
  content: QaContent;
  autoFocus?: boolean;
  mode: "normal" | "practice";
  checked: boolean; // practice only: reveal the model answer
  // 2026-08-10 M7 round 4: "detailed" — false = focus mode (question + answer
  // only, nothing else, the default); true = enrichment revealed.
  detailed?: boolean;
  onUpdate: (content: QaContent) => void;
}

export default function QaBlockForm({ content, autoFocus, mode, checked, detailed, onUpdate }: QaBlockFormProps) {
  const [revealed, setRevealed] = useState<Set<QaField>>(() => usedFields(content));

  useEffect(() => {
    // A field that gained content externally (AI import) reveals itself.
    setRevealed((prev) => new Set([...prev, ...usedFields(content)]));
  }, [content]);

  const reveal = (key: QaField) => setRevealed((prev) => new Set([...prev, key]));

  const hideField = (key: QaField) => {
    setRevealed((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    // Clear the field's data so output matches what's hidden.
    const next = { ...content };
    if (key === "vocab") next.vocab = undefined;
    else if (key === "expressions") next.expressions = undefined;
    else (next as Record<string, unknown>)[key] = undefined;
    onUpdate(next);
  };

  const set = <K extends keyof QaContent>(key: K, value: QaContent[K]) =>
    onUpdate({ ...content, [key]: value });

  const is = (key: QaField) => revealed.has(key);

  if (mode === "practice") {
    return (
      <div className="mt-1 space-y-3 rounded-xl border border-blue-100 bg-blue-50/40 p-3.5">
        <div>
          <label className={labelCls}>Question</label>
          <input
            readOnly
            tabIndex={-1}
            className={`${inputCls} cursor-default font-medium text-zinc-900`}
            value={content.question}
          />
        </div>

        <div>
          <label className={labelCls}>My answer</label>
          <AutoGrowTextarea
            className={`${inputCls} border-dashed border-blue-200`}
            rows={3}
            value={content.userAnswer ?? ""}
            placeholder="Write your own answer…"
            onChange={(e) => set("userAnswer", e.target.value)}
          />
        </div>

        {checked && (
          <div>
            <label className={labelCls}>
              <span className="text-emerald-700">Model answer</span>
            </label>
            {content.modelAnswer ? (
              <div className="rounded-md border-l-[3px] border-emerald-600 bg-emerald-50 px-2.5 py-1.5 text-[14px] leading-relaxed text-zinc-800">
                {content.modelAnswer}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-emerald-300 px-2.5 py-1.5 text-[13px] text-zinc-400">
                No model answer saved for this question.
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Focus mode (2026-08-10, user request; inverted 2026-08-10 M7 round 4):
  // the default state — ONLY the main content, the question and the answer.
  // No translations, no analysis, no vocab, no suggestions, no chips. Same
  // fields, nothing hidden data-wise. The "Detailed" toolbar toggle turns
  // this off.
  if (!detailed) {
    return (
      <div className="mt-1 space-y-3 rounded-xl border border-zinc-200 bg-zinc-50/70 p-3.5">
        <div>
          <label className={labelCls}>Question</label>
          <input
            autoFocus={autoFocus}
            className={`${inputCls} font-medium text-zinc-900`}
            value={content.question}
            placeholder="Type the question in the primary language…"
            onChange={(e) => set("question", e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls}>Answer</label>
          <AutoGrowTextarea
            className={inputCls}
            rows={2}
            value={content.modelAnswer ?? ""}
            placeholder="Reference answer… (leave empty for a question without a provided answer)"
            onChange={(e) => set("modelAnswer", e.target.value)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mt-1 space-y-3 rounded-xl border border-zinc-200 bg-zinc-50/70 p-3.5">
      {/* Question — required (FR-4) */}
      <div>
        <label className={labelCls}>Question</label>
        <input
          autoFocus={autoFocus}
          className={`${inputCls} font-medium text-zinc-900`}
          value={content.question}
          placeholder="Type the question in the primary language…"
          onChange={(e) => set("question", e.target.value)}
        />
      </div>

      {/* 2026-08-10 field order (user request, mirrored in preview + PDF):
          question → translation → analysis → answer → answer translation → …
          2026-08-10 M7 round 5: the 👁/🙈 hide toggle is GONE — visibility is
          controlled in the preview sheet. */}
      {is("questionTranslation") && (
        <div>
          <div className={labelCls}>
            <span>Question translation</span>
            <button
              type="button"
              onClick={() => hideField("questionTranslation")}
              className="ml-auto rounded p-0.5 text-zinc-300 transition-colors hover:text-red-500"
              title="Remove field"
            >
              ✕
            </button>
          </div>
          <input
            className={inputCls}
            value={content.questionTranslation ?? ""}
            placeholder="English translation of the question…"
            onChange={(e) => set("questionTranslation", e.target.value)}
          />
        </div>
      )}

      {is("analysis") && (
        <div>
          <div className={labelCls}>
            <span>Analysis</span>
            <button
              type="button"
              onClick={() => hideField("analysis")}
              className="ml-auto text-zinc-300 hover:text-red-500"
              title="Remove field"
            >
              ✕
            </button>
          </div>
          <AutoGrowTextarea
            className={inputCls}
            rows={2}
            value={content.analysis ?? ""}
            placeholder="Why is this answer correct — grammar or vocabulary it uses…"
            onChange={(e) => set("analysis", e.target.value)}
          />
        </div>
      )}

      {/* Reference answer — always visible (M6: one answer field, clean cards).
          2026-08-10 M7 round 5: the 👁/🙈 hide toggle is GONE — visibility is
          controlled in the preview sheet. */}
      <div>
        <div className={labelCls}>
          <span>Answer</span>
        </div>
        <AutoGrowTextarea
          className={inputCls}
          rows={2}
          value={content.modelAnswer ?? ""}
          placeholder="Reference answer… (leave empty for a question without a provided answer)"
          onChange={(e) => set("modelAnswer", e.target.value)}
        />
        {content.userAnswer ? (
          <p className="mt-1 text-[11px] text-zinc-400">
            A practice answer is saved for this question — turn on Practice to view or edit it.
          </p>
        ) : null}
        {/* 2026-08-10: AI-reported corrections — user applies or dismisses each */}
        <SuggestionList content={content} onUpdate={onUpdate} />
      </div>

      {is("answerTranslation") && (
        <div>
          <div className={labelCls}>
            <span>Answer translation</span>
            <button
              type="button"
              onClick={() => hideField("answerTranslation")}
              className="ml-auto text-zinc-300 hover:text-red-500"
              title="Remove field"
            >
              ✕
            </button>
          </div>
          <input
            className={inputCls}
            value={content.answerTranslation ?? ""}
            placeholder="English translation of the answer…"
            onChange={(e) => set("answerTranslation", e.target.value)}
          />
        </div>
      )}

      {/* Optional-field chip menu (FR-4/26: sections appear once used) — SUPER
          subtle (2026-08-10): 99% of enrichment comes from the AI, so the chips
          are invisible until the card is hovered or focused, then faint. */}
      {OPTIONAL_FIELDS.filter((f) => !is(f.key)).length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
          <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-300">Add:</span>
          {OPTIONAL_FIELDS.filter((f) => !is(f.key)).map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => reveal(f.key)}
              className="rounded-full border border-dashed border-zinc-200 bg-transparent px-2 py-0.5 text-[10px] text-zinc-400 transition-colors hover:border-emerald-300 hover:text-emerald-600"
            >
              + {f.label}
            </button>
          ))}
        </div>
      )}

      {is("grammarNote") && (
        <div>
          <div className={labelCls}>
            <span>Grammar note</span>
            <button
              type="button"
              onClick={() => hideField("grammarNote")}
              className="ml-auto text-zinc-300 hover:text-red-500"
              title="Remove field"
            >
              ✕
            </button>
          </div>
          <input
            className={inputCls}
            value={content.grammarNote ?? ""}
            placeholder="e.g. passé composé"
            onChange={(e) => set("grammarNote", e.target.value)}
          />
        </div>
      )}

      {is("vocab") && (
        <div>
          <div className={labelCls}>
            <span>Vocabulary</span>
            <button
              type="button"
              onClick={() => hideField("vocab")}
              className="ml-auto text-zinc-300 hover:text-red-500"
              title="Remove list"
            >
              ✕
            </button>
          </div>
          <RowEditor
            rows={content.vocab ?? []}
            onRows={(rows) => set("vocab", rows)}
            placeholderTerm="term"
            placeholderDef="definition"
            termCls="font-semibold text-green-700"
          />
        </div>
      )}

      {is("expressions") && (
        <div>
          <div className={labelCls}>
            <span>Expressions</span>
            <button
              type="button"
              onClick={() => hideField("expressions")}
              className="ml-auto text-zinc-300 hover:text-red-500"
              title="Remove list"
            >
              ✕
            </button>
          </div>
          <RowEditor
            rows={content.expressions ?? []}
            onRows={(rows) => set("expressions", rows)}
            placeholderTerm="expression"
            placeholderDef="meaning"
            termCls="font-semibold text-green-700"
          />
        </div>
      )}
    </div>
  );
}
