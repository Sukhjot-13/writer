// components/BlockList.tsx — renders the document's blocks in order with
// reorder/remove/insert controls (FR-3) and an add-block affordance.
// M5: native HTML5 drag-and-drop reordering (no dnd-kit dependency) — the
// ↑/↓ buttons stay as the keyboard/fallback path.

"use client";

import { useState } from "react";
import type { Block as BlockModel, BlockType } from "@/lib/types";
import Block from "./Block";
import AddBlockMenu from "./AddBlockMenu";

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
}: BlockListProps) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-1">
      {blocks.map((block, index) => (
        <div
          key={block.id}
          draggable={dragId === null || dragId === block.id}
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
            total={blocks.length}
            autoFocus={block.id === pendingFocusId}
            onUpdate={(content) => onUpdateBlock(block.id, content)}
            onConvert={(type) => onConvertBlock(block.id, type)}
            onRemove={() => onRemoveBlock(block.id)}
            onMoveUp={() => onMoveBlock(block.id, -1)}
            onMoveDown={() => onMoveBlock(block.id, 1)}
            onAddAfter={() => onInsertAfter(block.id, "paragraph")}
            onSplitBelow={(rest) => onSplitBelow(block.id, rest)}
            onRemoveFocusUp={() => onRemoveFocusUp(block.id)}
            onUpdateTags={(tags) => onUpdateTags(block.id, tags)}
          />
        </div>
      ))}
      <div className="flex justify-center py-2">
        <AddBlockMenu onAdd={onAppend} />
      </div>
    </div>
  );
}
