// lib/tokens.ts — runtime parser for the instructions file TOKENS block (FR-47, Plan §7/§20).
// The instructions file (data/instructions/active.md, falling back to the repo
// docs/html_instructions.md) is the ONE place the design system lives. This parser
// reads it at runtime and never rewrites any source file.
//
// Parser is whitespace-lenient: sections are `name:` lines, entries are
// `key: value` lines (values may be quoted). Missing keys fall back to defaults
// (defined in lib/design-tokens.ts) so the app never crashes on a partial block.

import { promises as fs } from "node:fs";
import path from "node:path";

import type { DesignTokens } from "./design-tokens";
import { seedInstructionsIfMissing } from "./instructions";

/** Repo copy of the style instructions (fallback until M4 seeds data/instructions/active.md). */
export const REPO_INSTRUCTIONS_PATH = path.join(
  process.cwd(),
  "docs",
  "html_instructions.md",
);

/** Runtime copy used for AI prompts (seeded in M4; absent in M1). */
export const ACTIVE_INSTRUCTIONS_PATH = path.join(
  process.cwd(),
  "data",
  "instructions",
  "active.md",
);

/** Extract and parse the `<!-- TOKENS --> … <!-- /TOKENS -->` block of a markdown file. */
export function parseTokensBlock(markdown: string, defaults: DesignTokens): DesignTokens | null {
  const match = markdown.match(/<!--\s*TOKENS\s*-->([\s\S]*?)<!--\s*\/TOKENS\s*-->/);
  if (!match) return null;

  const sections: Record<string, Record<string, string>> = {};
  let current: string | null = null;

  for (const rawLine of match[1].split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith("<!--")) continue;
    // Section header: `colors:` on its own line
    const sectionMatch = line.match(/^([a-zA-Z][\w-]*)\s*:\s*$/);
    if (sectionMatch) {
      current = sectionMatch[1];
      sections[current] ??= {};
      continue;
    }
    // Key-value entry: `mainText: "#1a1a1a"`
    const kvMatch = line.match(/^([a-zA-Z][\w-]*)\s*:\s*(.+?)\s*$/);
    if (kvMatch && current) {
      sections[current][kvMatch[1]] = kvMatch[2].replace(/^["']|["']$/g, "");
    }
  }

  const colors = sections.colors ?? {};
  const fonts = sections.fonts ?? {};
  const sizes = sections.sizes ?? {};
  const spacing = sections.spacing ?? {};
  const radius = sections.radius ?? {};

  const tokens: DesignTokens = {
    colors: {
      mainText: colors.mainText ?? defaults.colors.mainText,
      heading: colors.heading ?? defaults.colors.heading,
      accentGreen: colors.accentGreen ?? defaults.colors.accentGreen,
      lightBg: colors.lightBg ?? defaults.colors.lightBg,
      highlightBg: colors.highlightBg ?? defaults.colors.highlightBg,
      border: colors.border ?? defaults.colors.border,
      tableStripe: colors.tableStripe ?? defaults.colors.tableStripe,
      vocabBg: colors.vocabBg ?? defaults.colors.vocabBg,
      rowBorder: colors.rowBorder ?? defaults.colors.rowBorder,
      tagBg: colors.tagBg ?? defaults.colors.tagBg,
      tagText: colors.tagText ?? defaults.colors.tagText,
      badgeBg: colors.badgeBg ?? defaults.colors.badgeBg,
      badgeText: colors.badgeText ?? defaults.colors.badgeText,
    },
    fonts: {
      base: fonts.base ?? defaults.fonts.base,
      mono: fonts.mono ?? defaults.fonts.mono,
      pdf: fonts.pdf ?? defaults.fonts.pdf,
    },
    sizes: {
      base: sizes.base ?? defaults.sizes.base,
      print: sizes.print ?? defaults.sizes.print,
      small: sizes.small ?? defaults.sizes.small,
    },
    spacing: {
      pageMargin: spacing.pageMargin ?? defaults.spacing.pageMargin,
      printMargin: spacing.printMargin ?? defaults.spacing.printMargin,
      cardPadding: spacing.cardPadding ?? defaults.spacing.cardPadding,
      answerPadding: spacing.answerPadding ?? defaults.spacing.answerPadding,
    },
    radius: {
      card: radius.card ?? defaults.radius.card,
      badge: radius.badge ?? defaults.radius.badge,
      tag: radius.tag ?? defaults.radius.tag,
    },
  };
  return tokens;
}

/**
 * Read the active instructions: data/instructions/active.md, seeded from the
 * repo docs/html_instructions.md on first run (FR-21). Throws if the repo
 * copy is missing.
 */
export async function readActiveInstructions(): Promise<string> {
  await seedInstructionsIfMissing(ACTIVE_INSTRUCTIONS_PATH);
  return fs.readFile(ACTIVE_INSTRUCTIONS_PATH, "utf8");
}
