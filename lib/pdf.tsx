// lib/pdf.tsx — @react-pdf/renderer PDF generation (FR-14/15, Plan §8.2).
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
// Note: react-pdf v4.6 has no `breakInside: "avoid"` equivalent — the closest
// is the `minPresenceAhead` hint (keeps following siblings on the same page
// within n points), applied to each QA card's question row.

import {
  Document as PDFDocument,
  Page,
  View,
  Text,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { Block, Document, QaContent } from "./types";
import type { DesignTokens } from "./design-tokens";
import { pageNumberLabel } from "./pdf-labels"; // 2026-08-10: "1/7" page footers

export type PDFVariant = "full" | "questions" | "my-answers";

export interface PDFOptions {
  /** Which rendering to produce — see header comment (default "full"). */
  variant?: PDFVariant;
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
}: {
  tokens: DesignTokens;
  vocab?: { term: string; def: string }[];
  expressions?: { term: string; def: string }[];
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
  if (!vocabCol && !exprCol) return null;
  return (
    <View style={styles.grid}>
      {vocabCol}
      {exprCol}
    </View>
  );
}

interface QABlockProps {
  block: Extract<Block, { type: "qa" }>;
  doc: Document;
  tokens: DesignTokens;
  number: number;
  variant: PDFVariant;
}

function QABlockPDF({ block, doc, tokens, number, variant }: QABlockProps) {
  const t = tokens;
  const content = block.content;
  const basePt = lengthToPt(t.sizes.base);

  // Omission matrix (M6):
  //  - hideAnswers: questions + my-answers never show reference answers/translations.
  //  - showUser: questions-only never shows even the user's own answers.
  //  - showExtras: analysis + vocab grids only in the full document.
  // Per-block flags and document-level defaults (FR-36) only apply to "full".
  const hideAnswers = variant !== "full";
  const showUser = variant !== "questions";
  const showTranslation = !hideAnswers && qaVisible(doc, content, "translation");
  const showModelAnswer = !hideAnswers && qaVisible(doc, content, "modelAnswer");
  const showExtras = variant === "full";

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
    badgeText: { color: t.colors.badgeText, fontSize: basePt * 0.7, fontWeight: "bold" },
    questionText: { flex: 1, fontWeight: "bold", color: t.colors.heading, fontSize: basePt },
    questionTranslation: { fontWeight: "normal", fontStyle: "italic", fontSize: basePt * 0.9, opacity: 0.85 },
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
    <View style={styles.card}>
      <View style={styles.questionRow} minPresenceAhead={150}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{number}</Text>
        </View>
        <Text style={styles.questionText}>
          {content.question}
          {showTranslation && content.questionTranslation ? (
            <Text style={styles.questionTranslation}> {content.questionTranslation}</Text>
          ) : null}
        </Text>
      </View>

      {/* 2026-08-10 field order (user request, mirrored in the HTML template
          and the editor): question → translation → analysis → answer →
          answer translation → practice answer → grammar note → grid.
          2026-08-10 #5: the response label moved ABOVE the answer — it labels
          the answer area (user: "reponse text is shown below the answer why?"). */}
      {showExtras && content.analysis ? (
        <Text style={styles.analysis}>
          <Text style={{ fontWeight: "bold" }}>Analyse : </Text>
          {content.analysis}
        </Text>
      ) : null}

      {variant !== "my-answers" && content.responseLabel ? (
        <Text style={styles.responseLabel}>{content.responseLabel}</Text>
      ) : null}

      {showModelAnswer && content.modelAnswer ? (
        <View style={styles.modelAnswer}>
          <Text>{content.modelAnswer}</Text>
        </View>
      ) : null}

      {hideAnswers && !(showUser && content.userAnswer) ? (
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
        <Text style={styles.grammarNote}>{content.grammarNote}</Text>
      ) : null}

      {showExtras ? (
        <VocabGridPDF tokens={tokens} vocab={content.vocab} expressions={content.expressions} />
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
}: {
  block: Block;
  doc: Document;
  tokens: DesignTokens;
  qaNumber: { n: number };
  variant: PDFVariant;
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
      // plus a practice answer (userAnswer). Enrichment renders only in "full";
      // "my-answers" shows the user's written answer (or blank rules), matching
      // the QA omission matrix (hideAnswers/showUser).
      const c = block.content;
      const showUser = variant !== "questions";
      return (
        <View>
          <Text style={styles.p}>{c.text}</Text>
          {showUser && c.userAnswer ? (
            <View style={styles.userAnswer}>
              <Text>{c.userAnswer}</Text>
            </View>
          ) : null}
          {variant !== "full" && !(showUser && c.userAnswer) ? (
            <BlankAnswerArea basePt={basePt} color={t.colors.border} />
          ) : null}
          {variant === "full" && c.translation ? (
            <Text style={styles.pTranslation}>{c.translation}</Text>
          ) : null}
          {variant === "full" && c.analysis ? (
            <Text style={styles.pAnalysis}>
              <Text style={{ fontWeight: "bold" }}>Analyse : </Text>
              {c.analysis}
            </Text>
          ) : null}
          {variant === "full" ? (
            <VocabGridPDF tokens={tokens} vocab={c.vocab} expressions={c.expressions} />
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
      const c = block.content;
      const showUser = variant !== "questions";
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
          {variant !== "full" && !(showUser && c.userAnswer) ? (
            <BlankAnswerArea basePt={basePt} color={t.colors.border} />
          ) : null}
          {variant === "full" && c.translation ? (
            <Text style={styles.pTranslation}>{c.translation}</Text>
          ) : null}
          {variant === "full" && c.analysis ? (
            <Text style={styles.pAnalysis}>
              <Text style={{ fontWeight: "bold" }}>Analyse : </Text>
              {c.analysis}
            </Text>
          ) : null}
          {variant === "full" ? (
            <VocabGridPDF tokens={tokens} vocab={c.vocab} expressions={c.expressions} />
          ) : null}
        </View>
      );
    }
    case "separator":
      return <View style={styles.separator} />;
    case "qa": {
      qaNumber.n += 1;
      return (
        <QABlockPDF block={block} doc={doc} tokens={tokens} number={qaNumber.n} variant={variant} />
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
  const pageFooter = (
    <View
      fixed
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: lengthToPt(tokens.spacing.printMargin),
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
          />
        ))}
        {pageFooter}
      </Page>
    </PDFDocument>
  );
  return renderToBuffer(element);
}
