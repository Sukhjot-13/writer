// components/Block.tsx — single block editor row (FR-1/3/25).
// Handles title / heading / paragraph / essay (text editing) and separator.
// Per-block controls: ↑ ↓ ✕ (reorder/delete) and ＋ (insert after) on hover.
// Typing "/" opens the slash-command menu (FR-2) to convert the block type.

"use client";

import { useEffect, useRef, useState } from "react";
import type {
  Block as BlockModel,
  BlockType,
  EssayContent,
  ParagraphContent,
} from "@/lib/types";
import { parseTags } from "@/lib/tags"; // M5 (FR-5)
import QaBlockForm from "./QaBlockForm";
import ParagraphFields from "./ParagraphFields"; // M6: AI enrichment (paragraphs + essays)
import AutoGrowTextarea from "./AutoGrowTextarea"; // 2026-08-10: auto-grow everywhere

// M6: practice view of a paragraph — the paragraph stays a continuous piece of
// writing: its text in normal document typography with the "My answer" space
// flowing directly beneath (no card, no duplicated boxes — a paragraph is one
// continuous thing).
// 2026-08-10 M7 round 4 (user: "when I check the answer in paragraph it is
// showing me the translation fix it"): checking NO LONGER reveals the English
// translation — paragraphs have no model answer, so there is nothing to check
// against (a future practice-review option may add real reference paragraphs).
// The checked state is just visual: the answer box turns emerald.
// Sizes (2026-08-10 #2, user feedback): the FRENCH passage is the practicing
// material, so it leads at 17px; practice is for French, not English.
function PracticeParagraphCard({
  content,
  checked,
  onUpdate,
}: {
  content: ParagraphContent;
  checked: boolean;
  onUpdate: (content: ParagraphContent) => void;
}) {
  return (
    <div className="mt-1">
      <div className="py-1.5 text-[17px] leading-relaxed text-zinc-900">
        {content.text || <span className="text-zinc-300">(empty paragraph)</span>}
      </div>

      <AutoGrowTextarea
        rows={2}
        value={content.userAnswer ?? ""}
        placeholder="Your answer — write in French if you can…"
        onChange={(e) => onUpdate({ ...content, userAnswer: e.target.value })}
        className={`block w-full rounded-md border px-3 py-2 text-[16px] leading-relaxed text-zinc-900 outline-none placeholder:text-zinc-300 focus:bg-white focus:shadow-sm ${
          checked
            ? "border-emerald-400 bg-emerald-50/40"
            : content.userAnswer
              ? "border-dashed border-blue-200 bg-transparent"
              : "border-dashed border-amber-300 bg-amber-50/40"
        }`}
      />
    </div>
  );
}

// Essay (2026-08-10): practice view of a continuous passage. The user gets
// exactly ONE "My answer" field — an essay is written as a single thing, never
// per-paragraph (unlike q/a, there is nothing to answer separately).
// 2026-08-10 #5: practice shows ONLY the essay's heading (the passage is the
// WRITING task, not reading material — user: "in practice it should only show
// the heading for the essay"); the heading reads as the prompt at 17px with
// the answer field flowing beneath.
// 2026-08-10 M7 round 4: checking reveals NO English reference box (same as
// paragraphs — essays have no model answer); the checked state is the emerald
// answer box only.
function PracticeEssayCard({
  content,
  checked,
  onUpdate,
}: {
  content: EssayContent;
  checked: boolean;
  onUpdate: (content: EssayContent) => void;
}) {
  return (
    <div className="mt-1">
      <div className="py-1.5 text-[17px] font-semibold leading-relaxed text-zinc-900">
        {content.heading || (
          <span className="font-normal text-zinc-300">(essay title)</span>
        )}
      </div>

      <AutoGrowTextarea
        rows={4}
        value={content.userAnswer ?? ""}
        placeholder="Your answer — write the whole essay in French if you can…"
        onChange={(e) => onUpdate({ ...content, userAnswer: e.target.value })}
        className={`block w-full rounded-md border px-3 py-2 text-[16px] leading-relaxed text-zinc-900 outline-none placeholder:text-zinc-300 focus:bg-white focus:shadow-sm ${
          checked
            ? "border-emerald-400 bg-emerald-50/40"
            : content.userAnswer
              ? "border-dashed border-blue-200 bg-transparent"
              : "border-dashed border-amber-300 bg-amber-50/40"
        }`}
      />
    </div>
  );
}

export const BLOCK_LABELS: Record<BlockType, string> = {
  title: "Title",
  heading: "Heading",
  paragraph: "Paragraph",
  essay: "Essay",
  qa: "Question & Answer",
  separator: "Separator",
};

