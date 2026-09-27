# Suggestions

## 🔴 Vulnerabilities

- **2026-08-13 — react-pdf 4.6.0 (latest) `fixed` + `position: absolute` + `bottom` footer bug.** On continuation pages of multi-page documents, the paginator omits the page box height when splitting (`omit('height', page.box)` in `@react-pdf/layout` `splitPage`), which breaks yoga's bottom resolution and gives the footer a garbage ~1e22pt height → pdfkit rejects the coordinate ("unsupported number: -1.2915355457378698e+22") → the whole PDF download 500s. Only documents long enough to paginate were affected. **Workaround in place** (`lib/pdf.tsx`): pin `height` to one footer line on the footer View. If we ever upgrade react-pdf, re-test a 60+ block document immediately — and consider removing the pinned height if the upstream layout is fixed.

## 🟢 Improvements

- **2026-09-26 — The smoke-m5 "parse: vocab grid rows" check is FIXED (was a real parser bug, not an outdated assertion):** `elementsByClass()` in `lib/html-to-blocks.ts` used stack pop() without reversing children, returning every sibling group back-to-front — vocab rows (and paragraphs, and qa-answer first-match) parsed in reverse document order. Children are now pushed reversed so pop() visits document order. M5 went 37+1-deferred → **38/38**, run-all **8/8**.

- **2026-09-26 — PDF text extractor committed:** `tests/pdf-extract.py` inflates content streams and decodes hex TJ runs (UTF-16BE + WinAnsi) plus literal runs; verified against real react-pdf output (`Hello RÉPONSE_vocab` round-trips incl. accents). Use it to assert PDF text per variant instead of eyeballing stream sizes.

- **2026-09-26 — Legacy blob-artifact cleanup shipped as a runnable script:** `scripts/migrate-legacy-blobs.mjs` (dry-run default, `--apply` to write; self-contained on `mongodb` + `@vercel/blob`, needs `MONGODB_URI`). Migrates `instructions.snapshot.md` → `doc.instructionsSnapshot` and `document.html` → `doc.sourceHtml` (external-html docs), then sweeps orphaned `files` rows + blob objects. Run it against the Atlas DB when convenient.

- **2026-09-26 — Unsaved-changes tab-close alert shipped:** `Editor.tsx` adds a `beforeunload` guard that prompts only while edits are still dirty (saved sessions never nag) — last-resort net behind the existing `visibilitychange`/`pagehide` flush.

- **2026-08-13 — User preferences in the DB (later, gated on accounts).** Four preferences live in localStorage today: `writer-app:theme` (dark/light), `writer-app:autosave` (toggle), `writer-app:add-type` (last chosen block type), `writer-app:copy-selection` (copy dialog checkboxes) — all per-browser. They logically belong in a storage `settings` collection keyed by owner so they follow the user across devices. Not built because there is NO auth yet (FR-45 `ownerId` seams exist but are always null in v1) — a DB settings row can't be tied to anyone without accounts. When users land: add `settings` to the storage interface + both backends (FS `data/settings.json`, Mongo `settings` collection), a GET/PUT `/api/settings` route, and swap the localStorage reads in ThemeToggle/Editor/BlockList/CopyDialog to fetch-on-mount with localStorage as the offline fallback. Audit done 2026-08-13 — these four keys are the ONLY client-side state that never touches the DB.

- **2026-09-26 — Per-document version history shipped:** every `saveDocument` snapshots the pre-save content (capped at 20, oldest pruned; versions cleaned on delete) via new `snapshotDocument`/`listDocumentVersions`/`readDocumentVersion` seams on both backends (FS `versions/*.json`, Mongo `docversions` collection); new `/api/documents/[id]/versions` + `/versions/[version]` (GET read, POST restore — restoring snapshots current first, so restores are undoable); editor History button + `DocHistory` modal with two-step restore. M8 grows 23 → 27.

