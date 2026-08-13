// lib/pdf.tsx — @react-pdf/renderer PDF generation (FR-14/15).
//
// The ONLY PDF engine in the app. PDFs are generated from block data
// (document.json), NOT from HTML — HTML and PDF are two renderings of the
// same source. No Chrome, no Puppeteer, no browser binary anywhere.
//
// All styles come from the shared design tokens (FR-43) so the PDF visually
// matches the HTML preview. Page: A4, print margins (~14mm), Times-Roman
// (react-pdf's built-in standard font, matching the instructions' Georgia/Times).
//
// Q&A rendering (M2): SVG circular badge with the question number, question +
// italic translation, grammar note, response label, user-answer box (dashed
// left border), model answer, answer translation, analysis, vocab grid.
// Omission rules (FR-36) match the HTML template exactly.
//
// PDF variants (M6 redesign) — the Download menu offers three renderings:
//   "full"        — everything: questions + answers + all enrichment (per flags).
//   "questions"   — shareable practice sheet: questions only + blank ruled
//                   areas; translations, answers, analysis, vocab all omitted.
//   "my-answers"  — after practice: questions + the user's own answers, for
//                   sending to somebody for checking; reference answers and
//                   enrichment omitted.
// Non-full variants render title + qa blocks; "my-answers" additionally
// includes paragraphs (each with the user's written answer, or blank rules
// when unanswered) so mixed documents practice every block (M6).
//
// Note: react-pdf v4.6 has no `breakInside: "avoid"` style — the equivalent is
// the `wrap={false}` prop on a View (moves the whole element to the next page
// instead of splitting it; oversized elements stay put and push future
// siblings over — see @react-pdf/layout splitNodes). Applied to each QA card
// (mirrors `.qa-block { break-inside: avoid }` in the HTML template) so a
// question is never cut mid-card at a page boundary.
// The `minPresenceAhead` hint stays on the question row as a fallback for the
// (rare) card taller than a full page: it keeps the row + up to 150pt of
// following content on the same page.

