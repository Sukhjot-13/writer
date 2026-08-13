// components/PasteSmartModal.tsx — one paste box for anything (to-do item 9).
//
// Sniffs the pasted content and routes to the right importer (lib/paste-sniff):
//   "[" → blocks    (JSON block array from Copy for AI → parseStructuredBlocksResponse)
//   "<" → html      (markup from an external AI → POST /api/documents/import-html)
//   else → questions (plain list → splitQuestions; Structure with AI or parse locally)
// The kind is shown live under the box; the footer shows the buttons that make
// sense for the detected kind. The three dedicated Paste buttons stay as
// shortcuts (they open their full modal with the extra instructions).

"use client";

import { useMemo, useState } from "react";
import type { Block, Document } from "@/lib/types";
import { sniffPasteKind } from "@/lib/paste-sniff";
import { splitQuestions, questionsToQaBlocks } from "@/lib/questions";
import { parseStructuredBlocksResponse } from "@/lib/structuring";
import AutoGrowTextarea from "./AutoGrowTextarea"; // auto-grow paste box

interface PasteSmartModalProps {
  onClose: () => void;
  onResult: (blocks: Block[]) => void; // blocks + questions both produce blocks
  onImported: (doc: Document, html: string) => void; // html produces a document
}

const KIND_LABEL: Record<ReturnType<typeof sniffPasteKind>, string> = {
  blocks: "Blocks (AI)",
  html: "HTML",
  questions: "Questions",
};

export default function PasteSmartModal({ onClose, onResult, onImported }: PasteSmartModalProps) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"ai" | "local" | "import" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const kind = useMemo(() => sniffPasteKind(text), [text]);
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
    onResult(questionsToQaBlocks(questions));
  }

  function importBlocks() {
    setError(null);
    const blocks = parseStructuredBlocksResponse(text);
    if (blocks.length === 0) {
      setError("No valid blocks found — paste the JSON array copied via Copy → Copy for AI.");
      return;
    }
    onResult(blocks);
  }

  async function importHtml() {
    if (busy || !text.trim()) return;
    setBusy("import");
    setError(null);
    try {
      const res = await fetch("/api/documents/import-html", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html: text }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        doc?: Document;
        html?: string;
        error?: string;
      };
      if (!res.ok || !body.doc || !body.html) throw new Error(body.error ?? "Import failed");
      onImported(body.doc, body.html);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]" onClick={onClose}>
      <div
        className="max-h-[88vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-zinc-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-zinc-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Smart paste</h2>
            <p className="mt-0.5 text-sm text-zinc-500">
              One box for anything — questions, AI blocks, or HTML. The kind is detected from what
              you paste.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600"
            title="Close"
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-4">
          <AutoGrowTextarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            autoFocus
            spellCheck={false}
            placeholder={"Paste questions, a JSON block array, or HTML here…"}
            className="w-full rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-[14px] leading-relaxed text-zinc-800 outline-none placeholder:text-zinc-300 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
          />

          <div className="mt-2 text-sm text-zinc-600">
            {text.trim() ? (
              <span className="font-medium text-emerald-700">
                Detected: {KIND_LABEL[kind]}
                {kind === "questions" && (
                  <span className="text-zinc-500">
                    {" "}
                    — {questions.length} question{questions.length === 1 ? "" : "s"}
                  </span>
                )}
              </span>
            ) : (
              <span className="text-zinc-400">Paste anything above — the import buttons adapt.</span>
            )}
          </div>

          {error && (
            <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-zinc-100 px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
          >
            Cancel
          </button>
          {kind === "blocks" && (
            <button
              type="button"
              onClick={importBlocks}
              disabled={!text.trim()}
              className="rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-[#fff] transition-colors hover:bg-blue-700 disabled:opacity-40"
            >
              Import blocks
            </button>
          )}
          {kind === "html" && (
            <button
              type="button"
              onClick={() => void importHtml()}
              disabled={busy !== null || !text.trim()}
              className="rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-[#fff] transition-colors hover:bg-blue-700 disabled:opacity-40"
            >
              {busy === "import" ? "Importing…" : "Import document"}
            </button>
          )}
          {kind === "questions" && (
            <>
              <button
                type="button"
                onClick={parseLocally}
                disabled={busy !== null || questions.length === 0}
                className="rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-40"
              >
                {busy === "local" ? "Parsing…" : "Parse locally (offline)"}
              </button>
              <button
                type="button"
                onClick={() => void structureWithAI()}
                disabled={busy !== null || questions.length === 0}
                className="rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-[#fff] transition-colors hover:bg-blue-700 disabled:opacity-40"
              >
                {busy === "ai" ? "Structuring…" : "Structure with AI"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
