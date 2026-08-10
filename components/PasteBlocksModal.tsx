// components/PasteBlocksModal.tsx — paste AI-structured blocks back (M6).
//
// "Copy for AI" now exposes the same JSON block array the convert endpoint
// produces. This modal re-imports it client-side via
// parseStructuredBlocksResponse (lib/structuring.ts), completing the
// copy → external AI → paste round-trip (FR-42) for the new block format.

"use client";

import { useState } from "react";
import type { Block } from "@/lib/types";
import AutoGrowTextarea from "./AutoGrowTextarea"; // 2026-08-10: auto-grow paste box
import InstructionCopyBox from "./InstructionCopyBox"; // 2026-08-10
import { parseStructuredBlocksResponse } from "@/lib/structuring";

// 2026-08-10 (user request): the context to give another AI so its output
// arrives in exactly this app's JSON block format — paste the instruction +
// your raw material into the other AI, then paste its response below.
// 2026-08-10 #5: essay shape now carries an optional "heading" (only when the
// passage has a natural title — never invented, never forced).
const BLOCKS_INSTRUCTION =
  'Convert the French practice material below into structured document blocks. Return ONLY a JSON array of block objects — no markdown fences, no explanations, no HTML — in document order, using exactly these shapes: {"type":"title","text":"…"} {"type":"heading","text":"…","level":2} {"type":"paragraph","text":"…","translation":"…","analysis":"…","vocab":[{"term":"…","def":"…"}],"expressions":[{"term":"…","def":"…"}]} {"type":"essay","heading":"…","paragraphs":["…","…"],"translation":"…","analysis":"…","vocab":[…],"expressions":[…] } {"type":"qa","question":"…","questionTranslation":"…","grammarNote":"…","responseLabel":"RÉPONSE","modelAnswer":"…","answerTranslation":"…","analysis":"…","vocab":[…],"expressions":[…] } {"type":"separator"} Group consecutive prose paragraphs of the same passage into ONE essay object (its "paragraphs" array) with a single shared translation/analysis/vocab/expressions set — never split an essay into per-paragraph parts. Give an essay a "heading" only when the passage has a natural title or short label — never invent one, never force one. Keep every provided answer verbatim. Omit any optional field you cannot fill with confidence. Never invent an answer for an unanswered question — leave "modelAnswer" out entirely. Never include user answers.';

interface PasteBlocksModalProps {
  onClose: () => void;
  onResult: (blocks: Block[]) => void;
}

export default function PasteBlocksModal({ onClose, onResult }: PasteBlocksModalProps) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  function importBlocks() {
    setError(null);
    const blocks = parseStructuredBlocksResponse(text);
    if (blocks.length === 0) {
      setError("No valid blocks found — paste the JSON array copied via Copy → Copy for AI.");
      return;
    }
    onResult(blocks);
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-zinc-900/40 p-4 backdrop-blur-[2px]" onClick={onClose}>
      {/* 2026-08-10 #6 (user feedback): the whole card scrolls when it outgrows
          the viewport — the textarea cap alone wasn't enough (instruction box +
          textarea + buttons could still push the modal off-screen). */}
      <div
        className="max-h-[88vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-zinc-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-zinc-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Paste blocks (AI)</h2>
            <p className="mt-0.5 text-sm text-zinc-500">
              The JSON block array from <em>Copy → Copy for AI</em>, edited or regenerated in any
              external AI.
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
          <InstructionCopyBox
            title="Instructions for another AI"
            instruction={BLOCKS_INSTRUCTION}
          />
          <AutoGrowTextarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            autoFocus
            spellCheck={false}
            placeholder={JSON.stringify(
              [{ type: "qa", question: "Qu'est-ce que tu as fait hier ?", questionTranslation: "What did you do yesterday?" }],
              null,
              2,
            )}
            className="w-full rounded-lg border border-zinc-200 bg-zinc-50 p-3 font-mono text-[12px] leading-relaxed text-zinc-800 outline-none placeholder:text-zinc-300 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
          />

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
          <button
            type="button"
            onClick={importBlocks}
            disabled={!text.trim()}
            className="rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-40"
          >
            Import blocks
          </button>
        </div>
      </div>
    </div>
  );
}