import {
  Document as PDFDocument,
  Page,
  View,
  Text,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { Block, Document, PreviewHidden, QaContent } from "./types";
import type { DesignTokens } from "./design-tokens";
import { pageNumberLabel } from "./pdf-labels"; // 2026-08-10: "1/7" page footers

export type PDFVariant = "full" | "questions" | "my-answers";

export interface PDFOptions {
  /** Which rendering to produce — see header comment (default "full").
   *  Kept for the engine/tests; the UI no longer offers variants (2026-08-10:
   *  downloads render the current preview display instead). */
  variant?: PDFVariant;
  /** 2026-08-10: preview field toggles — omitted enrichment sections
   *  (translations/analyses/vocab/model answers). Applies on top of "full";
   *  partial objects are fine (missing fields = visible). */
  hidden?: Partial<PreviewHidden>;
  /** 2026-08-10 #6: blank ruled writing lines where the model answer is hidden
   *  (the old "questions" sheet behavior, now a toggle). */
  emptyLines?: boolean;
}

const MM_TO_PT = 72 / 25.4; // 1mm = 2.8346pt

/** Convert a token length ("14mm", "11.5px", "0.8rem", "12pt", 12) to points. */
export function lengthToPt(value: string | number): number {
  if (typeof value === "number") return value;
  const match = value.trim().match(/^([\d.]+)\s*(mm|cm|in|pt|px|rem)?$/);
  if (!match) return 0;
  const n = parseFloat(match[1]);
  switch (match[2]) {
    case "mm":
      return n * MM_TO_PT;
    case "cm":
      return n * 10 * MM_TO_PT;
    case "in":
      return n * 72;
    case "px":
      return n * 0.75; // 1px = 0.75pt at 96dpi
    case "rem":
      return n * 16 * 0.75; // rem → px (16px base) → pt
    default:
      return n; // pt
  }
}

/** Visibility mirror of the HTML template (FR-34/35/36): hidden → omitted entirely. */
/**
 * 2026-08-13 (to-do item 2 — "points are just easy to understand"): render
 * `- ` lines as bullet points in PDF text. react-pdf has no list element, so
 * each bullet line gets a "•  " prefix and keeps its own line. Applied to the
 * analysis texts (qa + paragraph + essay) — mirrors the HTML template's
 * `<ul class="point-list">` for the same content.
 */
function bulletText(text: string): string {
  return text
    .split("\n")
    .map((line) => (/^\s*-\s+/.test(line) ? `•  ${line.replace(/^\s*-\s+/, "")}` : line))
    .join("\n");
}

function qaVisible(doc: Document, content: QaContent, kind: "translation" | "modelAnswer"): boolean {
  if (kind === "translation") {
    return !(content.hideTranslation || doc.practice?.hideTranslations);
  }
  return !(content.hideModelAnswer || doc.practice?.hideModelAnswers);
}

/** Empty ruled answer area for practice sheets (FR-49) — dashed box, ~4 lines. */
function BlankAnswerArea({ basePt, color }: { basePt: number; color: string }) {
  const lineSpacing = basePt * 1.7;
  const rules = [0, 1, 2, 3].map((i) => (
    <View
      key={i}
      style={{
        borderBottomWidth: 1,
        borderBottomStyle: "dashed",
        borderBottomColor: color,
        height: i === 3 ? 0 : lineSpacing,
      }}
    />
  ));
  return (
    <View
      style={{
        marginTop: 6,
        borderWidth: 1,
        borderStyle: "dashed",
        borderColor: color,
        borderRadius: 3,
        padding: 8,
      }}
    >
      {rules}
    </View>
  );
}

/** Shared vocab/expressions grid — used by QA cards and enriched paragraphs. */
function VocabGridPDF({
  tokens,
  vocab,
  expressions,
  synonyms, // 2026-08-10: third column — richer words for vocab growth
}: {
  tokens: DesignTokens;
  vocab?: { term: string; def: string }[];
  expressions?: { term: string; def: string }[];
  synonyms?: { term: string; def: string }[];
}) {
  const t = tokens;
  const basePt = lengthToPt(t.sizes.base);
  const styles = StyleSheet.create({
    grid: { marginTop: 8, borderWidth: 1, borderColor: t.colors.border, borderRadius: 3, flexDirection: "row" },
    gridCol: { flex: 1 },
    gridColRight: { flex: 1, borderLeftWidth: 1, borderLeftColor: t.colors.border },
    gridHeader: {
      backgroundColor: t.colors.lightBg,
      textTransform: "uppercase",
      color: t.colors.heading,
      fontSize: basePt * 0.78,
      fontWeight: "bold",
      padding: 4,
      paddingLeft: 8,
    },
    gridRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      backgroundColor: t.colors.vocabBg,
      padding: 3,
      paddingLeft: 8,
      paddingRight: 8,
      borderTopWidth: 1,
      borderTopColor: t.colors.rowBorder,
    },
    gridTerm: { fontWeight: "bold", color: t.colors.accentGreen },
    gridDef: { textAlign: "right" },
  });

  const col = (title: string, rows: { term: string; def: string }[], right?: boolean) =>
    rows.length > 0 ? (
      <View style={right ? styles.gridColRight : styles.gridCol}>
        <View style={styles.gridHeader}>
          <Text>{title}</Text>
        </View>
        {rows.map((r, i) => (
          <View key={i} style={styles.gridRow}>
            <Text style={styles.gridTerm}>{r.term}</Text>
            <Text style={styles.gridDef}>{r.def}</Text>
          </View>
        ))}
      </View>
    ) : null;

  const vocabCol = col("Vocabulaire Clé", vocab ?? []);
  const exprCol = col("Expressions Avancées", expressions ?? [], Boolean(vocabCol));
  const synCol = col("Synonymes", synonyms ?? [], Boolean(vocabCol) || Boolean(exprCol));
  if (!vocabCol && !exprCol && !synCol) return null;
  return (
    <View style={styles.grid}>
      {vocabCol}
      {exprCol}
      {synCol}
    </View>
  );
}

interface QABlockProps {
  block: Extract<Block, { type: "qa" }>;
  doc: Document;
  tokens: DesignTokens;
  number: number;
  variant: PDFVariant;
  hidden?: Partial<PreviewHidden>;
  emptyLines?: boolean;
}

