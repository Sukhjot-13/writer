// M4 smoke test: instructions management (FR-21/22/23/47) — seeding, version
// hashing, save-with-history, reset-to-repo, per-document snapshots,
// snapshot-aware conversion resolution. Uses a scratch data dir under
// tests/.tmp-m4 (inside the project; gitignored).

import { promises as fs } from "node:fs";
import path from "node:path";

import { createFSStorage } from "../lib/storage-fs";
import {
  hashVersion,
  seedInstructionsIfMissing,
  getInstructionsState,
  saveInstructions,
  resetInstructions,
  readDocumentSnapshot,
  resolveConversionInstructions,
  InstructionsError,
} from "../lib/instructions";
import { REPO_INSTRUCTIONS_PATH } from "../lib/tokens";
import { getTokensFromInstructions, invalidateDesignTokensCache } from "../lib/design-tokens";
import { persistDocument } from "../lib/save";
import { createDocument, createBlock, setBlockContent } from "../lib/types";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => {
  if (cond) { pass++; console.log("PASS —", name); }
  else { fail++; console.log("FAIL —", name); }
};

const SCRATCH = path.resolve(__dirname, "..", ".tmp-m4");

async function cleanScratch() {
  await fs.rm(SCRATCH, { recursive: true, force: true });
}

