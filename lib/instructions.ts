// lib/instructions.ts — instructions management (FR-21/22/23/47).
//
// Owning file for everything about the active instructions file
// (data/instructions/active.md): first-run seeding from the repo copy
// (docs/html_instructions.md), version hashing, save-with-history, reset-to-
// repo, per-document snapshots (FR-23), and resolving which instructions a
// conversion should use. Every save invalidates the design-token cache so
// design changes apply to new conversions immediately (FR-47).

import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

import { REPO_INSTRUCTIONS_PATH } from "./tokens";
import { invalidateDesignTokensCache } from "./design-tokens";
import type { StorageBackend } from "./storage";

/** Actionable error for instructions operations (mapped to HTTP 400 by routes). */
export class InstructionsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InstructionsError";
  }
}

export interface InstructionsHistoryEntry {
  version: string;
  savedAt: string;
}

/** Stable short content hash — used as the instructions version identifier. */
export function hashVersion(content: string): string {
  return createHash("sha1").update(content, "utf8").digest("hex").slice(0, 8);
}

/**
 * Seed the active instructions file on first run (FR-21): copy the repo copy
 * to `activePath` when it doesn't exist yet. Idempotent. Also drops the token
 * cache so the freshly-seeded file is picked up immediately.
 */
export async function seedInstructionsIfMissing(activePath: string): Promise<void> {
  try {
    await fs.access(activePath);
    return; // already seeded
  } catch {
    // not seeded yet — fall through and copy the repo file
  }
  const repo = await fs.readFile(REPO_INSTRUCTIONS_PATH, "utf8");
  await fs.mkdir(path.dirname(activePath), { recursive: true });
  await fs.writeFile(activePath, repo, "utf8");
  invalidateDesignTokensCache();
}

/**
 * "The newer writer wins" auto-sync (to-do item 10, 2026-08-13): when the repo
 * copy `docs/html_instructions.md` is newer than the last write of the active
 * copy, the repo content overwrites the active copy — so every instructions
 * change in the repo reaches storage automatically, no more manual "Reset to
 * repo file" on /instructions. A user edit made AFTER a repo change is the
 * newer writer and wins; the next repo change re-syncs. A missing active copy
 * counts as editedAt 0, so the first read always seeds (same path as FR-21).
 * Machine syncs NEVER snapshot history — history is reserved for user saves.
 * The design-token cache is invalidated so the new tokens apply immediately
 * (FR-47).
 */
export async function syncActiveFromRepo(storage: StorageBackend): Promise<void> {
  const repoMtime = (await fs.stat(REPO_INSTRUCTIONS_PATH)).mtimeMs;
  const activeEditedAt = await storage.getInstructionsEditedAt();
  if (repoMtime <= activeEditedAt) return; // the active copy is the newer writer — keep it
  const repo = await fs.readFile(REPO_INSTRUCTIONS_PATH, "utf8");
  await storage.writeInstructions(repo);
  invalidateDesignTokensCache();
}

/** Full state for the instructions editor: content + version + history. */
export async function getInstructionsState(storage: StorageBackend): Promise<{
  content: string;
  version: string;
  source: "active";
  history: InstructionsHistoryEntry[];
}> {
  const content = await storage.readInstructions(); // FS impl seeds on first read
  return {
    content,
    version: hashVersion(content),
    source: "active",
    history: await storage.listInstructionsHistory(),
  };
}

/**
 * Save new instructions (FR-22/47): the TOKENS block must survive (it drives
 * the design system), the previous version is snapshotted to history, then the
 * active file is replaced and the token cache invalidated.
 */
export async function saveInstructions(storage: StorageBackend, content: string): Promise<string> {
  if (!/<!--\s*TOKENS\s*-->/.test(content)) {
    throw new InstructionsError(
      "The instructions must keep the <!-- TOKENS --> block — it drives the design system (FR-47).",
    );
  }
  const current = await storage.readInstructions();
  await storage.snapshotInstructions(hashVersion(current)); // history keeps the old version
  await storage.writeInstructions(content);
  invalidateDesignTokensCache();
  return hashVersion(content);
}

/** Reset the active file to the repo copy (FR-22 "reset to repo file"). */
export async function resetInstructions(storage: StorageBackend): Promise<string> {
  const current = await storage.readInstructions();
  await storage.snapshotInstructions(hashVersion(current));
  const repo = await fs.readFile(REPO_INSTRUCTIONS_PATH, "utf8");
  await storage.writeInstructions(repo);
  invalidateDesignTokensCache();
  return hashVersion(repo);
}

/**
 * Per-document snapshot CONTENT (FR-23): the `instructionsSnapshot` field on
 * the document first (2026-08-13 — moved from a file so it works without
 * Blob), with the legacy `documents/<id>/instructions.snapshot.md` file as a
 * fallback for older documents. Returns null when neither exists.
 */
async function readSnapshotContent(
  storage: StorageBackend,
  docId: string | null | undefined,
): Promise<string | null> {
  if (!docId) return null;
  const doc = await storage.getDocument(docId);
  if (doc?.instructionsSnapshot) return doc.instructionsSnapshot;
  const file = await storage.readFile(docId, "instructions.snapshot.md");
  return file ? file.toString("utf8") : null;
}

/** Read the per-document instructions snapshot (FR-23), if one exists. */
export async function readDocumentSnapshot(
  storage: StorageBackend,
  docId: string,
): Promise<{ content: string; version: string } | null> {
  const content = await readSnapshotContent(storage, docId);
  if (content === null) return null;
  return { content, version: hashVersion(content) };
}

/**
 * Which instructions a conversion uses: the document's snapshot when the
 * "convert with the rules it was made with" toggle is on, else the active file.
 */
export async function resolveConversionInstructions(
  storage: StorageBackend,
  docId: string | null | undefined,
  useSnapshot: boolean,
): Promise<string> {
  if (useSnapshot && docId) {
    const content = await readSnapshotContent(storage, docId);
    if (content) return content;
  }
  return storage.readInstructions();
}
