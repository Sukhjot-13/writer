// components/BlockList.tsx — renders the document's blocks in order with
// reorder/remove/insert controls (FR-3) and an add-block affordance.
// M5: native HTML5 drag-and-drop reordering (no dnd-kit dependency) — the
// ↑/↓ buttons stay as the keyboard/fallback path.

"use client";

import { useEffect, useState } from "react";
import type { Block as BlockModel, BlockType } from "@/lib/types";
import Block from "./Block";
import AddBlockMenu from "./AddBlockMenu";

// 2026-08-10: the add control remembers the last-chosen block type per session
// — direct "+" clicks use it, the caret opens the full menu (AddBlockMenu).
const LAST_TYPE_KEY = "writer-app:add-type";

interface BlockListProps {
  blocks: BlockModel[];
  pendingFocusId: string | null;
  onUpdateBlock: (id: string, content: BlockModel["content"]) => void;
  onConvertBlock: (id: string, type: BlockType) => void;
  onRemoveBlock: (id: string) => void;
  onMoveBlock: (id: string, dir: -1 | 1) => void;
  onInsertAfter: (id: string, type: BlockType) => void;
  onAppend: (type: BlockType) => void;
  onReorder: (fromId: string, toId: string) => void; // M5: drag & drop
  onSplitBelow: (id: string, rest: string) => void; // M5: Enter splits (FR-3)
  onRemoveFocusUp: (id: string) => void; // M5: backspace merge-up (FR-3)
  onUpdateTags: (id: string, tags: string[]) => void; // M5: FR-5
  // M6 redesign: Practice master key — every block is shown; qa/paragraph
  // blocks get "My answer" boxes (see Block.tsx).
  practiceMode: boolean;
  checked: boolean;
  // 2026-08-10 M7 round 4: "Detailed" — pass-through to blocks (false = focus
  // mode, the default: main content only).
  detailed: boolean;
}

export default function BlockList({
  blocks,
  pendingFocusId,
  onUpdateBlock,
  onConvertBlock,
  onRemoveBlock,
  onMoveBlock,
  onInsertAfter,
  onAppend,
  onReorder,
  onSplitBelow,
  onRemoveFocusUp,
  onUpdateTags,
  practiceMode,
  checked,
  detailed,
}: BlockListProps) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  // 2026-08-10: default type for the "+" add control (persisted per session).
  const [lastType, setLastType] = useState<BlockType>("paragraph");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LAST_TYPE_KEY);
      if (saved && ["paragraph", "essay", "heading", "qa", "title", "separator"].includes(saved)) {
        setLastType(saved as BlockType);
      }
    } catch {
      /* storage unavailable — keep default */
    }
  }, []);
  const pickType = (type: BlockType) => {
    setLastType(type);
    try {
      localStorage.setItem(LAST_TYPE_KEY, type);
    } catch {
      /* ignore */
    }
  };

  // Practice shows every block (M6): qa + paragraph + essay blocks get "My
  // answer" boxes, title/heading read as context, separators render as
  // dividers. Structure is FROZEN in practice: no add menu, no per-block
  // controls (Block), no drag — the document can't change mid-practice.
  const visible = blocks;

  return (
    <div className="flex flex-col gap-1">
      {visible.map((block, index) => (
        <div
          key={block.id}
          draggable={!practiceMode && (dragId === null || dragId === block.id)}
          onDragStart={(e) => {
            setDragId(block.id);
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", block.id);
          }}
          onDragOver={(e) => {
            e.preventDefault(); // allow drop
            if (overId !== block.id) setOverId(block.id);
          }}
          onDragLeave={() => {
            if (overId === block.id) setOverId(null);
          }}
          onDrop={(e) => {
            e.preventDefault();
            const from = dragId ?? e.dataTransfer.getData("text/plain");
            if (from && from !== block.id) onReorder(from, block.id);
            setDragId(null);
            setOverId(null);
          }}
          onDragEnd={() => {
            setDragId(null);
            setOverId(null);
          }}
          className={
            overId === block.id && dragId && dragId !== block.id
              ? "rounded-lg outline-2 outline-dashed outline-blue-400"
              : dragId === block.id
                ? "rounded-lg opacity-40"
                : ""
          }
        >
          <Block
            block={block}
            index={index}
            total={visible.length}
            autoFocus={block.id === pendingFocusId}
            onUpdate={(content) => onUpdateBlock(block.id, content)}
            onConvert={(type) => onConvertBlock(block.id, type)}
            onRemove={() => onRemoveBlock(block.id)}
            onMoveUp={() => onMoveBlock(block.id, -1)}
            onMoveDown={() => onMoveBlock(block.id, 1)}
            onAddAfter={() => onInsertAfter(block.id, lastType)}
            onSplitBelow={(rest) => onSplitBelow(block.id, rest)}
            onRemoveFocusUp={() => onRemoveFocusUp(block.id)}
            onUpdateTags={(tags) => onUpdateTags(block.id, tags)}
            practiceMode={practiceMode}
            checked={checked}
            detailed={detailed}
          />
        </div>
      ))}
      {!practiceMode && (
        <div className="flex justify-center py-2">
          <AddBlockMenu lastType={lastType} onAdd={onAppend} onPickType={pickType} />
        </div>
      )}
    </div>
  );
}