function QABlockPDF({ block, doc, tokens, number, variant, hidden, emptyLines }: QABlockProps) {
  const t = tokens;
  const content = block.content;
  const basePt = lengthToPt(t.sizes.base);

  // Omission matrix (M6 + 2026-08-10):
  //  - hideAnswers: questions + my-answers never show reference answers/translations.
  //  - showUser (2026-08-10 M7 round 4): practice answers render ONLY on the
  //    "my-answers" variant (server-side / tests). The display PDF — the
  //    Download PDF button's { doc, hidden, emptyLines } POST — is variant
  //    "full", so it matches the preview and never shows practice answers
  //    (user: "it is showing practice answers why, it should not do this").
  //  - showExtras: analysis + vocab grids only in the full document.
  //  - hidden (2026-08-10): the preview field toggles — omitted enrichment on
  //    top of "full", so the PDF always matches the displayed preview.
  // Per-block flags and document-level defaults (FR-36) only apply to "full".
  const hideAnswers = variant !== "full";
  const showUser = variant === "my-answers";
  const showTranslation = !hideAnswers && !hidden?.translations && qaVisible(doc, content, "translation");
  const showModelAnswer = !hideAnswers && !hidden?.modelAnswers && qaVisible(doc, content, "modelAnswer");
  const showExtras = variant === "full";
  // 2026-08-13 (to-do item 8): the response label renders ONLY when there is
  // something to label below it — a visible answer or the blank ruled area.
  // No answer + no empty lines → no label (never a lonely "RÉPONSE").
  const hasAnswerArea =
    (showModelAnswer && content.modelAnswer) ||
    ((hideAnswers || (emptyLines && !showModelAnswer)) && !(showUser && content.userAnswer)) ||
    (showUser && Boolean(content.userAnswer));

  const styles = StyleSheet.create({
    card: {
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: lengthToPt(t.radius.card),
      padding: 10,
      marginBottom: 10,
    },
    questionRow: { flexDirection: "row", alignItems: "flex-start" },
    badge: {
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: t.colors.badgeBg,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 6,
      marginTop: 2,
    },
    // 2026-08-13 (BADGE CENTERING, measured): flex centering alone leaves the
    // digit ~3pt HIGH in the circle (pixel-measured at 96dpi: dy -4px on an
    // 18pt badge). A first fix used lineHeight "18pt" (full badge height —
    // same trick as .qa-num's line-height: 24px in the HTML template) but the
    // download measured ~5.25pt HIGH — WORSE, because react-pdf anchors the
    // glyph baseline high inside the line box. The correct direction is a
    // SMALLER line box: the flex centering then pushes the line box (and with
    // it the digit) DOWN to center. lineHeight 1.3 → 1.3 × fontSize ≈ 7.85pt
    // line box → line-box top ≈ 5.1pt, digit lands on the 9pt circle center.
    // Unitless multiplier so it scales with basePt.
    badgeText: { color: t.colors.badgeText, fontSize: basePt * 0.7, fontWeight: "bold", lineHeight: 1.3 },
    // 2026-08-10 M7 round 5: the question row is badge + a flex-1 column body,
    // so the translation renders on its OWN line BELOW the question (was a
    // nested Text inside questionText — same line; mirrors the HTML template).
    questionBody: { flex: 1 },
    questionText: { fontWeight: "bold", color: t.colors.heading, fontSize: basePt },
    questionTranslation: { marginTop: 2, fontWeight: "normal", fontStyle: "italic", fontSize: basePt * 0.9, opacity: 0.85 },
    grammarNote: { marginTop: 3, marginLeft: 24, fontStyle: "italic", fontSize: basePt * 0.82, opacity: 0.75 },
    responseLabel: {
      marginTop: 6,
      textTransform: "uppercase",
      color: t.colors.accentGreen,
      letterSpacing: 1.5,
      fontSize: basePt * 0.78,
      fontWeight: "bold",
    },
    userAnswer: {
      backgroundColor: t.colors.highlightBg,
      borderLeftWidth: 3,
      borderLeftStyle: "dashed",
      borderLeftColor: t.colors.accentGreen,
      padding: 6,
      marginTop: 5,
    },
    modelAnswer: {
      backgroundColor: t.colors.highlightBg,
      borderLeftWidth: 3,
      borderLeftColor: t.colors.accentGreen,
      padding: 6,
      marginTop: 5,
    },
    answerTranslation: { marginTop: 5, fontStyle: "italic", fontSize: basePt * 0.9, opacity: 0.8 },
    analysis: { marginTop: 5, fontSize: basePt * 0.88, opacity: 0.9 },
  });

  return (
    // wrap={false} (2026-08-13): break-inside: avoid for the whole card —
    // a question + its answer never split across a page boundary.
    <View style={styles.card} wrap={false}>
      <View style={styles.questionRow} minPresenceAhead={150}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{number}</Text>
        </View>
        {/* 2026-08-10 M7 round 5: translation BELOW the question on its own
            line (user: "it is showing in same line as question it should be
            below it") — mirrors the HTML template's .qa-question-translation. */}
        <View style={styles.questionBody}>
          <Text style={styles.questionText}>{content.question}</Text>
          {/* 2026-08-13 (to-do item 8): a bold "Traduction :" label leads the
              translation — same style as "Analyse :" (mirrors the HTML template). */}
          {showTranslation && content.questionTranslation ? (
            <Text style={styles.questionTranslation}>
              <Text style={{ fontWeight: "bold" }}>Traduction : </Text>
              {content.questionTranslation}
            </Text>
          ) : null}
        </View>
      </View>

      {/* 2026-08-10 field order (user request, mirrored in the HTML template
          and the editor): question → translation → analysis → answer →
          answer translation → practice answer → grammar note → grid.
          2026-08-10 #5: the response label moved ABOVE the answer — it labels
          the answer area (user: "reponse text is shown below the answer why?"). */}
      {showExtras && !hidden?.analyses && content.analysis ? (
        <Text style={styles.analysis}>
          <Text style={{ fontWeight: "bold" }}>Analyse : </Text>
          {bulletText(content.analysis)}
        </Text>
      ) : null}

      {variant !== "my-answers" && content.responseLabel && hasAnswerArea ? (
        <Text style={styles.responseLabel}>{content.responseLabel}</Text>
      ) : null}

      {showModelAnswer && content.modelAnswer ? (
        <View style={styles.modelAnswer}>
          <Text>{content.modelAnswer}</Text>
        </View>
      ) : null}

      {/* Blank ruled area: on the practice variants as before, AND on the full
          display when "Empty lines" is on and the model answer is hidden. */}
      {(hideAnswers || (emptyLines && !showModelAnswer)) && !(showUser && content.userAnswer) ? (
        <BlankAnswerArea basePt={basePt} color={t.colors.border} />
      ) : null}

      {showTranslation && content.answerTranslation ? (
        <Text style={styles.answerTranslation}>{content.answerTranslation}</Text>
      ) : null}

      {showUser && content.userAnswer ? (
        <View style={styles.userAnswer}>
          <Text>{content.userAnswer}</Text>
        </View>
      ) : null}

      {variant !== "my-answers" && content.grammarNote ? (
        /* 2026-08-13 (to-do item 8): bold "Grammaire :" label — mirrors the HTML template. */
        <Text style={styles.grammarNote}>
          <Text style={{ fontWeight: "bold" }}>Grammaire : </Text>
          {content.grammarNote}
        </Text>
      ) : null}

      {showExtras && !hidden?.vocab ? (
        <VocabGridPDF tokens={tokens} vocab={content.vocab} expressions={content.expressions} synonyms={content.synonyms} />
      ) : null}
    </View>
  );
}