- **2026-08-13 — Structured analysis points (the full-pipeline variant — NOT built, deliberate; to-do item 2).** The user chose **free-text bullets** for the analysis/breakdown ("it can be just as answer analysis… that also works; points are just easy to understand") — `- ` lines render as a real `<ul class="point-list">` (HTML) / `•`-prefixed lines (PDF), renderer-only, no new data. This entry records the **structured alternative** in case real point data is ever wanted (independent add/remove/reorder of each point). Full-pipeline design:
  1. `analysisPoints?: string[]` on `QaContent`/`ParagraphContent`/`EssayContent` (`lib/types.ts`; `createBlock` factories get `analysisPoints: []`).
  2. `lib/schemas.ts` — `z.array(z.string().trim().min(1).max(500)).optional()` on all three content schemas.
  3. `lib/structuring.ts` — `aiBlockEntrySchema` gains `analysisPoints` on qa/paragraph/essay shapes; `optList` normalization (drop empty strings/empty arrays).
  4. `docs/html_instructions.md` — the ANALYSIS POINTS rule (2026-08-13) upgraded: "output `analysisPoints` as an array, one point per entry".
  5. `lib/prompt.ts` — JSON shapes in the conversion demand + `BLOCK_FORMAT_SPEC` gain `analysisPoints`; `serializeQa`/`serializeBlocksForAI` emit an `ANALYSIS_POINTS: point1; point2` marker (Copy-for-AI round-trips, same pattern as VOCAB/SYNONYMS).
  6. Editor — `ParagraphFields` + `QaBlockForm` gain a "＋ Points" chip revealing a single-column row editor (RowEditor is term/def; a simplified variant or a reused row with an empty term cell).
  7. `lib/html-template.ts` — analysis renders its points as `<ul class="point-list">` (the free-text `- ` pass stays for hand-written bullets).
  8. `lib/pdf.tsx` — points mapped through `bulletText` (joined with `\n`).
  9. `lib/html-to-blocks.ts` — parse-back recovers `<li>` items under `.qa-analyse`/`.p-analyse` into `analysisPoints`.
  10. Tests — smoke-m7 (+ smoke-m5 parse-back) extended; `buildCopyText` prints `- point` lines under `Analyse :`.
  Why not built: ~10 files for marginal benefit — free-text bullets deliver the same rendered output with 3 files (two renderers + instructions). Build this only if the user asks for per-point editing/reordering.

- **2026-09-26 — Test-document naming + flag lifecycle shipped:** the toolbar Practice pill reads "Test" on generator-made documents with a TEST badge next to the title, plus a "Make normal" action clearing `opensInPractice` (persists through the normal save path) — teachers can reuse a test as a regular worksheet.

- **2026-08-13 — PDF QA cards never split mid-question (done).** react-pdf v4.6 has no `breakInside: "avoid"` style; the equivalent is the `wrap={false}` View prop (moves the whole element to the next page instead of splitting it; oversized elements stay put and push future siblings over — `splitNodes` in `@react-pdf/layout`). Applied to each QA card in `lib/pdf.tsx`, mirroring `.qa-block { break-inside: avoid }` in the HTML template. Verified: 84/84 qa blocks un-split (page count 17→18 as cards moved whole). If react-pdf ever adds `breakInside`, consider switching for readability.

- **2026-08-13 — PDF badge digit centering is empirical, not modeled.** The download's badge digit sat ~3pt high; the first fix (`lineHeight: "18pt"`, CSS-style line-height trick) made it worse (~5.25pt high) because react-pdf anchors the glyph baseline differently than browsers. Current fix: unitless `lineHeight: 1.3` (~7.85pt line box, flex-centering pushes the digit to the 9pt center). If a future font change (tokens.fonts.pdf) shifts the baseline, re-measure with a 96dpi pixel check rather than reasoning from font metrics — the font-metric model did not predict the measured offsets.
