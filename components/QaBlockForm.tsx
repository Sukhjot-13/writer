// components/QaBlockForm.tsx — Q&A block form (FR-4/26/33/34/37).
//
// Required: question. Optional fields appear only once used (FR-4: "Empty
// optional fields are hidden — never show a form field the user isn't using"):
// a "＋" chip menu reveals each one; clearing a field hides it again (remove
// button). Tab order follows FR-26 (question → translation → grammar note →
// user answer → model answer → translation → analysis → vocab rows).
//
// userAnswer is the primary practice field (FR-33); modelAnswer + question
// translation get 👁 toggles (FR-34) that set hideTranslation/hideModelAnswer —
// hidden state is visually clear with a muted "hidden in output" chip (FR-37).

"use client";

import { useEffect, useState } from "react";
import type { QaContent } from "@/lib/types";

interface QaBlockFormProps {
  content: QaContent;
  autoFocus?: boolean;
  onUpdate: (content: QaContent) => void;
}

type OptionalField =
  | "questionTranslation"
  | "grammarNote"
  | "responseLabel"
  | "userAnswer"
  | "modelAnswer"
  | "answerTranslation"
  | "analysis"
  | "vocab"
  | "expressions";

const OPTIONAL_FIELDS: { key: OptionalField; label: string }[] = [
  { key: "questionTranslation", label: "Translation" },
  { key: "grammarNote", label: "Grammar note" },
  { key: "responseLabel", label: "Response label" },
  { key: "userAnswer", label: "My answer" },
  { key: "modelAnswer", label: "Model answer" },
  { key: "answerTranslation", label: "Answer translation" },
  { key: "analysis", label: "Analysis" },
  { key: "vocab", label: "Vocabulary" },
  { key: "expressions", label: "Expressions" },
];

/** Which optional fields currently have content (auto-reveal on load). */
function usedFields(c: QaContent): Set<OptionalField> {
  const used = new Set<OptionalField>();
  if (c.questionTranslation) used.add("questionTranslation");
  if (c.grammarNote) used.add("grammarNote");
  if (c.responseLabel) used.add("responseLabel");
  if (c.userAnswer) used.add("userAnswer");
  if (c.modelAnswer) used.add("modelAnswer");
  if (c.answerTranslation) used.add("answerTranslation");
  if (c.analysis) used.add("analysis");
  if (c.vocab?.length) used.add("vocab");
  if (c.expressions?.length) used.add("expressions");
  return used;
}

const inputCls =
  "w-full rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-[14px] leading-relaxed text-zinc-800 outline-none placeholder:text-zinc-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
const labelCls = "mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500";

