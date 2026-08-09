// lib/html-template.ts — template-mode HTML generator (FR-9, Plan §8.1).
//
// Deterministic, self-contained styled HTML built from block data + the shared
// design tokens (FR-43) — the offline, always-available converter (no AI, no
// API key). The generated document follows docs/html_instructions.md: A4,
// Georgia/Times, heading/badge/accent colors, `.qa-block` cards.
//
// M1 renders title / heading / paragraph / separator (+ a minimal QA fallback
// card); full Q&A rendering (badges, numbering, vocab grids, omission rules)
// lands in M2.

import type { Block, Document } from "./types";
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

function buildCss(tokens: DesignTokens): string {
  const t = tokens;
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
h1.block-title { color: ${t.colors.heading}; font-size: 1.9em; margin: 0 0 0.4em; }
h2.block-heading { color: ${t.colors.heading}; font-size: 1.45em; border-bottom: 3px solid ${t.colors.heading}; padding-bottom: 4px; margin: 1em 0 0.5em; }
h3.block-heading { color: ${t.colors.heading}; font-size: 1.2em; margin: 0.9em 0 0.4em; }
p.block-paragraph { margin: 0 0 0.9em; }
hr.block-separator { border: none; border-top: 1px solid ${t.colors.border}; margin: 1.4em 0; }
code { background: ${t.colors.highlightBg}; padding: 2px 5px; border-radius: 2px; font-family: ${t.fonts.mono}; }
.qa-block { border: 1px solid ${t.colors.border}; border-radius: ${t.radius.card}; padding: ${t.spacing.cardPadding}; margin: 0 0 1em; background: #fff; }
.qa-question { display: flex; align-items: flex-start; gap: 10px; }
.qa-num { flex: none; width: 24px; height: 24px; border-radius: ${t.radius.badge}; background: ${t.colors.badgeBg}; color: ${t.colors.badgeText}; font-weight: bold; text-align: center; line-height: 24px; font-size: 0.8rem; }
.qa-question-text { margin: 0; font-weight: bold; color: ${t.colors.heading}; }
.qa-answer { background: ${t.colors.highlightBg}; border-left: 3px solid ${t.colors.accentGreen}; padding: ${t.spacing.answerPadding}; margin-top: 8px; }
`;
}

function blockToHtml(block: Block, tokens: DesignTokens): string {
  const wrapper = `block block-${block.type}${block.tags.map(tagClass).join("")}`;
  switch (block.type) {
    case "title":
      return `<h1 class="${wrapper}">${escapeHtml(block.content.text)}</h1>`;
    case "heading": {
      const Tag = block.content.level === 3 ? "h3" : "h2";
      return `<${Tag} class="${wrapper}">${escapeHtml(block.content.text)}</${Tag}>`;
    }
    case "paragraph": {
      const text =
        block.content.format === "markdown"
          ? renderInlineMarkdown(block.content.text)
          : escapeHtml(block.content.text).replace(/\n/g, "<br>");
      return `<p class="${wrapper}">${text}</p>`;
    }
    case "separator":
      return `<hr class="${wrapper}">`;
    case "qa": {
      // Minimal M1 fallback card — full Q&A rendering (numbering, vocab grids,
      // omission rules) lands in M2.
      const answer = block.content.modelAnswer
        ? `<div class="qa-answer">${escapeHtml(block.content.modelAnswer)}</div>`
        : "";
      return `<section class="${wrapper}"><div class="qa-block"><div class="qa-question"><span class="qa-num">Q</span><p class="qa-question-text">${escapeHtml(block.content.question)}</p></div>${answer}</div></section>`;
    }
  }
}

/** Build a complete, self-contained styled HTML document from block data. */
export function generateTemplateHTML(doc: Document, tokens: DesignTokens): string {
  const body = doc.blocks.map((b) => blockToHtml(b, tokens)).join("\n");
  const title = escapeHtml(doc.title || "Document");
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>${buildCss(tokens)}</style>
</head>
<body>
<main class="document">
${body}
</main>
</body>
</html>
`;
}
