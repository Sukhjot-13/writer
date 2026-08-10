// lib/html-to-blocks.ts — best-effort HTML→blocks parse-back (FR-41, M5).
//
// Scans a rendered HTML document for the known class vocabulary emitted by
// the template generator (lib/html-template.ts) and reconstructs editable
// blocks: block-title / block-heading / block-paragraph / block-separator /
// block-qa wrappers, and inside .qa-block the .qa-question-text (with <em>
// translation), .qa-grammar-note, .qa-response-label, .qa-user-answer,
// .qa-answer, .qa-translation, .qa-analyse, .qa-vocab-grid (.two-col/.one-col).
//
// Anything unrecognized becomes a paragraph block with the raw HTML preserved
// in its text (per FR-41). Purely string-based — no DOM — so it runs
// identically in the browser (Parse to blocks button) and in node smoke tests.
// Round-trip is best-effort: bold/italic/code markers are restored so
// re-conversion keeps inline formatting (FR-42); hide flags can't be detected
// from rendered HTML and stay false.

import { createBlock, type Block, type QaContent } from "./types";

export interface ParseResult {
  blocks: Block[];
  /** How many top-level elements fell back to a raw-HTML paragraph (FR-41). */
  unparsedCount: number;
}

const VOID_TAGS = new Set([
  "br", "hr", "img", "input", "meta", "link", "area", "base", "col",
  "embed", "source", "track", "wbr",
]);

/** One top-level element: tag, raw attributes, inner HTML, full markup. */
interface Element {
  tag: string;
  attrs: string;
  inner: string;
  raw: string;
}

function classList(attrs: string): string[] {
  const m = attrs.match(/class\s*=\s*"([^"]*)"/i);
  if (!m) return [];
  return m[1].trim().split(/\s+/).filter(Boolean);
}

function decodeHtml(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/** Strip tags, keep <br> as newlines, decode entities, collapse whitespace. */
function textOnly(inner: string): string {
  const withoutBreaks = inner.replace(/<br\s*\/?>/gi, "\n");
  const withoutTags = withoutBreaks.replace(/<[^>]*>/g, "");
  return decodeHtml(withoutTags)
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]*/g, "\n")
    .trim();
}

/** Restore inline markdown markers from rendered tags (**bold**, *italic*, `code`). */
function innerToMarkdown(inner: string): string {
  return textOnly(
    inner
      .replace(/<strong[^>]*>/gi, "**")
      .replace(/<\/strong>/gi, "**")
      .replace(/<em[^>]*>/gi, "*")
      .replace(/<\/em>/gi, "*")
      .replace(/<code[^>]*>/gi, "`")
      .replace(/<\/code>/gi, "`"),
  );
}

/** End index (exclusive) of the element that starts at `start` (index of "<"). */
function elementEnd(html: string, start: number, tag: string): number {
  const gt = html.indexOf(">", start);
  if (gt < 0) return html.length;
  const beforeGt = html.slice(start, gt);
  if (beforeGt.endsWith("/") || VOID_TAGS.has(tag.toLowerCase())) return gt + 1;
  // Walk forward counting nested occurrences of the same tag.
  const openRe = new RegExp(`<${tag}[\\s/>]`, "gi");
  const closeRe = new RegExp(`</${tag}\\s*>`, "gi");
  let depth = 1;
  let i = gt + 1;
  while (depth > 0 && i < html.length) {
    const open = openRe.exec(html.slice(i));
    const close = closeRe.exec(html.slice(i));
    if (close && (!open || close.index < open.index)) {
      depth -= 1;
      i += close.index + close[0].length;
    } else if (open) {
      depth += 1;
      i += open.index + open[0].length;
    } else {
      break;
    }
    openRe.lastIndex = 0;
    closeRe.lastIndex = 0;
  }
  return i;
}

