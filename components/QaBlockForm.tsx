// components/QaBlockForm.tsx — Q&A card editor (M6 redesign, FR-4/26/33/34/37).
//
// Two modes driven by the Practice master key:
//   mode="normal"   — full editing. Question + ALWAYS-visible reference answer
//                     ("Answer"), plus optional extras behind "＋ chips"
//                     (question translation, grammar note, response label,
//                     answer translation, analysis, vocab, expressions).
//   mode="practice" — question shown read-only with a "My answer" box to write
//                     into. Once the user checks answers, a green read-only
//                     "Model answer" box appears alongside their own answer.
// The two answers are separate fields (userAnswer = practice attempt,
// modelAnswer = reference), so practice never touches the reference data.

"use client";

import { useEffect, useState } from "react";
import type { QaContent } from "@/lib/types";
import { inputCls, labelCls, RowEditor } from "./RowEditor";

type QaField =
  | "questionTranslation"
  | "grammarNote"
  | "responseLabel"
  | "answerTranslation"
  | "analysis"
  | "vocab"
  | "expressions";

const OPTIONAL_FIELDS: { key: QaField; label: string }[] = [
  { key: "questionTranslation", label: "Question translation" },
  { key: "grammarNote", label: "Grammar note" },
  { key: "responseLabel", label: "Answer label" },
  { key: "answerTranslation", label: "Answer translation" },
  { key: "analysis", label: "Analysis" },
  { key: "vocab", label: "Vocabulary" },
  { key: "expressions", label: "Expressions" },
];

/** Which optional fields currently have content (auto-reveal on load). */
function usedFields(c: QaContent): Set<QaField> {
  const used = new Set<QaField>();
  if (c.questionTranslation) used.add("questionTranslation");
  if (c.grammarNote) used.add("grammarNote");
  if (c.responseLabel) used.add("responseLabel");
  if (c.answerTranslation) used.add("answerTranslation");
  if (c.analysis) used.add("analysis");
  if (c.vocab?.length) used.add("vocab");
  if (c.expressions?.length) used.add("expressions");
  return used;
}

function EyeToggle({ on, onToggle, title }: { on: boolean; onToggle: () => void; title: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={title}
      className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold transition-colors ${
        on
          ? "border-zinc-300 bg-white text-zinc-400 hover:text-zinc-600"
          : "border-red-200 bg-red-50 text-red-500 hover:text-red-700"
      }`}
    >
      {on ? "👁" : "🙈"}
    </button>
  );
}

interface QaBlockFormProps {
  content: QaContent;
  autoFocus?: boolean;
  mode: "normal" | "practice";
  checked: boolean; // practice only: reveal the model answer
  onUpdate: (content: QaContent) => void;
}

export default function QaBlockForm({ content, autoFocus, mode, checked, onUpdate }: QaBlockFormProps) {
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
          <textarea
            className={`${inputCls} resize-none border-dashed border-blue-200`}
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

      {/* Reference answer — always visible (M6: one answer field, clean cards) */}
      <div>
        <div className={labelCls}>
          <span>Answer</span>
          <EyeToggle
            on={!content.hideModelAnswer}
            onToggle={() => set("hideModelAnswer", !content.hideModelAnswer)}
            title={content.hideModelAnswer ? "Show answer in output" : "Hide answer in output"}
          />
        </div>
        <textarea
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
      </div>

      {/* Optional-field chip menu (FR-4/26: sections appear once used) — kept
          deliberately subtle: enrichment is mostly AI-generated, so the chips
          sit quietly under the card until the user wants to touch them. */}
      {OPTIONAL_FIELDS.filter((f) => !is(f.key)).length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
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

      {is("questionTranslation") && (
        <div>
          <div className={labelCls}>
            <span>Question translation</span>
            <EyeToggle
              on={!content.hideTranslation}
              onToggle={() => set("hideTranslation", !content.hideTranslation)}
              title={content.hideTranslation ? "Show question translation in output" : "Hide question translation in output"}
            />
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

      {is("responseLabel") && (
        <div>
          <div className={labelCls}>
            <span>Answer label</span>
            <button
              type="button"
              onClick={() => hideField("responseLabel")}
              className="ml-auto text-zinc-300 hover:text-red-500"
              title="Remove field"
            >
              ✕
            </button>
          </div>
          <input
            className={`${inputCls} w-40`}
            value={content.responseLabel ?? "RÉPONSE"}
            placeholder="RÉPONSE"
            onChange={(e) => set("responseLabel", e.target.value)}
          />
        </div>
      )}

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
          <textarea
            className={inputCls}
            rows={2}
            value={content.analysis ?? ""}
            placeholder="Why is this answer correct — grammar or vocabulary it uses…"
            onChange={(e) => set("analysis", e.target.value)}
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