function BlockToPDF({
  block,
  doc,
  tokens,
  qaNumber,
  variant,
  hidden,
  emptyLines,
}: {
  block: Block;
  doc: Document;
  tokens: DesignTokens;
  qaNumber: { n: number };
  variant: PDFVariant;
  hidden?: Partial<PreviewHidden>;
  emptyLines?: boolean;
}) {
  const t = tokens;
  const basePt = lengthToPt(t.sizes.base);

  const styles = StyleSheet.create({
    h1: { fontSize: basePt * 1.9, fontWeight: "bold", color: t.colors.heading, marginBottom: 10 },
    h2: { fontSize: basePt * 1.45, fontWeight: "bold", color: t.colors.heading, marginTop: 10, marginBottom: 6 },
    h3: { fontSize: basePt * 1.2, fontWeight: "bold", color: t.colors.heading, marginTop: 8, marginBottom: 4 },
    // 2026-08-10 #3: prose is the FRENCH reading material — paragraphs/essays
    // lead at 1.15× base (mirrors p.block-paragraph in the HTML template);
    // translations/analysis stay at 0.88–0.9× base, clearly secondary.
    p: { fontSize: basePt * 1.15, marginBottom: 8 },
    // Essay heading (2026-08-10 #5): optional short title above the passage.
    essayHeading: { fontSize: basePt * 1.15, fontWeight: "bold", color: t.colors.heading, marginBottom: 8 },
    pTranslation: { fontStyle: "italic", fontSize: basePt * 0.9, opacity: 0.8, marginBottom: 8 },
    pAnalysis: { fontSize: basePt * 0.88, opacity: 0.9, marginBottom: 8 },
    userAnswer: {
      backgroundColor: t.colors.highlightBg,
      borderLeftWidth: 3,
      borderLeftStyle: "dashed",
      borderLeftColor: t.colors.accentGreen,
      padding: 6,
      marginTop: 5,
      marginBottom: 8,
    },
    separator: { borderBottomWidth: 1, borderBottomColor: t.colors.border, marginVertical: 10 },
  });

  switch (block.type) {
    case "title":
      return <Text style={styles.h1}>{block.content.text}</Text>;
    case "heading":
      return (
        <Text style={block.content.level === 3 ? styles.h3 : styles.h2}>
          {block.content.text}
        </Text>
      );
    case "paragraph": {
      // M6: paragraphs carry AI enrichment (translation, analysis, vocab grid)
      // plus a practice answer (userAnswer). Enrichment renders only in "full"
      // (gated by the preview toggles since 2026-08-10); practice answers only
      // on "my-answers" (2026-08-10 M7 round 4 — the display PDF never shows
      // them), matching the QA omission matrix (hideAnswers/showUser).
      const c = block.content;
      const showUser = variant === "my-answers";
      return (
        <View>
          <Text style={styles.p}>{c.text}</Text>
          {showUser && c.userAnswer ? (
            <View style={styles.userAnswer}>
              <Text>{c.userAnswer}</Text>
            </View>
          ) : null}
          {(variant !== "full" || emptyLines) && !(showUser && c.userAnswer) ? (
            <BlankAnswerArea basePt={basePt} color={t.colors.border} />
          ) : null}
          {variant === "full" && !hidden?.translations && c.translation ? (
            <Text style={styles.pTranslation}>{c.translation}</Text>
          ) : null}
          {variant === "full" && !hidden?.analyses && c.analysis ? (
            <Text style={styles.pAnalysis}>
              <Text style={{ fontWeight: "bold" }}>Analyse : </Text>
              {bulletText(c.analysis)}
            </Text>
          ) : null}
          {variant === "full" && !hidden?.vocab ? (
            <VocabGridPDF tokens={tokens} vocab={c.vocab} expressions={c.expressions} synonyms={c.synonyms} />
          ) : null}
        </View>
      );
    }
    case "essay": {
      // Essay (2026-08-10): ONE continuous passage — paragraphs render as
      // normal text, with a single shared enrichment set (translation, analysis,
      // vocab grid, practice answer) exactly like the paragraph case.
      // 2026-08-10 #5: an optional heading leads the passage; on the practice
      // sheets (questions / my-answers) ONLY the heading shows — the passage
      // is the writing task, so the sheet shows the title + rules/answer, not
      // the source text (user: "in practice it should only show the heading").
      // 2026-08-10 M7 round 4: practice answers only on "my-answers".
      const c = block.content;
      const showUser = variant === "my-answers";
      return (
        <View>
          {c.heading ? <Text style={styles.essayHeading}>{c.heading}</Text> : null}
          {variant === "full"
            ? c.paragraphs.map((p, i) => (
                <Text key={i} style={styles.p}>
                  {p}
                </Text>
              ))
            : null}
          {showUser && c.userAnswer ? (
            <View style={styles.userAnswer}>
              <Text>{c.userAnswer}</Text>
            </View>
          ) : null}
          {(variant !== "full" || emptyLines) && !(showUser && c.userAnswer) ? (
            <BlankAnswerArea basePt={basePt} color={t.colors.border} />
          ) : null}
          {variant === "full" && !hidden?.translations && c.translation ? (
            <Text style={styles.pTranslation}>{c.translation}</Text>
          ) : null}
          {variant === "full" && !hidden?.analyses && c.analysis ? (
            <Text style={styles.pAnalysis}>
              <Text style={{ fontWeight: "bold" }}>Analyse : </Text>
              {bulletText(c.analysis)}
            </Text>
          ) : null}
          {variant === "full" && !hidden?.vocab ? (
            <VocabGridPDF tokens={tokens} vocab={c.vocab} expressions={c.expressions} synonyms={c.synonyms} />
          ) : null}
        </View>
      );
    }
    case "separator":
      return <View style={styles.separator} />;
    case "qa": {
      qaNumber.n += 1;
      return (
        // 2026-08-13 (BUG FIX): hidden/emptyLines MUST be forwarded — they were
        // missing, so the display PDF always rendered QA translations/analyses/
        // vocab/model answers even when the preview toggles hid them (paragraphs
        // and essays honored the toggles; qa blocks silently didn't).
        <QABlockPDF
          block={block}
          doc={doc}
          tokens={tokens}
          number={qaNumber.n}
          variant={variant}
          hidden={hidden}
          emptyLines={emptyLines}
        />
      );
    }
  }
}

