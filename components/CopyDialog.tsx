// components/CopyDialog.tsx — selective plain-text copy for sharing (FR-50).
//
// Checkboxes choose exactly what goes to the clipboard: paragraphs,
// title/headings, questions, user answers, model answers, translations,
// grammar notes, analysis, vocab. Translations and model answers are OFF by
// default. Q&A numbering is preserved (1., 2., …). The last-used selection is
// remembered in localStorage. Distinct from FR-39 (marker-format copy for AI
// round-trips) — this output is clean plain text, no HTML, no type markers.

"use client";

import { useEffect, useMemo, useState } from "react";
import type { Block, Document } from "@/lib/types";

export interface CopySelection {
  paragraphs: boolean;
  headings: boolean;
  questions: boolean;
  userAnswers: boolean;
  modelAnswers: boolean;
  translations: boolean;
  grammarNotes: boolean;
  analysis: boolean;
  vocab: boolean;
}

export const DEFAULT_SELECTION: CopySelection = {
  paragraphs: true,
  headings: true,
  questions: true,
  userAnswers: true,
  modelAnswers: false, // off by default (FR-50)
  translations: false, // off by default (FR-50)
  grammarNotes: true,
  analysis: true,
  vocab: true,
};

const STORAGE_KEY = "writer-app:copy-selection";

const SELECTION_ORDER: { key: keyof CopySelection; label: string }[] = [
  { key: "paragraphs", label: "Paragraphs" },
  { key: "headings", label: "Title & headings" },
  { key: "questions", label: "Questions" },
  { key: "userAnswers", label: "User answers" },
  { key: "modelAnswers", label: "Model answers" },
  { key: "translations", label: "Translations" },
  { key: "grammarNotes", label: "Grammar notes" },
  { key: "analysis", label: "Analysis" },
  { key: "vocab", label: "Vocabulary & expressions" },
];

function loadSelection(): CopySelection {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_SELECTION, ...(JSON.parse(raw) as Partial<CopySelection>) };
  } catch {
    // corrupted storage — fall through to defaults
  }
  return { ...DEFAULT_SELECTION };
}

/** Flatten a list of vocab items into "term : def ; term : def". */
function joinVocab(items: { term: string; def: string }[] | undefined): string | null {
  if (!items || items.length === 0) return null;
  return items.map((v) => `${v.term} : ${v.def}`).join(" ; ");
}

/**
 * Build the clean plain-text representation of a document (FR-50).
 * Pure and exported so it is covered by the smoke tests.
 */
export function buildCopyText(doc: Document, sel: CopySelection): string {
  const lines: string[] = [];
  let qaNumber = 0;

  for (const block of doc.blocks) {
    switch (block.type) {
      case "title":
        if (sel.headings && block.content.text.trim()) lines.push(block.content.text.trim());
        break;
      case "heading":
        if (sel.headings && block.content.text.trim()) lines.push(block.content.text.trim());
        break;
      case "paragraph": {
        const text = block.content.text.trim();
        if (sel.paragraphs && text) {
          lines.push(text);
          lines.push("");
        }
        break;
      }
      case "qa": {
        if (!sel.questions && !sel.userAnswers && !sel.modelAnswers && !sel.translations &&
            !sel.grammarNotes && !sel.analysis && !sel.vocab) {
          break; // nothing selected for this block
        }
        const c = block.content;
        qaNumber += 1;
        const blockLines: string[] = [];
        if (sel.questions && c.question.trim()) blockLines.push(c.question.trim());
        if (sel.translations && c.questionTranslation?.trim()) {
          blockLines.push(`  ${c.questionTranslation.trim()}`);
        }
        if (sel.grammarNotes && c.grammarNote?.trim()) blockLines.push(`  ${c.grammarNote.trim()}`);
        if (sel.userAnswers && c.userAnswer?.trim()) {
          blockLines.push(`  ${c.responseLabel || "Réponse"} : ${c.userAnswer.trim()}`);
        }
        if (sel.modelAnswers && c.modelAnswer?.trim()) blockLines.push(`  Modèle : ${c.modelAnswer.trim()}`);
        if (sel.translations && c.answerTranslation?.trim()) {
          blockLines.push(`  Traduction : ${c.answerTranslation.trim()}`);
        }
        if (sel.analysis && c.analysis?.trim()) blockLines.push(`  Analyse : ${c.analysis.trim()}`);
        if (sel.vocab) {
          const vocab = joinVocab(c.vocab);
          if (vocab) blockLines.push(`  Vocabulaire : ${vocab}`);
          const expressions = joinVocab(c.expressions);
          if (expressions) blockLines.push(`  Expressions : ${expressions}`);
        }
        if (blockLines.length > 0) {
          lines.push(`${qaNumber}. ${blockLines[0].trimStart()}`); // first line on the number, rest indented
          lines.push(...blockLines.slice(1));
          lines.push("");
        }
        break;
      }
      case "separator":
        break;
    }
  }

  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop(); // trailing blank
  return lines.join("\n");
}

interface CopyDialogProps {
  doc: Document;
  onClose: () => void;
}

export default function CopyDialog({ doc, onClose }: CopyDialogProps) {
  const [selection, setSelection] = useState<CopySelection>(() =>
    typeof window === "undefined" ? { ...DEFAULT_SELECTION } : loadSelection(),
  );
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(selection));
    } catch {
      // storage unavailable — selection just won't persist
    }
  }, [selection]);

  const text = useMemo(() => buildCopyText(doc, selection), [doc, selection]);
  const hasQa = useMemo(() => doc.blocks.some((b) => b.type === "qa"), [doc]);

  function toggle(key: keyof CopySelection) {
    setSelection((s) => ({ ...s, [key]: !s[key] }));
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // fallback for non-secure contexts
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="w-full max-w-xl rounded-xl border border-zinc-200 bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-zinc-900">Copy for sharing</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Clean plain text — no HTML, no type markers. Translations and model answers are off by
          default.
        </p>

        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5">
          {SELECTION_ORDER.map(({ key, label }) => (
            <label
              key={key}
              className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700 hover:text-zinc-900"
            >
              <input
                type="checkbox"
                checked={selection[key]}
                onChange={() => toggle(key)}
                disabled={key === "questions" || key === "headings" || key === "paragraphs"}
                className="h-3.5 w-3.5 accent-blue-600"
              />
              {label}
            </label>
          ))}
        </div>

        <div className="mt-3 max-h-48 overflow-y-auto rounded-md border border-zinc-200 bg-zinc-50 p-3">
          <pre className="whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-zinc-600">
            {text || "Nothing to copy — the selected content is empty."}
          </pre>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void copy()}
            disabled={!text}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
          >
            {copied ? "Copied ✓" : "Copy"}
          </button>
        </div>
        {hasQa && (
          <p className="mt-2 text-xs text-zinc-400">
            Q&A numbering is preserved (1., 2., …).
          </p>
        )}
      </div>
    </div>
  );
}
