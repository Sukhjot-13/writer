// lib/html-template.ts — template-mode HTML generator (FR-9, Plan §8.1).
//
// Deterministic, self-contained styled HTML built from block data + the shared
// design tokens (FR-43) — the offline, always-available converter (no AI, no
// API key). The generated document follows docs/html_instructions.md: A4,
// Georgia/Times, heading/badge/accent colors, `.qa-block` cards.
//
// Q&A rendering (M2): auto-numbered circular badge, translation `<em>`, grammar
// note, response label, user-answer box (dashed left border, only when filled),
// model answer, answer translation, analysis, vocab/expressions grid
// (.two-col/.one-col). Field order (2026-08-10, user request): question →
// translation → analysis → answer (model answer + answer translation) → etc.
// Omission rules (FR-36): elements hidden via `hideTranslation` /
// `hideModelAnswer` (per block) or the document-level `practice` defaults are
// OMITTED entirely — never blurred. Preview toggles (2026-08-10): `hidden`
// opts omit enrichment sections for qa/paragraph/essay blocks — the main
// content (title, headings, questions, paragraph text) is never hidden.
//
// Color policy (FR-47): every color value comes from the tokens object —
// no color literals in app code. Text-shade variations (#444/#555/#333 in the
// instructions) are expressed as mainText + opacity.

import type { Block, Document, QaContent } from "./types";
import type { DesignTokens } from "./design-tokens";

/** Escape HTML so user content can never inject markup (defense in depth — preview iframe is also sandboxed). */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Sanitize a user tag ("#past-tense" → "tag-past-tense") into a valid CSS class. */
function tagClass(tag: string): string {
  const clean = tag.trim().replace(/^#/, "").replace(/[^a-zA-Z0-9_-]/g, "-");
  return clean ? ` tag-${clean}` : "";
}

/** Light inline markdown: `code`, **bold**, *italic* (applied after HTML escaping). */
export function renderInlineMarkdown(text: string): string {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s>])\*([^*\n]+)\*/g, "$1<em>$2</em>");
}