/** Generate the PDF buffer for a document (server route; client usePDF fallback shares this component tree). */
export async function generatePDFBuffer(
  doc: Document,
  tokens: DesignTokens,
  opts: PDFOptions = {},
): Promise<Buffer> {
  const variant = opts.variant ?? "full";
  const hidden = opts.hidden;
  const emptyLines = opts.emptyLines ?? false;
  const basePt = lengthToPt(tokens.sizes.base);
  const pageStyles = StyleSheet.create({
    page: {
      padding: lengthToPt(tokens.spacing.printMargin),
      fontFamily: tokens.fonts.pdf,
      fontSize: basePt,
      color: tokens.colors.mainText,
      lineHeight: 1.6,
    },
  });

  // Practice variants are worksheet sheets: title + questions always.
  // Essays (a continuous passage = one reading + writing task) appear on BOTH
  // non-full sheets — with the user's answer on "my-answers", blank rules on
  // "questions". Standalone paragraphs join only "my-answers" (M6 + design
  // pass 2026-08-10).
  const blocks =
    variant === "full"
      ? doc.blocks
      : doc.blocks.filter(
          (b) =>
            b.type === "title" ||
            b.type === "qa" ||
            b.type === "essay" ||
            (variant === "my-answers" && b.type === "paragraph"),
        );

  const qaNumber = { n: 0 };
  // 2026-08-10: "1/7" page footer — react-pdf's `render` prop gets the page
  // number + total on every page; `fixed` repeats the footer on each page.
  // Absolute positioning is page-relative, so `bottom` sits in the margin
  // band below the padded content box.
  // 2026-08-13 (BUG FIX): the footer height MUST be pinned. react-pdf 4.6.0
  // (the latest) computes a garbage height (~1e22 pt) for bottom-anchored
  // `fixed` elements on continuation pages of long documents (the paginator
  // omits the page box height when splitting, which breaks yoga's bottom
  // resolution) — pdfkit then rejects the coordinate with
  // "unsupported number: -1.2915355457378698e+22" and the whole download
  // 500s. Only documents long enough to paginate were affected. Pinning
  // `height` to the footer's own line box stops yoga from inventing a height;
  // the box is small so this is invisible.
  const pageFooter = (
    <View
      fixed
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: lengthToPt(tokens.spacing.printMargin),
        height: Math.ceil(basePt * 0.8 * 1.6), // one footer line (fontSize × lineHeight)
        flexDirection: "row",
        justifyContent: "center",
      }}
    >
      <Text
        style={{
          fontSize: basePt * 0.8,
          color: tokens.colors.border,
          fontFamily: tokens.fonts.pdf,
        }}
        render={({ pageNumber, totalPages }) => pageNumberLabel(pageNumber, totalPages)}
      />
    </View>
  );
  const element = (
    <PDFDocument title={doc.title || "Document"} author="Writer App">
      <Page size="A4" style={pageStyles.page}>
        {blocks.map((b) => (
          <BlockToPDF
            key={b.id}
            block={b}
            doc={doc}
            tokens={tokens}
            qaNumber={qaNumber}
            variant={variant}
            hidden={hidden}
            emptyLines={emptyLines}
          />
        ))}
        {pageFooter}
      </Page>
    </PDFDocument>
  );
  return renderToBuffer(element);
}
