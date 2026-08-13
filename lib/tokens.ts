// lib/tokens.ts — runtime parser for the instructions file TOKENS block (FR-47, Plan §7/§20).
// The instructions (the storage-backed active copy, seeded/synced from the repo
// docs/html_instructions.md) are the ONE place the design system lives. This parser
// reads them at runtime and never rewrites any source file. Since 2026-08-13 the
// active copy is read through the storage backend (MongoDB) — the old filesystem
// seed (data/instructions/active.md) was removed because serverless filesystems
// are read-only (Vercel: "ENOENT: mkdir '/var/task/data'").
//
// Parser is whitespace-lenient: sections are `name:` lines, entries are
// `key: value` lines (values may be quoted). Missing keys fall back to defaults
// (defined in lib/design-tokens.ts) so the app never crashes on a partial block.

import { promises as fs } from "node:fs";
import path from "node:path";

import type { DesignTokens } from "./design-tokens";

/** Repo copy of the style instructions — the read-only source the storage backends seed from. */
export const REPO_INSTRUCTIONS_PATH = path.join(
  process.cwd(),
  "docs",
  "html_instructions.md",
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
 * Read the active instructions through the storage backend (MongoDB — the
 * user's edited copy, auto-synced from the repo file by lib/instructions.ts).
 * When no MONGODB_URI is configured (local smoke tests, M1-era fallback) the
 * repo copy `docs/html_instructions.md` is read directly — read-only, no
 * filesystem writes (the data/instructions seed was removed 2026-08-13).
 */
export async function readActiveInstructions(): Promise<string> {
  if (process.env.MONGODB_URI) {
    const { getStorage } = await import("./storage");
    return getStorage().readInstructions();
  }
  return fs.readFile(REPO_INSTRUCTIONS_PATH, "utf8");
}
