// lib/types.ts — shared data model for the writer app (Plan §5).
// Single source of truth for Block / QaContent / Document shapes.
// zod schemas in lib/schemas.ts mirror these (used for API payload validation).

export type BlockType = "title" | "heading" | "paragraph" | "qa" | "separator";

/** Q&A block content (FR-4, FR-33, FR-34). Empty optional fields are hidden in the editor. */
export interface QaContent {
  question: string; // primary language
  questionTranslation?: string; // <em> under question (hideable, FR-34)
  grammarNote?: string; // small italic line
  responseLabel?: string; // default "RÉPONSE"
  userAnswer?: string; // practice answer written by the user (FR-33)
  modelAnswer?: string; // reference answer (AI import or typed manually)
  answerTranslation?: string; // target-language translation
  analysis?: string; // "Analyse : …" block
  vocab?: { term: string; def: string }[]; // → vocabulary column
  expressions?: { term: string; def: string }[]; // → expressions column
  hideTranslation?: boolean; // per-question: omit English translation in output (FR-34)
  hideModelAnswer?: boolean; // per-question: omit model answer in output (FR-34)
}

export type Block =
  | { id: string; type: "title"; tags: string[]; content: { text: string } }
  | { id: string; type: "heading"; tags: string[]; content: { text: string; level?: 2 | 3 } }
  | { id: string; type: "paragraph"; tags: string[]; content: { text: string; format?: "plain" | "markdown" } }
  | { id: string; type: "qa"; tags: string[]; content: QaContent }
  | { id: string; type: "separator"; tags: string[]; content: {} };

export interface Document {
  id: string;
  title: string;
  ownerId?: string | null; // reserved for future auth — always null/empty in v1 (FR-45)
  source: "editor" | "external-html"; // how the document was created (FR-40)
  createdAt: string;
  updatedAt: string;
  tags: string[];
  blocks: Block[]; // may be empty for external-html docs — HTML is the source
  practice?: {
    // document-level practice defaults (FR-35)
    hideTranslations: boolean; // default false — visible while editing
    hideModelAnswers: boolean; // default false
  };
}

/** Convenience factory: a fresh block of the given type with a unique id. */
export function createBlock(type: BlockType, id?: string): Block {
  const bid = id ?? crypto.randomUUID();
  switch (type) {
    case "title":
      return { id: bid, type, tags: [], content: { text: "" } };
    case "heading":
      return { id: bid, type, tags: [], content: { text: "", level: 2 } };
    case "paragraph":
      return { id: bid, type, tags: [], content: { text: "", format: "plain" } };
    case "qa":
      return { id: bid, type, tags: [], content: { question: "", responseLabel: "RÉPONSE" } };
    case "separator":
      return { id: bid, type, tags: [], content: {} };
  }
}

/** Convenience factory: a fresh unsaved document (id generated at creation). */
export function createDocument(title = ""): Document {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title,
    ownerId: null,
    source: "editor",
    createdAt: now,
    updatedAt: now,
    tags: [],
    blocks: [],
  };
}
