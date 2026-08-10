// lib/design-tokens.ts — runtime-derived design tokens (FR-43/FR-47).
//
// The design system lives ONLY in the instructions file's TOKENS block
// (lib/tokens.ts parses it at runtime — no source files are rewritten).
// This module caches the parsed result in memory and exposes a fallback
// DEFAULT_TOKENS so the app never crashes if the block is missing.
//
// Both renderers consume the SAME token object:
//   - lib/html-template.ts (template-mode HTML preview)
//   - lib/pdf.ts (@react-pdf/renderer PDF)
// → the HTML preview and the PDF can never drift apart.

import { parseTokensBlock, readActiveInstructions } from "./tokens";

export interface DesignTokens {
  colors: {
    mainText: string;
    heading: string;
    accentGreen: string;
    lightBg: string;
    highlightBg: string;
    border: string;
    tableStripe: string;
    vocabBg: string; // vocab/expressions grid body tint (#eef2f7 — print spec)
    rowBorder: string; // vocab grid row separator (#d8dfe8 — print spec)
    tagBg: string;
    tagText: string;
    badgeBg: string;
    badgeText: string;
  };
  fonts: { base: string; mono: string; pdf: string };
  sizes: { base: string; print: string; small: string };
  spacing: {
    pageMargin: string;
    printMargin: string;
    cardPadding: string;
    answerPadding: string;
  };
  radius: { card: string; badge: string; tag: string };
}

/**
 * Fallback tokens — kept in sync with the instructions file's TOKENS block.
 * Used only when the block is missing or unparseable.
 */
export const DEFAULT_TOKENS: DesignTokens = {
  colors: {
    mainText: "#1a1a1a",
    heading: "#1e3a5f",
    accentGreen: "#2c5f2d",
    lightBg: "#f7f9fb",
    highlightBg: "#fdfcf9",
    border: "#d0d5dc",
    tableStripe: "#f0f3f6",
    vocabBg: "#eef2f7",
    rowBorder: "#d8dfe8",
    tagBg: "#e8f0e9",
    tagText: "#2c5f2d",
    badgeBg: "#1e3a5f",
    badgeText: "#ffffff",
  },
  fonts: {
    base: "Georgia, Times New Roman, serif",
    mono: "Courier New, monospace",
    pdf: "Times-Roman",
  },
  sizes: {
    base: "11.5px",
    print: "10.5px",
    small: "0.8rem",
  },
  spacing: {
    pageMargin: "18mm",
    printMargin: "14mm",
    cardPadding: "14px 16px",
    answerPadding: "8px 12px",
  },
  radius: {
    card: "6px",
    badge: "50%",
    tag: "3px",
  },
};

let cache: Promise<DesignTokens> | null = null;

/** Parse the instructions TOKENS block once, then serve the cached result. */
export function getTokens(): Promise<DesignTokens> {
  if (!cache) {
    cache = (async () => {
      const instructions = await readActiveInstructions();
      return parseTokensBlock(instructions, DEFAULT_TOKENS) ?? DEFAULT_TOKENS;
    })();
  }
  return cache;
}

/** Drop the in-memory cache so the next getTokens() re-reads the instructions file. */
export function invalidateDesignTokensCache(): void {
  cache = null;
}

/**
 * Parse tokens from an arbitrary instructions string (not the active file) —
 * used when converting with a document's snapshot rules (FR-23).
 */
export function getTokensFromInstructions(instructions: string): DesignTokens {
  return parseTokensBlock(instructions, DEFAULT_TOKENS) ?? DEFAULT_TOKENS;
}