async function run() {
  await cleanScratch();
  invalidateDesignTokensCache();

  // ---------- hashVersion ----------
  check("hashVersion: stable for same content", hashVersion("abc") === hashVersion("abc"));
  check("hashVersion: differs for different content", hashVersion("abc") !== hashVersion("abd"));
  check("hashVersion: 8 hex chars", /^[0-9a-f]{8}$/.test(hashVersion("anything")));

  // ---------- seeding (FR-21) ----------
  const seedPath = path.join(SCRATCH, "instructions", "active.md");
  await seedInstructionsIfMissing(seedPath);
  const seeded = await fs.readFile(seedPath, "utf8");
  const repo = await fs.readFile(REPO_INSTRUCTIONS_PATH, "utf8");
  check("seed: active.md created from repo copy", seeded === repo);
  const seedMtime = (await fs.stat(seedPath)).mtimeMs;
  await seedInstructionsIfMissing(seedPath); // idempotent
  check("seed: idempotent (does not rewrite)", (await fs.stat(seedPath)).mtimeMs === seedMtime);
  check("seed: repo file still has TOKENS block", /<!--\s*TOKENS\s*-->/.test(repo));

  // ---------- FS storage readInstructions seeds + history ----------
  const storage = createFSStorage(path.join(SCRATCH, "data"));
  const active = await storage.readInstructions();
  check("storage.readInstructions: seeds + returns content", active === repo);
  check("storage.readInstructions: DATA_DIR-aware path exists",
    await fs.access(path.join(SCRATCH, "data", "instructions", "active.md")).then(() => true, () => false));

  // ---------- getInstructionsState ----------
  const state = await getInstructionsState(storage);
  check("getInstructionsState: version + empty history", state.version === hashVersion(active) && state.history.length === 0);

  // ---------- saveInstructions (FR-22/47) ----------
  const modified = repo + "\n\n<!-- test note: m4 smoke -->\n";
  let threw = false;
  try { await saveInstructions(storage, "no tokens block here"); } catch (e) { threw = e instanceof InstructionsError; }
  check("saveInstructions: rejects content without TOKENS block", threw);
  const newVersion = await saveInstructions(storage, modified);
  check("saveInstructions: returns new version hash", newVersion === hashVersion(modified));
  const afterSave = await storage.readInstructions();
  check("saveInstructions: active file replaced", afterSave === modified);
  const history = await storage.listInstructionsHistory();
  check("saveInstructions: previous version snapshotted to history", history.length === 1 && history[0].version === hashVersion(active));
  const restored = await storage.readInstructionsVersion(history[0].version);
  check("readInstructionsVersion: history content readable", restored === active);

  // ---------- resetInstructions (FR-22) ----------
  const resetVersion = await resetInstructions(storage);
  check("resetInstructions: active back to repo copy", (await storage.readInstructions()) === repo);
  check("resetInstructions: version matches repo", resetVersion === hashVersion(repo));
  const history2 = await storage.listInstructionsHistory();
  check("resetInstructions: modified version kept in history", history2.length === 2);

  // ---------- getTokensFromInstructions (snapshot template conversion, FR-23) ----------
  const tokens = getTokensFromInstructions(repo);
  check("getTokensFromInstructions: parses TOKENS from arbitrary content", tokens.colors.mainText.length > 0);
  const tokensFallback = getTokensFromInstructions("no tokens here at all");
  check("getTokensFromInstructions: falls back to defaults", tokensFallback.colors.accentGreen === "#2c5f2d");

  // ---------- persistDocument: snapshot rides on the document (FR-23, 2026-08-13) ----------
  // Rework: the instructions snapshot moved from a FILE (instructions.snapshot.md,
  // which required Vercel Blob on the Mongo backend) to the `instructionsSnapshot`
  // DOCUMENT FIELD — plain data, every backend, nothing pre-generated. Legacy
  // snapshot files are still read as a fallback for older documents.
  const doc = createDocument("Snapshot smoke");
  doc.blocks = [setBlockContent(createBlock("paragraph"), { text: "Bonjour." })];
  // M6: the snapshot is recorded only when the caller reports the instructions
  // version the document was converted with (the editor sends it after a
  // conversion) — plain saves no longer snapshot.
  await persistDocument(storage, doc, hashVersion(repo));
  // version-gated: a save WITHOUT the version must not snapshot
  const docPlain = createDocument("Plain save");
  docPlain.blocks = [setBlockContent(createBlock("paragraph"), { text: "Sans version." })];
  await persistDocument(storage, docPlain);
  const snapPlain = await readDocumentSnapshot(storage, docPlain.id);
  check("persistDocument: no version → no snapshot (M6)", snapPlain === null);
  const snap = await readDocumentSnapshot(storage, doc.id);
  check("persistDocument: instructionsSnapshot recorded on the document",
    snap !== null && snap.version === hashVersion(repo) && snap.content === repo);
  const saved = await storage.getDocument(doc.id);
  check("persistDocument: snapshot persisted inside document.json", saved?.instructionsSnapshot === repo);
  check("persistDocument: no snapshot FILE written anymore",
    (await storage.readFile(doc.id, "instructions.snapshot.md")) === null);
  // legacy fallback: no field, but an old snapshot file exists → still read
  const docLegacy = createDocument("Legacy snapshot");
  await persistDocument(storage, docLegacy);
  await storage.writeFile(docLegacy.id, "instructions.snapshot.md", Buffer.from(repo, "utf8"));
  const snapLegacy = await readDocumentSnapshot(storage, docLegacy.id);
  check("readDocumentSnapshot: legacy file read when the field is absent",
    snapLegacy !== null && snapLegacy.content === repo);

  // ---------- resolveConversionInstructions (FR-23 toggle) ----------
  const resolvedActive = await resolveConversionInstructions(storage, doc.id, false);
  check("resolve: no toggle → active rules", resolvedActive === repo);
  const resolvedSnap = await resolveConversionInstructions(storage, doc.id, true);
  check("resolve: toggle → snapshot rules", resolvedSnap === repo);
  // change active, then verify toggle returns the OLD (snapshot) rules
  await saveInstructions(storage, repo + "\n\n<!-- changed later -->\n");
  const snapAfter = await readDocumentSnapshot(storage, doc.id);
  const resolvedOld = await resolveConversionInstructions(storage, doc.id, true);
  const resolvedLatest = await resolveConversionInstructions(storage, doc.id, false);
  check("resolve: snapshot keeps the rules the doc was made with",
    snapAfter !== null && resolvedOld === snapAfter.content && snapAfter.version !== hashVersion(resolvedLatest));

  // ---------- auto-sync "newer writer wins" (to-do item 10) ----------
  // The sync compares mtimes against the REAL repo file, so these checks shift
  // its mtime around and restore the original in `finally` — the suite never
  // leaves the repo file touched.
  const repoMtime = (await fs.stat(REPO_INSTRUCTIONS_PATH)).mtimeMs;
  const historyBeforeSync = await storage.listInstructionsHistory();
  try {
    // (a) repo copy newer than the active copy → next read returns REPO content
    const future = new Date(Date.now() + 120_000);
    await fs.utimes(REPO_INSTRUCTIONS_PATH, future, future);
    const stateSynced = await getInstructionsState(storage);
    check("auto-sync: repo newer → active becomes repo content",
      stateSynced.content === repo && stateSynced.version === hashVersion(repo));
    check("auto-sync: machine sync leaves history untouched (no phantom snapshot)",
      (await storage.listInstructionsHistory()).length === historyBeforeSync.length);

    // (b) user edit AFTER a repo change wins — the user is the newer writer
    const past = new Date(Date.now() - 120_000);
    await fs.utimes(REPO_INSTRUCTIONS_PATH, past, past);
    const userContent = repo + "\n\n<!-- user edit after repo change (must win) -->\n";
    await saveInstructions(storage, userContent);
    const stateUser = await getInstructionsState(storage);
    check("auto-sync: user edit after repo change wins",
      stateUser.content === userContent && stateUser.version === hashVersion(userContent));
    check("auto-sync: editedAt reflects the user save",
      (await storage.getInstructionsEditedAt()) > past.getTime());
  } finally {
    const restore = new Date(repoMtime);
    await fs.utimes(REPO_INSTRUCTIONS_PATH, restore, restore);
  }

  // (d) missing active copy → editedAt 0 and the first read still seeds (FR-21 intact)
  const freshStorage = createFSStorage(path.join(SCRATCH, "data-fresh"));
  check("auto-sync: missing active copy → editedAt 0",
    (await freshStorage.getInstructionsEditedAt()) === 0);
  const freshState = await getInstructionsState(freshStorage);
  check("auto-sync: first-run read seeds repo content (FR-21 intact)",
    freshState.content === repo && freshState.version === hashVersion(repo));

  await cleanScratch();
  console.log(`\nM4 smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error("M4 smoke crashed:", e);
  process.exit(1);
});