/** Parse `html` into its top-level elements (comments/doctype skipped). */
export function collectTopLevel(html: string): Element[] {
  const elements: Element[] = [];
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt < 0) {
      // trailing text node
      const tail = html.slice(i).trim();
      if (tail) elements.push({ tag: "#text", attrs: "", inner: tail, raw: tail });
      break;
    }
    const before = html.slice(i, lt);
    if (before.trim()) elements.push({ tag: "#text", attrs: "", inner: before, raw: before });
    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      i = end < 0 ? html.length : end + 3;
      continue;
    }
    const open = /^<\s*\/?([a-zA-Z][a-zA-Z0-9-]*)/.exec(html.slice(lt));
    if (!open || html[lt + 1] === "!" || html[lt + 1] === "?") {
      i = html.indexOf(">", lt) + 1 || html.length;
      continue;
    }
    const tag = open[1];
    const gt = html.indexOf(">", lt);
    if (gt < 0) break;
    const attrs = html.slice(lt + open[0].length, gt);
    const end = elementEnd(html, lt, tag);
    const raw = html.slice(lt, end);
    const innerStart = gt + 1;
    elements.push({
      tag: tag.toLowerCase(),
      attrs,
      inner: VOID_TAGS.has(tag.toLowerCase()) ? "" : html.slice(innerStart, Math.max(innerStart, end - tag.length - 3)),
      raw,
    });
    i = end;
  }
  return elements;
}

/** Keep only the `<main>` / `<body>` region so head/style/script are never parsed. */
function extractMain(html: string): string {
  const main = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  if (main) return main[1];
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (body) return body[1];
  return html;
}

/** First element (at any depth) whose class list contains `cls`. */
function byClass(inner: string, cls: string): Element | null {
  const stack = [...collectTopLevel(inner)];
  while (stack.length) {
    const el = stack.pop()!;
    if (classList(el.attrs).includes(cls)) return el;
    // Text nodes must not be descended into: collectTopLevel(text) yields the
    // same #text node again — re-pushing it would loop forever (M5 hang fix).
    if (el.tag === "#text") continue;
    stack.push(...collectTopLevel(el.inner));
  }
  return null;
}

/** All elements (at any depth) whose class list contains `cls` (vocab cols/rows). */
function elementsByClass(inner: string, cls: string): Element[] {
  const found: Element[] = [];
  const stack = [...collectTopLevel(inner)];
  while (stack.length) {
    const el = stack.pop()!;
    if (classList(el.attrs).includes(cls)) found.push(el);
    if (el.tag === "#text") continue;
    stack.push(...collectTopLevel(el.inner));
  }
  return found;
}

function parseRows(container: Element, rowClass: string): { term: string; def: string }[] {
  return elementsByClass(container.inner, rowClass).map((row) => ({
    term: textOnly(byClass(row.inner, "qa-vocab-term")?.inner ?? byClass(row.inner, "qa-expr-term")?.inner ?? ""),
    def: textOnly(byClass(row.inner, "qa-vocab-def")?.inner ?? ""),
  }));
}