function buildCss(tokens: DesignTokens, paper = false): string {
  const t = tokens;
  // Paper mode (preview, 2026-08-10 #4): the document is shown as an A4 sheet
  // at the SPEC's SCREEN rendering — base font (11.5px) and page margins
  // (18mm), matching "GLOBAL STYLE: A4 (210×297mm), margins 18mm, base 11.5px".
  // True print behavior lives in the @media print rules: font 10.5px, @page
  // margin 14mm, no shadow. The backdrop stays transparent so the preview
  // sheet's own background shows around the paper.
  const paperRules = paper
    ? `
.document { max-width: 210mm; margin: 0 auto; padding: ${t.spacing.pageMargin}; background: #fff; box-shadow: 0 2px 10px rgba(0,0,0,0.18); }
@media print {
  .document { margin: 0; padding: 0; box-shadow: none; }
}`
    : "";
  return `
@page { size: A4; margin: ${t.spacing.printMargin}; }
* { box-sizing: border-box; }
body { font-family: ${t.fonts.base}; font-size: ${t.sizes.base}; color: ${t.colors.mainText}; line-height: 1.6; margin: 0; }
.document { max-width: 210mm; margin: 0 auto; padding: ${t.spacing.pageMargin}; }
@media print {
  .document { max-width: none; padding: 0; }
  body { font-size: ${t.sizes.print}; }
  .qa-block, .card { break-inside: avoid; }
}
${paperRules}
h1.block-title { color: ${t.colors.heading}; font-size: 1.9em; margin: 0 0 0.4em; }
h2.block-heading { color: ${t.colors.heading}; font-size: 1.45em; border-bottom: 3px solid ${t.colors.heading}; padding-bottom: 4px; margin: 1em 0 0.5em; }
h3.block-heading { color: ${t.colors.heading}; font-size: 1.2em; margin: 0.9em 0 0.4em; }
/* 2026-08-10 #3 (user feedback): prose is the FRENCH reading material — it
   leads at 1.15em (bigger than the base); all secondary text (translations,
   notes, labels) is sized in em relative to the base so it stays SMALLER than
   the French. (Was rem — relative to the 16px root, which made English
   translations bigger than French paragraphs. Fixed.) */
p.block-paragraph { font-size: 1.15em; margin: 0 0 0.9em; }
/* Essay (2026-08-10): one continuous passage — paragraphs render as
   .block-paragraph inside a .block-essay wrapper, sharing ONE enrichment set. */
.block-essay { margin: 0 0 0.9em; }
/* Essay heading (2026-08-10 #5): optional short title above the passage —
   navy, bold, small (0.95em), sits between the block margin and the prose. */
.block-essay-heading { margin: 0 0 0.5em; font-weight: bold; color: ${t.colors.heading}; font-size: 0.95em; }
p.p-translation { font-style: italic; font-size: 0.9em; color: ${t.colors.mainText}; opacity: 0.8; margin: -0.5em 0 0.5em; }
.p-analyse { font-size: 0.88em; color: ${t.colors.mainText}; opacity: 0.9; margin: 0 0 0.5em; }
.p-analyse strong { color: ${t.colors.mainText}; opacity: 1; }
hr.block-separator { border: none; border-top: 1px solid ${t.colors.border}; margin: 1.4em 0; }
code { background: ${t.colors.highlightBg}; padding: 2px 5px; border-radius: 2px; font-family: ${t.fonts.mono}; }
/* ---- Q&A blocks (instructions: "REUSABLE COMPONENTS — Q&A BLOCKS") ---- */
.qa-block { border: 1px solid ${t.colors.border}; border-radius: ${t.radius.card}; padding: ${t.spacing.cardPadding}; margin: 0 0 1em; background: #fff; }
.qa-question { display: flex; align-items: flex-start; gap: 10px; }
.qa-num { flex: none; width: 24px; height: 24px; border-radius: ${t.radius.badge}; background: ${t.colors.badgeBg}; color: ${t.colors.badgeText}; font-weight: bold; text-align: center; line-height: 24px; font-size: 0.8em; }
.qa-question-text { margin: 0; font-weight: bold; color: ${t.colors.heading}; }
.qa-question-text em { font-weight: normal; font-size: 0.9em; opacity: 0.85; }
.qa-grammar-note { margin: 4px 0 0 34px; font-style: italic; font-size: 0.82em; color: ${t.colors.mainText}; opacity: 0.75; }
.qa-response-label { margin: 10px 0 4px; text-transform: uppercase; color: ${t.colors.accentGreen}; letter-spacing: 1.5px; font-size: 0.78em; font-weight: bold; }
.qa-answer, .qa-user-answer { background: ${t.colors.highlightBg}; padding: ${t.spacing.answerPadding}; margin-top: 6px; }
.qa-answer { border-left: 3px solid ${t.colors.accentGreen}; }
.qa-user-answer { border-left: 3px dashed ${t.colors.accentGreen}; }
.qa-translation { margin-top: 6px; font-style: italic; font-size: 0.9em; color: ${t.colors.mainText}; opacity: 0.8; }
.qa-analyse { margin-top: 6px; font-size: 0.88em; color: ${t.colors.mainText}; opacity: 0.9; }
.qa-analyse strong { color: ${t.colors.mainText}; opacity: 1; }
.qa-vocab-grid { margin-top: 10px; display: flex; border: 1px solid ${t.colors.border}; border-radius: 4px; overflow: hidden; }
.qa-vocab-grid.one-col { flex-direction: column; }
.qa-vocab-col { flex: 1; min-width: 0; }
.qa-vocab-col + .qa-vocab-col { border-left: 1px solid ${t.colors.border}; }
.qa-vocab-header { background: ${t.colors.lightBg}; text-transform: uppercase; color: ${t.colors.heading}; font-size: 0.78em; font-weight: bold; padding: 5px 10px; }
.qa-vocab-body { background: ${t.colors.vocabBg}; padding: 0; }
.qa-vocab-row, .qa-expr-row { display: flex; justify-content: space-between; gap: 8px; padding: 4px 10px; }
.qa-vocab-row + .qa-vocab-row, .qa-expr-row + .qa-expr-row, .qa-vocab-row + .qa-expr-row, .qa-expr-row + .qa-vocab-row { border-top: 1px solid ${t.colors.rowBorder}; }
.qa-vocab-term, .qa-expr-term { font-weight: bold; color: ${t.colors.accentGreen}; flex: none; }
.qa-vocab-def, .qa-expr-def { text-align: right; }
/* Empty lines (2026-08-10 #6): blank ruled writing area where the model answer
   is hidden (like the old "questions" sheet — questions + blank lines). */
.blank-answer { margin-top: 6px; border: 1px dashed ${t.colors.border}; border-radius: 4px; padding: 8px; }
.blank-answer .line { border-bottom: 1px dashed ${t.colors.border}; height: 1.7em; }
.blank-answer .line:last-child { border-bottom: none; height: 0; }
`;
}

/**
 * Render the vocabulary/expressions grid. `.two-col` when both lists exist,
 * `.one-col` when only one — per the instructions' critical rules.
 */