/** Block types the slash menu can convert to (FR-2: /para /h2 /qa /title). */
export const SLASH_TYPES: { type: BlockType; label: string; hint: string }[] = [
  { type: "paragraph", label: "Paragraph", hint: "/para" },
  { type: "essay", label: "Essay", hint: "/essay" },
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
  // M5 (FR-3): Enter splits the block, backspace on empty merges up.
  onSplitBelow: (rest: string) => void;
  onRemoveFocusUp: () => void;
  // M5 (FR-5): per-block tags become CSS classes in the output HTML.
  onUpdateTags: (tags: string[]) => void;
  // M6 redesign: Practice master key — answers separated; qa + paragraph blocks
  // get "My answer" boxes, title/heading render read-only.
  practiceMode: boolean;
  checked: boolean;
  // 2026-08-10 M7 round 4 (user): the toolbar toggle is now "Detailed" —
  // UNCHECKED by default = focus mode (only the main content: qa question +
  // answer, paragraph text, essay paragraphs; all enrichment hidden). Checking
  // it reveals translations/analysis/vocab. Inverted from the old "Focus"
  // checkbox (which was checked by default and confused the layout).
  detailed: boolean;
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
  onSplitBelow,
  onRemoveFocusUp,
  onUpdateTags,
  practiceMode,
  checked,
  detailed,
}: BlockProps) {
  const [tagsDraft, setTagsDraft] = useState(block.tags.join(", "));
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashCursor, setSlashCursor] = useState(0);

  // Auto-grow the primary textarea (title/heading/paragraph).
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

  // Keep the tags draft in sync when tags change outside this input.
  useEffect(() => {
    setTagsDraft(block.tags.join(", "));
  }, [block.tags]);

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
      return;
    }
    // FR-3 (M5): Enter creates a new block below — splitting at the cursor
    // when the caret isn't at the end; Shift+Enter inserts a newline.
    // 2026-08-10: NOT for paragraphs — a paragraph is a continuous thing;
    // Enter must just insert a newline inside it (user feedback).
    if (e.key === "Enter" && !e.shiftKey && block.type !== "paragraph") {
      e.preventDefault();
      const pos = textareaRef.current?.selectionStart ?? text.length;
      if (pos < text.length) {
        onUpdate({ ...(block.content as object), text: text.slice(0, pos) });
        onSplitBelow(text.slice(pos));
      } else {
        onAddAfter();
      }
      return;
    }
    // FR-3 (M5): backspace on an empty block merges it into the one above.
    if (e.key === "Backspace" && text === "") {
      e.preventDefault();
      onRemoveFocusUp();
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
    <div className="flex items-center overflow-hidden rounded-lg border border-zinc-200 bg-white text-xs text-zinc-400 shadow-sm">
      <button
        type="button"
        onClick={onMoveUp}
        disabled={index === 0}
        title="Move up"
        className="px-1.5 py-1 transition-colors hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-30"
      >
        ↑
      </button>
      <button
        type="button"
        onClick={onMoveDown}
        disabled={index === total - 1}
        title="Move down"
        className="px-1.5 py-1 transition-colors hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-30"
      >
        ↓
      </button>
      <button
        type="button"
        onClick={onAddAfter}
        title="Add block below"
        className="px-1.5 py-1 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
      >
        ＋
      </button>
      <button
        type="button"
        onClick={onRemove}
        title="Delete block"
        className="px-1.5 py-1 transition-colors hover:bg-red-50 hover:text-red-600"
      >
        ✕
      </button>
    </div>
  );

  // Document-style typography per block type (UI polish).
  const textAreaCls =
    block.type === "title"
      ? "text-2xl font-semibold text-zinc-900"
      : block.type === "heading"
        ? "text-lg font-semibold text-zinc-900"
        : "text-[15px] text-zinc-800";

  return (
    /* M7 round 7: data-block-id marks the block row — the editor's
       toggleDetailed scroll-anchor targets it (elementFromPoint + closest)
       so toggling Detailed keeps the user's place when content heights change. */
    <div data-block-id={block.id} className="group relative rounded-xl p-1.5 transition-colors hover:bg-zinc-50 focus-within:bg-zinc-50">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          {/* Header row: label · heading level · tags · controls (on hover).
              2026-08-10: practice is read-only structure — no heading level,
              no tags, no ↑/↓/＋/✕ controls, no drag (see BlockList). */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              {BLOCK_LABELS[block.type]}
            </span>
            {!practiceMode && block.type === "heading" && (
              <select
                className="rounded border border-zinc-200 bg-white px-1 py-0.5 text-[10px] text-zinc-600 outline-none focus:border-blue-400"
                value={block.content.level ?? 2}
                onChange={(e) => onUpdate({ ...block.content, level: Number(e.target.value) as 2 | 3 })}
                title="Heading level"
              >
                <option value={2}>H2</option>
                <option value={3}>H3</option>
              </select>
            )}
            {!practiceMode && (
              <input
                value={tagsDraft}
                onChange={(e) => setTagsDraft(e.target.value)}
                onBlur={() => onUpdateTags(parseTags(tagsDraft))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                placeholder="tags"
                title="Custom tags, comma-separated — become CSS classes in the output HTML"
                className="ml-auto w-28 rounded border border-transparent bg-transparent px-1.5 py-0.5 text-[10px] text-zinc-400 outline-none placeholder:text-zinc-300 focus:border-zinc-200 focus:bg-white focus:text-zinc-600"
              />
            )}
            {!practiceMode && (
              <div className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                {controls}
              </div>
            )}
          </div>

          {block.type === "separator" ? (
            <div className="py-3">
              <hr className="border-t border-zinc-300" />
            </div>
          ) : block.type === "qa" ? (
            <QaBlockForm
              content={block.content}
              autoFocus={autoFocus}
              mode={practiceMode ? "practice" : "normal"}
              checked={checked}
              detailed={detailed}
              onUpdate={onUpdate}
            />
          ) : practiceMode && block.type === "paragraph" ? (
            // M6: practice gives paragraphs the same answer flow as questions.
            <PracticeParagraphCard content={block.content} checked={checked} onUpdate={onUpdate} />
          ) : practiceMode && block.type === "essay" ? (
            // Essay (2026-08-10): the whole passage reads as one continuous
            // text with exactly ONE answer field — never per-paragraph boxes.
            <PracticeEssayCard content={block.content} checked={checked} onUpdate={onUpdate} />
          ) : practiceMode ? (
            // Title / heading — read-only context in practice.
            <div className={`py-1.5 leading-relaxed ${textAreaCls}`}>{text}</div>
          ) : block.type === "essay" ? (
            // Essay editor: an optional heading field (2026-08-10 #5 — practice
            // shows only the heading, so a title makes the task prompt clear),
            // one auto-grow textarea per paragraph (Enter just adds a newline
            // inside it — essays are continuous), an "add paragraph" button,
            // and the shared enrichment fields below.
            <div>
              <AutoGrowTextarea
                value={block.content.heading ?? ""}
                onChange={(e) => onUpdate({ ...block.content, heading: e.target.value })}
                rows={1}
                placeholder="Essay title (optional)…"
                className="block w-full rounded-md border border-transparent bg-transparent py-1.5 text-[15px] font-semibold leading-relaxed text-zinc-900 outline-none placeholder:text-zinc-300 placeholder:font-normal focus:border-zinc-200 focus:bg-white focus:shadow-sm"
              />
              {block.content.paragraphs.map((p, i) => (
                <AutoGrowTextarea
                  key={i}
                  value={p}
                  onChange={(e) => {
                    const next = [...block.content.paragraphs];
                    next[i] = e.target.value;
                    onUpdate({ ...block.content, paragraphs: next });
                  }}
                  rows={1}
                  placeholder={`Paragraph ${i + 1}…`}
                  className="block w-full rounded-md border border-transparent bg-transparent py-1.5 leading-relaxed outline-none placeholder:text-zinc-300 focus:border-zinc-200 focus:bg-white focus:shadow-sm"
                />
              ))}
              <button
                type="button"
                onClick={() => onUpdate({ ...block.content, paragraphs: [...block.content.paragraphs, ""] })}
                className="rounded border border-dashed border-zinc-200 px-2 py-1 text-xs text-zinc-400 transition-colors hover:border-emerald-300 hover:text-emerald-600"
              >
                + Add paragraph
              </button>
              {detailed && <ParagraphFields content={block.content} onUpdate={onUpdate} />}
            </div>
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
                className={`block w-full resize-none overflow-hidden rounded-md border border-transparent bg-transparent py-1.5 leading-relaxed outline-none placeholder:text-zinc-300 focus:border-zinc-200 focus:bg-white focus:shadow-sm ${textAreaCls}`}
              />
              {/* M6: AI enrichment for paragraphs (translation/analysis/vocab) —
                  hidden in practice AND focus mode (2026-08-10: focus shows the
                  main content only). */}
              {block.type === "paragraph" && !practiceMode && detailed && (
                <ParagraphFields content={block.content} onUpdate={onUpdate} />
              )}
              {slashOpen && (
                <div className="absolute left-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-lg border border-zinc-200 bg-white py-1 shadow-xl">
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
