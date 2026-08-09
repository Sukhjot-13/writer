// lib/pdf.ts — @react-pdf/renderer PDF generation (FR-14/15, Plan §8.2).
//
// The ONLY PDF engine in the app. PDFs are generated from block data
// (document.json), NOT from HTML — HTML and PDF are two renderings of the
// same source. No Chrome, no Puppeteer, no browser binary anywhere.
//
// All styles come from the shared design tokens (FR-43) so the PDF visually
// matches the HTML preview. Page: A4, print margins (~14mm), Times-Roman
// (react-pdf's built-in standard font, matching the instructions' Georgia/Times).
//
// M1 renders title / heading / paragraph / separator (+ minimal QA card);
// full Q&A rendering (SVG badge, vocab grids, pageBreakInside: "avoid",
// practice mode + blank answer boxes) lands in M2.

import {
  Document as PDFDocument,
  Page,
  View,
  Text,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { Block, Document } from "./types";
import type { DesignTokens } from "./design-tokens";

export interface PDFOptions {
  /** Practice mode: answers/translations omitted + blank answer boxes (FR-16/36/49) — lands in M2. */
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

function BlockToPDF({ block, tokens }: { block: Block; tokens: DesignTokens }) {
  const t = tokens;
  const basePt = lengthToPt(t.sizes.base);

  const styles = StyleSheet.create({
    h1: { fontSize: basePt * 1.9, fontWeight: "bold", color: t.colors.heading, marginBottom: 10 },
    h2: { fontSize: basePt * 1.45, fontWeight: "bold", color: t.colors.heading, marginTop: 10, marginBottom: 6 },
    h3: { fontSize: basePt * 1.2, fontWeight: "bold", color: t.colors.heading, marginTop: 8, marginBottom: 4 },
    p: { fontSize: basePt, marginBottom: 8 },
    separator: { borderBottomWidth: 1, borderBottomColor: t.colors.border, marginVertical: 10 },
    qaBlock: {
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: lengthToPt(t.radius.card),
      padding: 10,
      marginBottom: 10,
    },
    qaQuestion: { flexDirection: "row", alignItems: "flex-start" },
    qaNum: {
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: t.colors.badgeBg,
      color: t.colors.badgeText,
      fontSize: basePt * 0.7,
      fontWeight: "bold",
      textAlign: "center",
      lineHeight: 18,
      marginRight: 6,
    },
    qaQuestionText: { flex: 1, fontWeight: "bold", color: t.colors.heading, fontSize: basePt },
    qaAnswer: {
      backgroundColor: t.colors.highlightBg,
      borderLeftWidth: 3,
      borderLeftColor: t.colors.accentGreen,
      padding: 6,
      marginTop: 6,
    },
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
      // Minimal M1 fallback card — full Q&A rendering (SVG badge, vocab grids,
      // pageBreakInside: "avoid", practice mode) lands in M2.
      return (
        <View style={styles.qaBlock}>
          <View style={styles.qaQuestion}>
            <Text style={styles.qaNum}>Q</Text>
            <Text style={styles.qaQuestionText}>{block.content.question}</Text>
          </View>
          {block.content.modelAnswer ? (
            <Text style={styles.qaAnswer}>{block.content.modelAnswer}</Text>
          ) : null}
        </View>
      );
    }
  }
}

/** Generate the PDF buffer for a document (server route; client usePDF fallback shares this component tree). */
export async function generatePDFBuffer(
  doc: Document,
  tokens: DesignTokens,
  _opts: PDFOptions = {},
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

  const element = (
    <PDFDocument title={doc.title || "Document"} author="Writer App">
      <Page size="A4" style={pageStyles.page}>
        {doc.blocks.map((b) => (
          <BlockToPDF key={b.id} block={b} tokens={tokens} />
        ))}
      </Page>
    </PDFDocument>
  );
  return renderToBuffer(element);
}
