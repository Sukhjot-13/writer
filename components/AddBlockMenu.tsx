// components/AddBlockMenu.tsx — "+" button and slash-command menu (FR-2).
// M1 offers paragraph / heading / title / separator; Q&A is listed but
// disabled until M2.

"use client";

import { useState } from "react";
import type { BlockType } from "@/lib/types";

const ITEMS: { type: BlockType; label: string; available: boolean }[] = [
  { type: "paragraph", label: "Paragraph", available: true },
  { type: "heading", label: "Heading", available: true },
  { type: "title", label: "Title", available: true },
  { type: "separator", label: "Separator", available: true },
  { type: "qa", label: "Question & Answer", available: false }, // M2
];

export default function AddBlockMenu({ onAdd }: { onAdd: (type: BlockType) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-dashed border-zinc-300 text-zinc-400 transition-colors hover:border-blue-400 hover:text-blue-500"
        title="Add block"
      >
        +
      </button>
      {open && (
        <div
          className="absolute bottom-full left-1/2 z-20 mb-2 w-52 -translate-x-1/2 overflow-hidden rounded-md border border-zinc-200 bg-white py-1 shadow-lg"
          onMouseDown={(e) => e.preventDefault()} // keep focus so onBlur doesn't close before click
        >
          {ITEMS.map((item) => (
            <button
              key={item.type}
              type="button"
              disabled={!item.available}
              onClick={() => {
                onAdd(item.type);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm text-zinc-700 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:text-zinc-300 disabled:hover:bg-transparent"
            >
              <span>{item.label}</span>
              {!item.available && <span className="text-[10px] uppercase text-zinc-300">M2</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