function EyeToggle({ hidden, onToggle, label }: { hidden: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={hidden ? `${label} — hidden in output (click to show)` : `${label} — shown in output (click to hide)`}
      className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${
        hidden ? "bg-zinc-100 text-zinc-500 hover:bg-zinc-200" : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
      }`}
    >
      <span>{hidden ? "🙈" : "👁"}</span>
      {hidden ? "hidden" : "shown"}
    </button>
  );
}

function RowEditor({
  rows,
  onRows,
  placeholderTerm,
  placeholderDef,
  termCls,
}: {
  rows: { term: string; def: string }[];
  onRows: (rows: { term: string; def: string }[]) => void;
  placeholderTerm: string;
  placeholderDef: string;
  termCls: string;
}) {
  return (
    <div className="space-y-1.5">
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input
            className={`${inputCls} flex-1 ${termCls}`}
            value={row.term}
            placeholder={placeholderTerm}
            onChange={(e) => {
              const next = [...rows];
              next[i] = { ...next[i], term: e.target.value };
              onRows(next);
            }}
          />
          <input
            className={`${inputCls} flex-1`}
            value={row.def}
            placeholder={placeholderDef}
            onChange={(e) => {
              const next = [...rows];
              next[i] = { ...next[i], def: e.target.value };
              onRows(next);
            }}
          />
          <button
            type="button"
            onClick={() => onRows(rows.filter((_, j) => j !== i))}
            className="rounded px-1.5 text-xs text-zinc-300 hover:text-red-500"
            title="Remove row"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onRows([...rows, { term: "", def: "" }])}
        className="rounded border border-dashed border-zinc-300 px-2 py-1 text-xs text-zinc-400 hover:border-blue-400 hover:text-blue-500"
      >
        + Add row
      </button>
    </div>
  );
}

export default function QaBlockForm({ content, autoFocus, onUpdate }: QaBlockFormProps) {
  const [revealed, setRevealed] = useState<Set<OptionalField>>(() => usedFields(content));
  const questionRef = (el: HTMLInputElement | null) => {
    if (el && autoFocus) el.focus();
  };

  useEffect(() => {
    // A field that gained content externally (AI import) reveals itself.
    setRevealed((prev) => new Set([...prev, ...usedFields(content)]));
  }, [content]);

  const reveal = (key: OptionalField) => setRevealed((prev) => new Set([...prev, key]));

  const hideField = (key: OptionalField) => {
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

  const set = <K extends keyof QaContent>(key: K, value: QaContent[K]) => onUpdate({ ...content, [key]: value });

  const is = (key: OptionalField) => revealed.has(key);

  return (
    <div className="mt-1 space-y-3 rounded-xl border border-zinc-200 bg-zinc-50/70 p-3.5">
      {/* Question — required (FR-4) */}
      <div>
        <label className={labelCls}>Question</label>
        <input
          ref={questionRef}
          className={`${inputCls} font-medium text-zinc-900`}
          value={content.question}
          placeholder="Type the question in the primary language…"
          onChange={(e) => set("question", e.target.value)}
        />
      </div>

      {/* Optional-field chip menu (FR-4/26: sections appear once used) */}
      {OPTIONAL_FIELDS.filter((f) => !is(f.key)).length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">Add:</span>
          {OPTIONAL_FIELDS.filter((f) => !is(f.key)).map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => reveal(f.key)}
              className="rounded-full border border-dashed border-zinc-300 bg-white px-2.5 py-0.5 text-[11px] text-zinc-500 transition-colors hover:border-blue-400 hover:text-blue-600"
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
              hidden={Boolean(content.hideTranslation)}
              onToggle={() => set("hideTranslation", !content.hideTranslation)}
              label="Translation"
            />
            <button type="button" onClick={() => hideField("questionTranslation")} className="ml-auto rounded p-0.5 text-zinc-300 transition-colors hover:text-red-500" title="Remove field">
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
            <button type="button" onClick={() => hideField("grammarNote")} className="ml-auto text-zinc-300 hover:text-red-500" title="Remove field">
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
            <span>Response label</span>
            <button type="button" onClick={() => hideField("responseLabel")} className="ml-auto text-zinc-300 hover:text-red-500" title="Remove field">
              ✕
            </button>
          </div>
          <input
            className={`${inputCls} w-40`}
            value={content.responseLabel ?? ""}
            placeholder="RÉPONSE"
            onChange={(e) => set("responseLabel", e.target.value)}
          />
        </div>
      )}

      {is("userAnswer") && (
        <div>
          <div className={labelCls}>
            <span>My answer (practice)</span>
            <button type="button" onClick={() => hideField("userAnswer")} className="ml-auto text-zinc-300 hover:text-red-500" title="Remove field">
              ✕
            </button>
          </div>
          <textarea
            className={`${inputCls} resize-none border-dashed`}
            rows={2}
            value={content.userAnswer ?? ""}
            placeholder="Write your own answer here (shown in practice output)…"
            onChange={(e) => set("userAnswer", e.target.value)}
          />
        </div>
      )}

      {is("modelAnswer") && (
        <div>
          <div className={labelCls}>
            <span>Model answer</span>
            <EyeToggle
              hidden={Boolean(content.hideModelAnswer)}
              onToggle={() => set("hideModelAnswer", !content.hideModelAnswer)}
              label="Model answer"
            />
            <button type="button" onClick={() => hideField("modelAnswer")} className="ml-auto rounded p-0.5 text-zinc-300 transition-colors hover:text-red-500" title="Remove field">
              ✕
            </button>
          </div>
          <textarea
            className={inputCls}
            rows={2}
            value={content.modelAnswer ?? ""}
            placeholder="The reference answer…"
            onChange={(e) => set("modelAnswer", e.target.value)}
          />
        </div>
      )}

      {is("answerTranslation") && (
        <div>
          <div className={labelCls}>
            <span>Answer translation</span>
            <button type="button" onClick={() => hideField("answerTranslation")} className="ml-auto text-zinc-300 hover:text-red-500" title="Remove field">
              ✕
            </button>
          </div>
          <input
            className={inputCls}
            value={content.answerTranslation ?? ""}
            placeholder="Translation of the answer…"
            onChange={(e) => set("answerTranslation", e.target.value)}
          />
        </div>
      )}

      {is("analysis") && (
        <div>
          <div className={labelCls}>
            <span>Analysis</span>
            <button type="button" onClick={() => hideField("analysis")} className="ml-auto text-zinc-300 hover:text-red-500" title="Remove field">
              ✕
            </button>
          </div>
          <textarea
            className={inputCls}
            rows={2}
            value={content.analysis ?? ""}
            placeholder="Linguistic breakdown of the answer…"
            onChange={(e) => set("analysis", e.target.value)}
          />
        </div>
      )}

      {is("vocab") && (
        <div>
          <div className={labelCls}>
            <span>Vocabulary</span>
            <button type="button" onClick={() => hideField("vocab")} className="ml-auto text-zinc-300 hover:text-red-500" title="Remove list">
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
            <button type="button" onClick={() => hideField("expressions")} className="ml-auto text-zinc-300 hover:text-red-500" title="Remove list">
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
