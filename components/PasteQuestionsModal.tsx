// components/PasteQuestionsModal.tsx — import a pasted question list (FR-32/38).
//
// Single-step flow: paste → live count of detected questions → "Structure with
// AI" (DeepSeek returns full Q&A content) or "Parse locally (offline)"
// (question-only blocks). Either way the result replaces the document's blocks
// with answer fields ready to type into.

"use client";

import { useMemo, useState } from "react";
import type { Block } from "@/lib/types";
import { splitQuestions, questionsToQaBlocks } from "@/lib/questions";

interface PasteQuestionsModalProps {
  onClose: () => void;
  onResult: (blocks: Block[]) => void;
}

export default function PasteQuestionsModal({ onClose, onResult }: PasteQuestionsModalProps) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"ai" | "local" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const questions = useMemo(() => splitQuestions(text), [text]);

  async function structureWithAI() {
    if (busy || questions.length === 0) return;
    setBusy("ai");
    setError(null);
    try {
      const res = await fetch("/api/convert/structure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions }),
      });
      const body = (await res.json().catch(() => ({}))) as { blocks?: Block[]; error?: string };
      if (!res.ok || !body.blocks) throw new Error(body.error ?? "AI structuring failed");
      onResult(body.blocks);
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI structuring failed");
    } finally {
      setBusy(null);
    }
  }

  function parseLocally() {
    if (busy || questions.length === 0) return;
    setBusy("local");
    setError(null);
    // Question-only blocks (FR-32 template mode); answer fields ready to type into.
    const blocks: Block[] = questionsToQaBlocks(questions);
    onResult(blocks);
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="w-full max-w-xl rounded-xl border border-zinc-200 bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-zinc-900">Paste questions</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Numbered lines (<code>1. …</code>) or blank-line-separated questions.
        </p>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          autoFocus
          placeholder={"1. Qu'est-ce que tu as fait hier ?\n2. Où es-tu allé en vacances ?"}
          className="mt-3 w-full rounded-md border border-zinc-200 bg-zinc-50 p-3 text-[14px] leading-relaxed text-zinc-800 outline-none placeholder:text-zinc-300 focus:border-blue-400 focus:bg-white"
        />

        <div className="mt-2 text-sm text-zinc-600">
          {text.trim() ? (
            <span className={questions.length > 0 ? "text-emerald-700" : "text-amber-600"}>
              {questions.length} question{questions.length === 1 ? "" : "s"} detected
            </span>
          ) : (
            <span className="text-zinc-400">Paste your list above…</span>
          )}
        </div>

        {error && (
          <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

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
            onClick={() => void structureWithAI()}
            disabled={busy !== null || questions.length === 0}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
          >
            {busy === "ai" ? "Structuring…" : "Structure with AI"}
          </button>
          <button
            type="button"
            onClick={parseLocally}
            disabled={busy !== null || questions.length === 0}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
          >
            {busy === "local" ? "Parsing…" : "Parse locally (offline)"}
          </button>
        </div>
      </div>
    </div>
  );
}
