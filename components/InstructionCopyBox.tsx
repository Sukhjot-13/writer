// components/InstructionCopyBox.tsx — copyable instruction above a paste box
// (2026-08-10, user request). The user copies this context and gives it to
// another AI ALONGSIDE their raw material, so the AI produces output in the
// exact format this app parses — no AI call in the app itself.
//
// 2026-08-10 #6 (user feedback): the instruction text is COLLAPSED by default
// ("hide the instructions... give a toggle to see Instructions as user will
// mainly use the copy button") — the header with the Copy button stays
// visible; a small Show/Hide toggle reveals the instruction text.

"use client";

import { useState } from "react";

export default function InstructionCopyBox({
  title,
  instruction,
}: {
  title: string;
  instruction: string;
}) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false); // 2026-08-10 #6: hidden by default

  async function copy() {
    try {
      await navigator.clipboard.writeText(instruction);
    } catch {
      // fallback for non-secure contexts
      const ta = document.createElement("textarea");
      ta.value = instruction;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="mb-2 rounded-lg border border-blue-200 bg-blue-50/60 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-700">
          {title}
        </span>
        <span className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="rounded-md border border-blue-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-blue-700 transition-colors hover:bg-blue-50"
            title={open ? "Hide the instruction text" : "Show the instruction text"}
          >
            {open ? "Hide" : "Show"}
          </button>
          <button
            type="button"
            onClick={() => void copy()}
            className="rounded-md border border-blue-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-blue-700 transition-colors hover:bg-blue-50"
          >
            {copied ? "Copied ✓" : "Copy instruction"}
          </button>
        </span>
      </div>
      {open && <p className="mt-1 text-[12px] leading-relaxed text-zinc-600">{instruction}</p>}
    </div>
  );
}