function vocabGridHtml(vocab: { term: string; def: string }[] | undefined, expressions: { term: string; def: string }[] | undefined): string {
  const colClass = vocab && expressions ? "two-col" : "one-col";

  const col = (title: string, rows: { term: string; def: string }[], rowClass: string, termClass: string) => `
      <div class="qa-vocab-col">
        <div class="qa-vocab-header">${title}</div>
        <div class="qa-vocab-body">${rows
          .map(
            (r) =>
              `<div class="${rowClass}"><span class="${termClass}">${escapeHtml(r.term)}</span><span class="qa-vocab-def">${escapeHtml(r.def)}</span></div>`,
          )
          .join("")}</div>
      </div>`;

  const parts: string[] = [];
  if (vocab?.length) parts.push(col("Vocabulaire Clé", vocab, "qa-vocab-row", "qa-vocab-term"));
  if (expressions?.length) parts.push(col("Expressions Avancées", expressions, "qa-expr-row", "qa-expr-term"));
  if (parts.length === 0) return "";
  return `<div class="qa-vocab-grid ${colClass}">${parts.join("")}</div>`;
}

/** Whether a QA element is visible: omitted when hidden per block flag OR document-level default (FR-34/35/36). */
function qaVisible(doc: Document, content: QaContent, kind: "translation" | "modelAnswer"): boolean {
  if (kind === "translation") {
    return !(content.hideTranslation || doc.practice?.hideTranslations);
  }
  return !(content.hideModelAnswer || doc.practice?.hideModelAnswers);
}

/** Blank ruled writing area (2026-08-10 #6) — mirrors the PDF's BlankAnswerArea:
 *  a dashed box with ~4 ruled lines, for when "Empty lines" is on and the model
 *  answer is hidden (the old "questions" sheet behavior). */
function blankAnswerHtml(): string {
  return `<div class="blank-answer">${[0, 1, 2, 3].map(() => `<div class="line"></div>`).join("")}</div>`;
}

function qaBlockHtml(
  doc: Document,
  block: Extract<Block, { type: "qa" }>,
  tokens: DesignTokens,
  number: number,
  opts: TemplateRenderOpts,
): string {
  const content = block.content;
  const wrapper = `block block-${block.type}${block.tags.map(tagClass).join("")}`;
  const md = renderInlineMarkdown;
  const hidden = opts.hidden ?? {};

  const translation = !hidden.translations && qaVisible(doc, content, "translation") && content.questionTranslation
    ? `<em>${md(content.questionTranslation)}</em>`
    : "";
  const grammarNote = content.grammarNote ? `<p class="qa-grammar-note">${md(content.grammarNote)}</p>` : "";
  const responseLabel = content.responseLabel
    ? `<p class="qa-response-label">${escapeHtml(content.responseLabel)}</p>`
    : "";
  const userAnswer = content.userAnswer
    ? `<div class="qa-user-answer">${md(content.userAnswer)}</div>`
    : "";
  const modelAnswer = !hidden.modelAnswers && qaVisible(doc, content, "modelAnswer") && content.modelAnswer
    ? `<div class="qa-answer">${md(content.modelAnswer)}</div>`
    : "";
  // Empty lines (2026-08-10 #6): when the model answer is not shown (hidden via
  // toggle/flag or simply absent) and the user has not written their own, the
  // answer slot becomes blank ruled writing lines — like the "questions" sheet.
  const blank = !modelAnswer && opts.emptyLines && !content.userAnswer ? blankAnswerHtml() : "";
  const answerTranslation = !hidden.translations && qaVisible(doc, content, "translation") && content.answerTranslation
    ? `<div class="qa-translation">${md(content.answerTranslation)}</div>`
    : "";
  const analysis = !hidden.analyses && content.analysis
    ? `<div class="qa-analyse"><strong>Analyse :</strong> ${md(content.analysis)}</div>`
    : "";
  // 2026-08-10 field order (user request): question → translation → analysis →
  // answer → answer translation → practice answer → grammar note → grid.
  // 2026-08-10 #5: the response label ("RÉPONSE") moved ABOVE the answer — it
  // labels the answer area, so it sits between the analysis and the answer
  // (user: "reponse text is shown below the answer why?").
  const grid = hidden.vocab ? "" : vocabGridHtml(content.vocab, content.expressions);

  return `<section class="${wrapper}"><div class="qa-block">
<div class="qa-question"><span class="qa-num">${number}</span><p class="qa-question-text">${md(content.question)}${translation}</p></div>
${analysis}${responseLabel}${modelAnswer || blank}${answerTranslation}${userAnswer}${grammarNote}${grid}
</div></section>`;
}

