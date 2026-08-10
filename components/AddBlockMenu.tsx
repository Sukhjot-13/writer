// components/AddBlockMenu.tsx — split add-block control (2026-08-10).
//
// Two parts:
//   "+ <label>"  — direct click adds the LAST-CHOSEN type (default: paragraph;
//                  remembered per session in localStorage) — the common path.
//   "▾"          — opens the full type menu; picking an item adds it AND makes
//                  it the new default for direct clicks.
// So adding feels like one click for the usual type, with the full choice
// always one small caret away.

"use client";

import { useState } from "react";
import type { BlockType } from "@/lib/types";

const ITEMS: { type: BlockType; label: string }[] = [
  { type: "paragraph", label: "Paragraph" },
  { type: "essay", label: "Essay" },
  { type: "heading", label: "Heading" },
  { type: "qa", label: "Question & Answer" },
  { type: "title", label: "Title" },
  { type: "separator", label: "Separator" },
];

const LABELS = Object.fromEntries(ITEMS.map((i) => [i.type, i.label])) as Record<BlockType, string>;

export default function AddBlockMenu({
  lastType,
  onAdd,
  onPickType,
}: {
  lastType: BlockType;
  onAdd: (type: BlockType) => void;
  onPickType: (type: BlockType) => void;
}) {
  const [open, setOpen] = useState(false);

  const pick = (type: BlockType) => {
    onPickType(type);
    onAdd(type);
    setOpen(false);
  };

  return (
    <div className="relative">
      <div className="flex items-center overflow-hidden rounded-full border border-dashed border-zinc-300 bg-white shadow-sm transition-colors hover:border-emerald-300">
        <button
          type="button"
          onClick={() => onAdd(lastType)}
          title={`Add ${LABELS[lastType]} — click for the default, ▾ for all types`}
          className="flex h-9 items-center gap-1.5 pl-3 pr-2 text-sm text-zinc-600 transition-colors hover:bg-emerald-50 hover:text-emerald-700"
        >
          <span className="text-base leading-none">+</span>
          <span className="text-xs font-medium">{LABELS[lastType]}</span>
        </button>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          onBlur={() => setOpen(false)}
          title="Choose block type"
          className="flex h-9 w-7 items-center justify-center text-[10px] text-zinc-400 transition-colors hover:bg-emerald-50 hover:text-emerald-600"
        >
          ▾
        </button>
      </div>
      {open && (
        <div
          className="absolute bottom-full left-1/2 z-20 mb-2 w-56 -translate-x-1/2 overflow-hidden rounded-lg border border-zinc-200 bg-white py-1 shadow-xl"
          onMouseDown={(e) => e.preventDefault()} // keep focus so onBlur doesn't close before click
        >
          {ITEMS.map((item) => (
            <button
              key={item.type}
              type="button"
              onClick={() => pick(item.type)}
              className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-emerald-50 hover:text-emerald-700 ${
                item.type === lastType ? "font-medium text-emerald-700" : "text-zinc-700"
              }`}
            >
              <span>{item.label}</span>
              {item.type === lastType && (
                <span className="text-[10px] font-medium text-emerald-600">✓ default</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
