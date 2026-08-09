// components/BlockList.tsx — renders the document's blocks in order with
// reorder/remove/insert controls (FR-3) and an add-block affordance.

"use client";

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
}: BlockListProps) {
  return (
    <div className="flex flex-col gap-1">
      {blocks.map((block, index) => (
        <Block
          key={block.id}
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
        />
      ))}
      <div className="flex justify-center py-2">
        <AddBlockMenu onAdd={onAppend} />
      </div>
    </div>
  );
}