function blockToHtml(
  doc: Document,
  block: Block,
  tokens: DesignTokens,
  qaNumber: { n: number },
  opts: TemplateRenderOpts,
): string {
  const wrapper = `block block-${block.type}${block.tags.map(tagClass).join("")}`;
  const hidden = opts.hidden ?? {};
  switch (block.type) {
    case "title":
      return `<h1 class="${wrapper}">${escapeHtml(block.content.text)}</h1>`;
    case "heading": {
      const Tag = block.content.level === 3 ? "h3" : "h2";
      return `<${Tag} class="${wrapper}">${escapeHtml(block.content.text)}</${Tag}>`;
    }
    case "paragraph": {
      const c = block.content;
      const text =
        c.format === "markdown"
          ? renderInlineMarkdown(c.text)
          : escapeHtml(c.text).replace(/\n/g, "<br>");
      // M6: AI enrichment for all text — translation, analysis, vocab grid —
      // plus the practice answer (dashed box, same as qa user answers).
      // 2026-08-10: preview toggles hide enrichment; the paragraph TEXT is main
      // content and never hidden.
      const userAnswer = c.userAnswer
        ? `<div class="qa-user-answer">${renderInlineMarkdown(c.userAnswer)}</div>`
        : "";
      // Empty lines (2026-08-10 #6): writing space for paragraphs/essays when
      // the toggle is on and no answer has been written yet.
      const blank = opts.emptyLines && !c.userAnswer ? blankAnswerHtml() : "";
      const translation = !hidden.translations && c.translation
        ? `<p class="p-translation">${renderInlineMarkdown(c.translation)}</p>`
        : "";
      const analysis = !hidden.analyses && c.analysis
        ? `<div class="p-analyse"><strong>Analyse :</strong> ${renderInlineMarkdown(c.analysis)}</div>`
        : "";
      const grid = hidden.vocab ? "" : vocabGridHtml(c.vocab, c.expressions);
      return `<p class="${wrapper}">${text}</p>${userAnswer}${blank}${translation}${analysis}${grid}`;
    }
    case "essay": {
      // One continuous passage: an optional heading, each paragraph as its own
      // <p>, then the ONE shared enrichment set (translation/analysis/vocab)
      // + practice answer.
      const c = block.content;
      const heading = c.heading
        ? `<h3 class="block-essay-heading">${escapeHtml(c.heading)}</h3>`
        : "";
      const paragraphs = c.paragraphs
        .map((p) => `<p class="block-paragraph">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
        .join("");
      const userAnswer = c.userAnswer
        ? `<div class="qa-user-answer">${renderInlineMarkdown(c.userAnswer)}</div>`
        : "";
      const blank = opts.emptyLines && !c.userAnswer ? blankAnswerHtml() : "";
      const translation = !hidden.translations && c.translation
        ? `<p class="p-translation">${renderInlineMarkdown(c.translation)}</p>`
        : "";
      const analysis = !hidden.analyses && c.analysis
        ? `<div class="p-analyse"><strong>Analyse :</strong> ${renderInlineMarkdown(c.analysis)}</div>`
        : "";
      const grid = hidden.vocab ? "" : vocabGridHtml(c.vocab, c.expressions);
      return `<div class="${wrapper}">${heading}${paragraphs}${userAnswer}${blank}${translation}${analysis}${grid}</div>`;
    }
    case "separator":
      return `<hr class="${wrapper}">`;
    case "qa": {
      qaNumber.n += 1; // sequential numbering across the document (1, 2, 3…)
      return qaBlockHtml(doc, block, tokens, qaNumber.n, opts);
    }
  }
}

/** Render options for generateTemplateHTML. `printMode` forces the print rules
 *  on screen (A4 sheet look) — used by the on-demand preview so it matches the
 *  PDF; downloads keep the screen mode. `hidden` (2026-08-10) are the preview
 *  field toggles: qa/paragraph/essay enrichment sections are omitted; the main
 *  content (title, headings, questions, paragraph text) is never hidden.
 *  `emptyLines` (2026-08-10 #6): blank ruled writing areas where the model
 *  answer is hidden — the old "questions" sheet behavior, now a toggle. */
export interface TemplateRenderOpts {
  printMode?: boolean;
  hidden?: {
    translations?: boolean;
    analyses?: boolean;
    vocab?: boolean;
    modelAnswers?: boolean;
  };
  emptyLines?: boolean;
}

export function generateTemplateHTML(
  doc: Document,
  tokens: DesignTokens,
  opts: TemplateRenderOpts = {},
): string {
  const qaNumber = { n: 0 };
  const body = doc.blocks.map((b) => blockToHtml(doc, b, tokens, qaNumber, opts)).join("\n");
  const title = escapeHtml(doc.title || "Document");
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>${buildCss(tokens, opts.printMode)}</style>
</head>
<body>
<main class="document">
${body}
</main>
</body>
</html>
`;
}
