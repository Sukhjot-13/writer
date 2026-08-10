// components/ParagraphFields.tsx — AI enrichment editor for paragraphs (M6).
//
// "Convert with AI" now enriches ALL text, not just Q&A: paragraphs carry an
// English translation, a short analysis, and vocab/expressions. This mirrors
// QaBlockForm's "＋ chip" pattern — empty optional fields stay hidden, a chip
// reveals each one, removing a field clears its data.

"use client";

import { useEffect, useState } from "react";
import type { ParagraphContent } from "@/lib/types";
import { inputCls, labelCls, RowEditor } from "./RowEditor";

type ParagraphField = "translation" | "analysis" | "vocab" | "expressions";

const FIELDS: { key: ParagraphField; label: string }[] = [
  { key: "translation", label: "Translation" },
  { key: "analysis", label: "Analysis" },
  { key: "vocab", label: "Vocabulary" },
  { key: "expressions", label: "Expressions" },
];

/** Which optional fields currently have content (auto-reveal on load). */
function usedFields(c: ParagraphContent): Set<ParagraphField> {
  const used = new Set<ParagraphField>();
  if (c.translation) used.add("translation");
  if (c.analysis) used.add("analysis");
  if (c.vocab?.length) used.add("vocab");
  if (c.expressions?.length) used.add("expressions");
  return used;
}

interface ParagraphFieldsProps {
  content: ParagraphContent;
  onUpdate: (content: ParagraphContent) => void;
}

export default function ParagraphFields({ content, onUpdate }: ParagraphFieldsProps) {
  const [revealed, setRevealed] = useState<Set<ParagraphField>>(() => usedFields(content));

  useEffect(() => {
    // A field that gained content externally (AI import) reveals itself.
    setRevealed((prev) => new Set([...prev, ...usedFields(content)]));
  }, [content]);

  const reveal = (key: ParagraphField) => setRevealed((prev) => new Set([...prev, key]));

  const hideField = (key: ParagraphField) => {
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

  const set = <K extends keyof ParagraphContent>(key: K, value: ParagraphContent[K]) =>
    onUpdate({ ...content, [key]: value });

  const is = (key: ParagraphField) => revealed.has(key);

  return (
    <div className="mt-2 space-y-2.5 border-t border-dashed border-zinc-200 pt-2.5">
      {FIELDS.filter((f) => !is(f.key)).length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">Add:</span>
          {FIELDS.filter((f) => !is(f.key)).map((f) => (
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

      {is("translation") && (
        <div>
          <div className={labelCls}>
            <span>Translation</span>
            <button
              type="button"
              onClick={() => hideField("translation")}
              className="ml-auto rounded p-0.5 text-zinc-300 transition-colors hover:text-red-500"
              title="Remove field"
            >
              ✕
            </button>
          </div>
          <input
            className={inputCls}
            value={content.translation ?? ""}
            placeholder="English translation of this paragraph…"
            onChange={(e) => set("translation", e.target.value)}
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
              className="ml-auto rounded p-0.5 text-zinc-300 transition-colors hover:text-red-500"
              title="Remove field"
            >
              ✕
            </button>
          </div>
          <textarea
            className={inputCls}
            rows={2}
            value={content.analysis ?? ""}
            placeholder="Short explanation of the paragraph's key point or grammar…"
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
              className="ml-auto rounded p-0.5 text-zinc-300 transition-colors hover:text-red-500"
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
              className="ml-auto rounded p-0.5 text-zinc-300 transition-colors hover:text-red-500"
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
