// lib/types.ts — shared data model for the writer app (Plan §5).
// Single source of truth for Block / QaContent / Document shapes.
// zod schemas in lib/schemas.ts mirror these (used for API payload validation).

export type BlockType = "title" | "heading" | "paragraph" | "essay" | "qa" | "separator";

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

/** Paragraph block content — text plus AI enrichment (translation/analysis/vocab). */
export interface ParagraphContent {
  text: string;
  format?: "plain" | "markdown";
  translation?: string; // target-language translation (AI enrichment)
  analysis?: string; // short explanation (AI enrichment)
  vocab?: { term: string; def: string }[]; // vocabulary found in the text
  expressions?: { term: string; def: string }[]; // expressions found in the text
  userAnswer?: string; // practice answer written by the user (M6, FR-33 parity with qa)
}

/**
 * Essay block content — a CONTINUOUS piece of writing made of 1..n paragraphs
 * (design pass 2026-08-10). Deliberately distinct from q/a: the whole essay
 * carries ONE shared enrichment set (translation/analysis/vocab/expressions)
 * and ONE practice answer — the user writes the essay as one thing, never
 * per-paragraph. The AI groups consecutive prose paragraphs into an essay.
 */
export interface EssayContent {
  paragraphs: string[];
  translation?: string; // ONE target-language translation of the whole essay (AI)
  analysis?: string; // ONE short explanation of the essay (AI)
  vocab?: { term: string; def: string }[]; // vocabulary found in the essay (AI)
  expressions?: { term: string; def: string }[]; // expressions found in the essay (AI)
  userAnswer?: string; // practice: ONE answer field for the whole essay
}

export type Block =
  | { id: string; type: "title"; tags: string[]; content: { text: string } }
  | { id: string; type: "heading"; tags: string[]; content: { text: string; level?: 2 | 3 } }
  | { id: string; type: "paragraph"; tags: string[]; content: ParagraphContent }
  | { id: string; type: "essay"; tags: string[]; content: EssayContent }
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
    case "essay":
      return { id: bid, type, tags: [], content: { paragraphs: [""] } };
    case "qa":
      return { id: bid, type, tags: [], content: { question: "", responseLabel: "RÉPONSE" } };
    case "separator":
      return { id: bid, type, tags: [], content: {} };
  }
}

/**
 * Return a copy of `block` with new content, preserving id/tags.
 * (Spreading a discriminated union loses the discriminant — build per variant.)
 */
export function setBlockContent(block: Block, content: Block["content"]): Block {
  switch (block.type) {
    case "title":
      return { id: block.id, type: "title", tags: block.tags, content: content as { text: string } };
    case "heading":
      return {
        id: block.id,
        type: "heading",
        tags: block.tags,
        content: content as { text: string; level?: 2 | 3 },
      };
    case "paragraph":
      return {
        id: block.id,
        type: "paragraph",
        tags: block.tags,
        content: content as ParagraphContent,
      };
    case "essay":
      return {
        id: block.id,
        type: "essay",
        tags: block.tags,
        content: content as EssayContent,
      };
    case "qa":
      return { id: block.id, type: "qa", tags: block.tags, content: content as QaContent };
    case "separator":
      return { id: block.id, type: "separator", tags: block.tags, content: {} };
  }
}

/**
 * Return a copy of `block` converted to another type (slash-command, FR-2),
 * keeping id/tags and resetting content to the new type's empty shape.
 */
export function replaceBlockType(block: Block, type: BlockType): Block {
  switch (type) {
    case "title":
      return { id: block.id, type: "title", tags: block.tags, content: { text: "" } };
    case "heading":
      return { id: block.id, type: "heading", tags: block.tags, content: { text: "", level: 2 } };
    case "paragraph":
      return { id: block.id, type: "paragraph", tags: block.tags, content: { text: "", format: "plain" } };
    case "essay":
      return { id: block.id, type: "essay", tags: block.tags, content: { paragraphs: [""] } };
    case "qa":
      return { id: block.id, type: "qa", tags: block.tags, content: { question: "", responseLabel: "RÉPONSE" } };
    case "separator":
      return { id: block.id, type: "separator", tags: block.tags, content: {} };
  }
}

/** Convenience factory: a fresh unsaved document (id generated unless given). */
export function createDocument(title = "", id?: string): Document {
  const now = new Date().toISOString();
  return {
    id: id ?? crypto.randomUUID(),
    title,
    ownerId: null,
    source: "editor",
    createdAt: now,
    updatedAt: now,
    tags: [],
    blocks: [],
  };
}