function parseQa(inner: string): QaContent {
  const content: QaContent = { question: "", responseLabel: "RÉPONSE" };

  const question = byClass(inner, "qa-question-text");
  if (question) {
    const qInner = question.inner;
    const em = qInner.match(/^(.*?)<em[^>]*>([\s\S]*?)<\/em>/i);
    if (em) {
      content.question = innerToMarkdown(em[1]);
      const translation = innerToMarkdown(em[2]);
      if (translation) content.questionTranslation = translation;
    } else {
      content.question = innerToMarkdown(qInner);
    }
  }

  const grammar = byClass(inner, "qa-grammar-note");
  if (grammar) content.grammarNote = innerToMarkdown(grammar.inner);

  const label = byClass(inner, "qa-response-label");
  if (label) {
    const text = textOnly(label.inner);
    if (text) content.responseLabel = text;
  }

  const userAnswer = byClass(inner, "qa-user-answer");
  if (userAnswer) content.userAnswer = innerToMarkdown(userAnswer.inner);

  // .qa-answer with an EXACT single class is the model answer (the dashed
  // user-answer box carries class qa-user-answer instead).
  const answer = elementsByClass(inner, "qa-answer").find(
    (el) => classList(el.attrs).length === 1 && classList(el.attrs)[0] === "qa-answer",
  );
  if (answer) content.modelAnswer = innerToMarkdown(answer.inner);

  const translation = byClass(inner, "qa-translation");
  if (translation) content.answerTranslation = innerToMarkdown(translation.inner);

  const analysis = byClass(inner, "qa-analyse");
  if (analysis) {
    // The generator prepends a bold "Analyse :" label — strip it (either the
    // raw <strong> or the markdown-restored **Analyse :** form).
    const text = innerToMarkdown(analysis.inner.replace(/<strong[^>]*>Analyse\s*:<\/strong>/i, ""))
      .replace(/^\*\*Analyse\s*:\s*\*\*/, "")
      .trim();
    if (text) content.analysis = text;
  }

  const grid = byClass(inner, "qa-vocab-grid");
  if (grid) {
    const vocab: { term: string; def: string }[] = [];
    const expressions: { term: string; def: string }[] = [];
    for (const col of elementsByClass(grid.inner, "qa-vocab-col")) {
      const header = textOnly(byClass(col.inner, "qa-vocab-header")?.inner ?? "");
      const target = /expression/i.test(header) ? expressions : vocab;
      const rows = [
        ...parseRows(col, "qa-vocab-row").map((r) => ({ ...r })),
        ...parseRows(col, "qa-expr-row").map((r) => ({ ...r })),
      ];
      for (const row of rows) {
        if (row.term || row.def) target.push(row);
      }
    }
    if (vocab.length) content.vocab = vocab;
    if (expressions.length) content.expressions = expressions;
  }

  return content;
}

/** Build a typed block from a factory + content (avoids spread-of-union widening). */
function blockWithContent<T extends Block["type"]>(
  type: T,
  content: Extract<Block, { type: T }>["content"],
): Extract<Block, { type: T }> {
  const block = createBlock(type) as Extract<Block, { type: T }>;
  block.content = content;
  return block;
}

/** Best-effort: a rendered document (or fragment) → editable blocks (FR-41). */
export function parseHtmlToBlocks(html: string): ParseResult {
  const blocks: Block[] = [];
  let unparsedCount = 0;

  for (const el of collectTopLevel(extractMain(html))) {
    const cls = classList(el.attrs);

    if (el.tag === "#text") {
      // whitespace between blocks is skipped; real stray text becomes a
      // paragraph block with the raw text preserved (FR-41)
      if (el.inner.trim()) {
        blocks.push(blockWithContent("paragraph", { text: el.inner.trim(), format: "plain" }));
        unparsedCount++;
      }
      continue;
    }
    if (cls.includes("block-title")) {
      blocks.push(blockWithContent("title", { text: textOnly(el.inner) }));
    } else if (cls.includes("block-heading")) {
      blocks.push(blockWithContent("heading", { text: textOnly(el.inner), level: el.tag === "h3" ? 3 : 2 }));
    } else if (cls.includes("block-paragraph")) {
      const hasMarkup = /<(strong|em|code)[\s>]/i.test(el.inner);
      blocks.push(
        blockWithContent("paragraph", {
          text: hasMarkup ? innerToMarkdown(el.inner) : textOnly(el.inner),
          format: hasMarkup ? "markdown" : "plain",
        }),
      );
    } else if (cls.includes("block-separator")) {
      blocks.push(createBlock("separator"));
    } else if (cls.includes("qa-block") || cls.includes("block-qa")) {
      const qa = parseQa(cls.includes("qa-block") ? el.inner : (byClass(el.inner, "qa-block")?.inner ?? el.inner));
      blocks.push(blockWithContent("qa", qa));
    } else if (el.tag === "hr") {
      blocks.push(createBlock("separator"));
    } else {
      // FR-41: anything unrecognized stays as a paragraph block with the raw
      // HTML preserved — the content survives regeneration even if it isn't
      // editable structure yet.
      const childless = !/<[a-zA-Z]/.test(el.inner);
      blocks.push(blockWithContent("paragraph", { text: childless ? textOnly(el.inner) : el.raw, format: "plain" }));
      unparsedCount++;
    }
  }

  return { blocks, unparsedCount };
}
