// components/Block.tsx — single block editor row (FR-1/3/25).
// Handles title / heading / paragraph (shared text editing) and separator.
// Per-block controls: ↑ ↓ ✕ (reorder/delete) and ＋ (insert after) on hover.
// Typing "/" opens the slash-command menu (FR-2) to convert the block type.

"use client";

import { useEffect, useRef, useState } from "react";
import type { Block as BlockModel, BlockType } from "@/lib/types";
import QaBlockForm from "./QaBlockForm";

export const BLOCK_LABELS: Record<BlockType, string> = {
  title: "Title",
  heading: "Heading",
  paragraph: "Paragraph",
  qa: "Question & Answer",
  separator: "Separator",
};

/** Block types the slash menu can convert to (FR-2: /para /h2 /qa /title). */
export const SLASH_TYPES: { type: BlockType; label: string; hint: string }[] = [
  { type: "paragraph", label: "Paragraph", hint: "/para" },
  { type: "heading", label: "Heading", hint: "/h2" },
  { type: "qa", label: "Question & Answer", hint: "/qa" },
  { type: "title", label: "Title", hint: "/title" },
  { type: "separator", label: "Separator", hint: "divider" },
];

interface BlockProps {
  block: BlockModel;
  index: number;
  total: number;
  autoFocus?: boolean;
  onUpdate: (content: BlockModel["content"]) => void;
  onConvert: (type: BlockType) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onAddAfter: () => void;
}

export default function Block({
  block,
  index,
  total,
  autoFocus,
  onUpdate,
  onConvert,
  onRemove,
  onMoveUp,
  onMoveDown,
  onAddAfter,
}: BlockProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashCursor, setSlashCursor] = useState(0);

  // Auto-grow the textarea to its content (FR-25: blocks auto-grow).
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [block.type === "separator" ? "" : (block.content as { text?: string }).text]);

  // Focus a freshly created block.
  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  const text = block.type === "separator" ? "" : (block.content as { text?: string }).text ?? "";

  function handleKeyDown(e: React.KeyboardEvent) {
    if (slashOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashCursor((c) => (c + 1) % SLASH_TYPES.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashCursor((c) => (c - 1 + SLASH_TYPES.length) % SLASH_TYPES.length);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        applySlash(SLASH_TYPES[slashCursor].type);
        return;
      }
      if (e.key === "Escape") {
        setSlashOpen(false);
        return;
      }
    }
    if (e.key === "/") {
      setSlashOpen(true);
      setSlashCursor(0);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value;
    // Closing the slash menu when the "/" is edited away.
    if (slashOpen && value !== "/") setSlashOpen(false);
    onUpdate({ ...(block.content as object), text: value });
  }

  function applySlash(type: BlockType) {
    setSlashOpen(false);
    if (type === block.type) return;
    onConvert(type); // block content resets to the new type's empty content
  }

  const controls = (
    <div className="flex items-center gap-0.5 rounded border border-zinc-200 bg-white text-xs text-zinc-500 shadow-sm">
      <button
        type="button"
        onClick={onMoveUp}
        disabled={index === 0}
        title="Move up"
        className="px-1.5 py-1 hover:bg-zinc-100 disabled:opacity-30"
      >
        ↑
      </button>
      <button
        type="button"
        onClick={onMoveDown}
        disabled={index === total - 1}
        title="Move down"
        className="px-1.5 py-1 hover:bg-zinc-100 disabled:opacity-30"
      >
        ↓
      </button>
      <button
        type="button"
        onClick={onAddAfter}
        title="Add block below"
        className="px-1.5 py-1 hover:bg-zinc-100"
      >
        ＋
      </button>
      <button
        type="button"
        onClick={onRemove}
        title="Delete block"
        className="px-1.5 py-1 text-red-500 hover:bg-red-50"
      >
        ✕
      </button>
    </div>
  );

  return (
    <div className="group relative rounded-lg p-1 transition-colors hover:bg-zinc-50 focus-within:bg-zinc-50">
      <div className="flex items-start gap-2">
        <div className="w-6 pt-2.5 text-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          {controls}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              {BLOCK_LABELS[block.type]}
            </span>
            {block.type === "heading" && (
              <select
                className="rounded border border-zinc-200 bg-white px-1 py-0.5 text-[10px] text-zinc-600"
                value={block.content.level ?? 2}
                onChange={(e) => onUpdate({ ...block.content, level: Number(e.target.value) as 2 | 3 })}
                title="Heading level"
              >
                <option value={2}>H2</option>
                <option value={3}>H3</option>
              </select>
            )}
          </div>

          {block.type === "separator" ? (
            <div className="py-3">
              <hr className="border-t border-zinc-300" />
            </div>
          ) : block.type === "qa" ? (
            <QaBlockForm content={block.content} autoFocus={autoFocus} onUpdate={onUpdate} />
          ) : (
            <div className="relative">
              <textarea
                ref={textareaRef}
                value={text}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                rows={1}
                placeholder={
                  block.type === "title"
                    ? "Document title…"
                    : block.type === "heading"
                      ? "Heading…"
                      : "Start writing — or type / for commands…"
                }
                className="block w-full resize-none overflow-hidden rounded border border-transparent bg-transparent py-1.5 text-[15px] leading-relaxed outline-none placeholder:text-zinc-300 focus:border-zinc-200 focus:bg-white focus:shadow-sm"
              />
              {slashOpen && (
                <div className="absolute left-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-md border border-zinc-200 bg-white py-1 shadow-lg">
                  {SLASH_TYPES.map((item, i) => (
                    <button
                      key={item.type}
                      type="button"
                      onMouseEnter={() => setSlashCursor(i)}
                      onClick={() => applySlash(item.type)}
                      className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-sm ${
                        i === slashCursor ? "bg-blue-50 text-blue-700" : "text-zinc-700"
                      }`}
                    >
                      <span>{item.label}</span>
                      <span className="text-xs text-zinc-400">{item.hint}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
