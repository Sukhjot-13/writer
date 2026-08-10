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
// Practice mode (FR-16/36/49): translations and model answers are always
// omitted; a filled userAnswer renders as the answer box, otherwise an empty
// dashed ruled area (~4 lines) is drawn for pen practice. The blank area never
// leaks the model answer or the translation.
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

export interface PDFOptions {
  /** Practice mode: translations + model answers omitted, blank answer areas (FR-16/36/49). */
  practice?: boolean;
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

/** Empty ruled answer area for practice mode (FR-49) — dashed box, ~4 lines. */
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

interface QABlockProps {
  block: Extract<Block, { type: "qa" }>;
  doc: Document;
  tokens: DesignTokens;
  number: number;
  practice: boolean;
}

function QABlockPDF({ block, doc, tokens, number, practice }: QABlockProps) {
  const t = tokens;
  const content = block.content;
  const basePt = lengthToPt(t.sizes.base);

  // Omission rules: practice mode always hides translations + model answers;
  // otherwise honor per-block flags and document-level defaults (FR-36).
  const showTranslation = !practice && qaVisible(doc, content, "translation");
  const showModelAnswer = !practice && qaVisible(doc, content, "modelAnswer");

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
      backgroundColor: t.colors.tableStripe,
      padding: 3,
      paddingLeft: 8,
      paddingRight: 8,
      borderTopWidth: 1,
      borderTopColor: t.colors.border,
    },
    gridTerm: { fontWeight: "bold", color: t.colors.accentGreen },
    gridDef: { textAlign: "right" },
  });

  const grid = (title: string, rows: { term: string; def: string }[], right?: boolean) =>
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

  const vocabCol = grid("Vocabulaire Clé", content.vocab ?? []);
  const exprCol = grid("Expressions Avancées", content.expressions ?? [], !!vocabCol);
  const hasGrid = Boolean(vocabCol || exprCol);

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

      {content.grammarNote ? <Text style={styles.grammarNote}>{content.grammarNote}</Text> : null}
      {content.responseLabel ? <Text style={styles.responseLabel}>{content.responseLabel}</Text> : null}

      {content.userAnswer ? (
        <View style={styles.userAnswer}>
          <Text>{content.userAnswer}</Text>
        </View>
      ) : null}

      {showModelAnswer && content.modelAnswer ? (
        <View style={styles.modelAnswer}>
          <Text>{content.modelAnswer}</Text>
        </View>
      ) : null}

      {practice && !content.userAnswer ? <BlankAnswerArea basePt={basePt} color={t.colors.border} /> : null}

      {showTranslation && content.answerTranslation ? (
        <Text style={styles.answerTranslation}>{content.answerTranslation}</Text>
      ) : null}

      {content.analysis ? (
        <Text style={styles.analysis}>
          <Text style={{ fontWeight: "bold" }}>Analyse : </Text>
          {content.analysis}
        </Text>
      ) : null}

      {hasGrid ? (
        <View style={styles.grid}>
          {vocabCol}
          {exprCol}
        </View>
      ) : null}
    </View>
  );
}

function BlockToPDF({
  block,
  doc,
  tokens,
  qaNumber,
  practice,
}: {
  block: Block;
  doc: Document;
  tokens: DesignTokens;
  qaNumber: { n: number };
  practice: boolean;
}) {
  const t = tokens;
  const basePt = lengthToPt(t.sizes.base);

  const styles = StyleSheet.create({
    h1: { fontSize: basePt * 1.9, fontWeight: "bold", color: t.colors.heading, marginBottom: 10 },
    h2: { fontSize: basePt * 1.45, fontWeight: "bold", color: t.colors.heading, marginTop: 10, marginBottom: 6 },
    h3: { fontSize: basePt * 1.2, fontWeight: "bold", color: t.colors.heading, marginTop: 8, marginBottom: 4 },
    p: { fontSize: basePt, marginBottom: 8 },
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
    case "paragraph":
      return <Text style={styles.p}>{block.content.text}</Text>;
    case "separator":
      return <View style={styles.separator} />;
    case "qa": {
      qaNumber.n += 1;
      return (
        <QABlockPDF block={block} doc={doc} tokens={tokens} number={qaNumber.n} practice={practice} />
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

  const qaNumber = { n: 0 };
  const element = (
    <PDFDocument title={doc.title || "Document"} author="Writer App">
      <Page size="A4" style={pageStyles.page}>
        {doc.blocks.map((b) => (
          <BlockToPDF
            key={b.id}
            block={b}
            doc={doc}
            tokens={tokens}
            qaNumber={qaNumber}
            practice={Boolean(opts.practice)}
          />
        ))}
      </Page>
    </PDFDocument>
  );
  return renderToBuffer(element);
}
