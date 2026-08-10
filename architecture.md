# Architecture — Writer App

> **Project root:** `/Users/sukhjot/Desktop/untitled folder 2/writer-app` — Next.js (App Router, TypeScript, Tailwind v4) writer/practice app per `docs/writer_app_requirements.md` (v1.4, FR-1…FR-50) and `docs/Plan.md`.
> **Status:** All milestones **M1–M6 DONE (2026-08-10)** — M1 editor + conversion + PDF + library · M2 Q&A blocks + practice controls · M3 DeepSeek + question import + copy/paste · M4 instructions management (edit/save/reset/history FR-21/22, per-document snapshots + conversion toggle FR-23, TOKENS validation FR-47, version in status bar FR-28) · M5 polish + storage + parse-back (drag-reorder, Enter-split/Backspace-merge FR-3, tags FR-5/18, backup ZIP, HTML→blocks FR-41, MongoDB + Blob FR-44) · UI polish pass (grouped two-row toolbar, Geist font applied, light-only theme, de-jargoned labels). **M6 REDESIGN (2026-08-10):** home page is a dashboard (`/` lists documents + "New document"; editor moved to `/doc/[id]`) · AI conversion returns **editable structured blocks** (template/offline mode deleted; `lib/structuring.ts` canonical JSON-array parser; one conversion, then local edits re-render instantly) · AI enrichment for ALL text (paragraphs get translation/analysis/vocab/expressions) · questions inside paragraphs become `qa` blocks, provided answers kept, never invented · clean worksheet cards (question + ONE reference answer field, extras behind "＋ chips") · **Practice master key** (questions-only view, "My answer" boxes, Check reveals model answers side-by-side, answers saved separately, Reset practice) · **on-demand preview + PDF** (full-screen PreviewSheet via stateless `POST /api/preview`; `POST /api/documents/[id]/pdf` with `{ doc, variant }` — no convert-first gating, `canDownloadPdf`/`previewStale` removed) · **three PDF variants** (`full` / `questions` / `my-answers`) · test generator planned-only (see suggestions.md). Type-checks clean (tsc, only the stale `.next/types/validator.ts` regenerated error remains); build + smoke verification in progress (task list). This file is updated after every change; it is the latest and current state of the app.

**Locked decisions (never revisit):** PDF engine = `@react-pdf/renderer` only (no Puppeteer/Chrome anywhere) · design tokens parsed at runtime from the instructions file `TOKENS` block (changing colors = editing `docs/html_instructions.md` only) · storage pluggable (filesystem now, MongoDB + Vercel Blob later) · no auth in v1, `ownerId` seams kept (FR-45) · one-change-one-file (AI → `lib/ai.ts`, PDF → `lib/pdf.ts`, storage → `lib/storage.ts`, design → instructions file, FR-48) · conversion is AI-only and block-based (M6 — preview/PDF render on demand from the current document, no stale-preview gating) · practice answers (`userAnswer`) are private: never sent to the AI, never serialized into prompts.

---

## Runtime layout (FR-17)

```
data/                          # gitignored runtime storage
  documents/<id>/document.json # source blocks (editable truth)
  documents/<id>/document.html # generated HTML (saved alongside the doc)
  documents/<id>/document.pdf  # generated PDF
  documents/<id>/instructions.snapshot.md # per-document rules (FR-23)
  instructions/active.md       # editable instructions (seeded in M4)
  instructions/history/*.md    # version history (M4)
```

## Files

### `docs/html_instructions.md` — Structuring & enrichment instructions (single source, FR-47)
- **Purpose:** THE system prompt for AI conversion + the design system. M6 rewrite: no longer an HTML-design spec — it defines how the AI **structures** content (question detection rules, provided answers kept verbatim, never invent answers for unanswered questions, French→English enrichment for qa AND paragraphs, respect HIDE flags, never output `userAnswer`/HTML). Ends with the machine-readable `<!-- TOKENS --> … <!-- /TOKENS -->` block: `colors` (mainText, heading, accentGreen, lightBg, highlightBg, border, tableStripe, tagBg, tagText, badgeBg, badgeText), `fonts` (base, mono, pdf), `sizes` (base, print, small), `spacing` (pageMargin, printMargin, cardPadding, answerPadding), `radius` (card, badge, tag). **Changing a color = editing this file only.**
- **Functions:** none (data file — parsed by `lib/tokens.ts`).
- **Note:** the rewrite does NOT propagate to existing `data/instructions/active.md` — the user clicks "Reset to repo file" once (recorded in suggestions.md).

### `docs/writer_app_requirements.md` / `docs/Plan.md` / `docs/suggestions.md` / `docs/architecture.md`
- **Purpose:** Requirements spec (v1.4), implementation plan (M1–M5), improvement log, and project-level architecture doc (parent folder scope). Documentation only.

### `lib/types.ts` — Shared data model (Plan §5)
- **Purpose:** Single source of truth for `Block`, `QaContent`, `ParagraphContent`, `Document` shapes (FR-1/33/34/45).
- **Functions:**
  - `createBlock(type: BlockType, id?)` — factory for a fresh block of any type with a unique id and type-appropriate empty content.
  - `createDocument(title?, id?)` — factory for a fresh unsaved document (uuid id when omitted, `ownerId: null`, `source: "editor"`). M6: optional `id` lets the editor keep the route's id so the first save creates it.
- **Types:** `BlockType = "title" | "heading" | "paragraph" | "qa" | "separator"`; `ParagraphContent` (M6: `text`, `format?`, `translation?`, `analysis?`, `vocab?`, `expressions?`, `userAnswer?` — practice answer, M6 parity with qa); `QaContent` (question, questionTranslation, grammarNote, responseLabel, userAnswer, modelAnswer, answerTranslation, analysis, vocab, expressions, hideTranslation, hideModelAnswer); `setBlockContent`/`replaceBlockType` helpers.

### `lib/schemas.ts` — zod validation schemas
- **Purpose:** API payload validation (Plan §3/§10). Mirrors `lib/types.ts`; `.loose()` on content objects preserves unknown/future fields through save/load.
- **Exports:** `blockSchema` (discriminated union on `type`; paragraph content += `translation`/`analysis`/`vocab`/`expressions`/`userAnswer` — M6), `documentSchema`, `saveDocumentPayloadSchema` (`{ doc, html?, instructionsVersion? }` — M6).

### `lib/tokens.ts` — TOKENS block parser (FR-47)
- **Purpose:** Reads the instructions file and extracts the machine-readable design tokens at runtime. Never rewrites source files.
- **Constants:** `REPO_INSTRUCTIONS_PATH` (`docs/html_instructions.md`), `ACTIVE_INSTRUCTIONS_PATH` (`data/instructions/active.md`).
- **Functions:**
  - `parseTokensBlock(markdown, defaults)` — extracts `<!-- TOKENS -->`…`<!-- /TOKENS -->`, parses whitespace-lenient `section:`/`key: value` lines (strips quotes), merges over `defaults`; returns `DesignTokens | null` (null when the block is missing).
  - `readActiveInstructions()` — seeds `data/instructions/active.md` from the repo copy on first run (M4, FR-21), then reads it; throws if the repo copy is missing.

### `lib/design-tokens.ts` — Runtime design tokens (FR-43)
- **Purpose:** Cached access to the parsed tokens + fallback defaults so the app never crashes. Both renderers (`html-template.ts`, `pdf.ts`) consume the same token object → HTML preview and PDF can never drift apart.
- **Exports:** `DesignTokens` interface, `DEFAULT_TOKENS` (fallback, kept in sync with the instructions file), `getTokens(): Promise<DesignTokens>` (cached), `invalidateDesignTokensCache()` (dropped on instructions save — M4), `getTokensFromInstructions(instructions: string): DesignTokens` (parses arbitrary content — used by snapshot conversion, FR-23).

### `lib/storage.ts` — Pluggable storage interface + factory (FR-44/45)
- **Purpose:** The only storage gateway app code uses. v1: filesystem (`DATA_DIR`); Vercel deploy: MongoDB + Vercel Blob (M5, `lib/storage-mongo.ts`). Owner seams on every operation (v1 ignores them).
- **Exports:** `StorageBackend` interface (incl. M4 additions `listInstructionsHistory()` → `{ version, savedAt }[]` newest-first, `readInstructionsVersion(version)` → content or null), `getStorage()` (factory — MongoDB when `MONGODB_URI` set, else FS), `createMongoBlobStorage()` (M5 — real Mongo/Blob implementation, no longer a throw stub).

### `lib/storage-mongo.ts` — MongoDB + Vercel Blob storage implementation (M5, FR-44)
- **Purpose:** The remote backend behind the pluggable interface. MongoDB collections (explicitly typed rows): `documents` (`_id` = doc id, all doc fields), `files` (`_id`, `url`, `contentType` — blob URL index per attachment), `instructions` (`_id` = `"active"` | `"history:<version>"`, `content`, `savedAt`). Lazy singleton connection (cached promise). Missing instructions seeded from the repo copy on first read (same M4 behavior as FS).
- **Functions:**
  - `getDb()` (private) — lazy `MongoClient.connect` cache; throws with a clear message when `MONGODB_URI`/`BLOB_READ_WRITE_TOKEN` are absent.
  - `createMongoBlobStorage()` — returns a `StorageBackend`: `listDocuments` (find + sort updatedAt desc), `getDocument`, `saveDocument` (updateOne `$set` + upsert), `deleteDocument` (best-effort blob `del` + deleteMany), `readFile/writeFile/deleteFile` (Blob `put`/fetch/`del` + files index rows), instructions ops (read/write/snapshot/history/version — see `lib/instructions.ts` for the same flow).
- **Note:** PUT/POST document routes keep the same `persistDocument` flow — only the backend differs; API behavior is identical between FS and Mongo/Blob.

### `lib/storage-fs.ts` — Filesystem storage implementation (FR-17)
- **Purpose:** `data/` layout per FR-17. Path-traversal guard via `SAFE_FILENAMES` allowlist.
- **Functions:**
  - `createFSStorage(dataDir)` — returns a `StorageBackend`: `listDocuments` (scan `data/documents/*/document.json`, skip invalid, sort updatedAt desc), `getDocument` (null when missing/corrupt), `saveDocument` (mkdir + pretty JSON), `deleteDocument` (recursive rm), `readFile/writeFile/deleteFile(docId, filename)`, `readInstructions` (seeds from repo copy when missing, M4), `writeInstructions`, `snapshotInstructions` (copies to `history/<version>.md`), `listInstructionsHistory` (newest-first by mtime), `readInstructionsVersion` (sanitizes `[^\w.-]` → `_`).

### `lib/instructions.ts` — Instructions management (M4, FR-21/22/23/47)
- **Purpose:** THE owning file for the runtime instructions lifecycle: idempotent first-run seeding from the repo copy, version hashing, save-with-history (previous version snapshotted before overwrite), reset-to-repo, per-document snapshots (`documents/<id>/instructions.snapshot.md`), and resolution of which instructions a conversion uses (active vs. snapshot). Token-cache invalidation is coupled to every write so design changes take effect immediately (FR-47).
- **Functions:**
  - `hashVersion(content)` — sha1 of the content, first 8 hex chars.
  - `seedInstructionsIfMissing(activePath)` — idempotently copies `docs/html_instructions.md` → the given path (default `ACTIVE_INSTRUCTIONS_PATH`) + invalidates the token cache.
  - `getInstructionsState(storage)` — `{ content, version, source: "active", history }`.
  - `saveInstructions(storage, content)` — throws `InstructionsError` when no `<!-- TOKENS -->` block (FR-47); snapshots the current version to history, writes active, invalidates the token cache; returns the new version.
  - `resetInstructions(storage)` — restores the repo copy as active (previous kept in history); returns the new version.
  - `readDocumentSnapshot(storage, docId)` — reads the doc's snapshot → `{ content, version } | null`.
  - `resolveConversionInstructions(storage, docId, useSnapshot)` — snapshot rules when `useSnapshot` and the doc has one, else the active instructions.
  - `InstructionsError` — typed error (TOKENS validation, missing repo copy).

### `lib/html-template.ts` — Styled HTML generator (FR-9, Plan §8.1)
- **Purpose:** Deterministic, self-contained styled HTML from block data + shared tokens. M6: now THE single HTML renderer (the offline "template conversion" mode was deleted — this renders previews/downloads only). Follows `docs/html_instructions.md`: A4 `@page`, Georgia/Times, token colors, `.qa-block` cards, `break-inside: avoid` in print. Full Q&A rendering: sequential circular badges, translation `<em>`, grammar note, response label, user-answer box (dashed left border), model answer, answer translation, analysis, vocab grid (`.two-col`/`.one-col`). **M6 paragraph enrichment:** `p.p-translation` (English translation under the text), `.p-analyse` ("Analyse :" box), and the same vocab/expressions grid as Q&A cards — plus the paragraph practice answer rendered as a `.qa-user-answer` dashed box (M6 bug fix, parity with qa). Color policy: every color from tokens only (FR-47); omission rules FR-36: hidden elements omitted entirely.
- **Functions:**
  - `escapeHtml(text)` — HTML-escapes user content (XSS defense; preview iframe is also sandboxed).
  - `renderInlineMarkdown(text)` — light inline markdown: `` `code` ``, `**bold**`, `*italic*` (applied after escaping).
  - `generateTemplateHTML(doc, tokens)` — builds the full HTML document (doctype, `<style>` from tokens, `<main class="document">` with block sections; Q&A numbering is sequential across the doc).
  - `tagClass(tag)` (private) — sanitizes user tags into CSS classes (`#past-tense` → `tag-past-tense`).
  - `qaVisible(doc, content, kind)` (private) — visibility check: hidden when the per-block flag OR the document `practice` default is set (FR-34/35).
  - `vocabGridHtml(vocab, expressions)` (private) — builds the vocab/expressions grid for BOTH qa cards and paragraphs (M6); `.two-col` when both lists exist, `.one-col` otherwise.
  - `qaBlockHtml(doc, block, tokens, number)` (private) — assembles a full `.qa-block` card with all optional parts; omitted parts never emitted.

### `lib/pdf.tsx` — @react-pdf/renderer PDF generation (FR-14/15, Plan §8.2)
- **Purpose:** The ONLY PDF engine. Generates A4 PDFs from block data (never from HTML) — no Chrome/Puppeteer anywhere. Styles come from the shared tokens (FR-43): Times-Roman, token colors, print margins (~14mm). `.tsx` because it contains JSX. **M6:** three variants via `PDFVariant` — `"full"` (everything), `"questions"` (shareable practice sheet: title + questions + blank answer areas only), `"my-answers"` (after practice: questions + the user's own answers, no reference answers — send for checking). **M6 bug fix:** paragraphs participate in practice PDFs — `"full"` renders paragraph `userAnswer` (dashed box, parity with qa); `"my-answers"` includes paragraphs with the user's written answer (or `BlankAnswerArea` when unanswered); `"questions"` stays title + qa. Paragraph translation/analysis/vocab grid render only in `"full"`. Note: react-pdf v4.6 has no `breakInside: "avoid"` — closest available is `minPresenceAhead` (documented limitation, see suggestions.md).
- **Functions:**
  - `lengthToPt(value)` — converts token lengths ("14mm", "11.5px", "0.8rem") to points for react-pdf.
  - `BlockToPDF({ block, doc, tokens, qaNumber, variant })` — maps a block to react-pdf elements; QA numbering sequential across the doc.
  - `QABlockPDF(...)` (private) — full Q&A card; omission matrix by variant (`hideAnswers = variant !== "full"`, `showUser = variant !== "questions"`, `showExtras = variant === "full"`) over the `qaVisible` rules (FR-36).
  - `BlankAnswerArea({ basePt, color })` (private) — empty ruled dashed area ≈4 lines (FR-49) for unanswered questions in non-full variants.
  - `qaVisible(doc, content, kind)` (private) — same visibility logic as the HTML template (FR-34/35).
  - `generatePDFBuffer(doc, tokens, opts?)` — renders `<PDFDocument>` via `renderToBuffer`; `opts.variant` selects the variant (M6 replaces the old `practice?` flag); non-full variants filter blocks to title + qa.

### `lib/html-to-blocks.ts` — HTML→blocks parse-back (M5, FR-41)
- **Purpose:** Best-effort parser that reconstructs editable blocks from rendered HTML (imported via "Paste HTML back" or the editor's "Parse to blocks" button on external-html documents). Scans for the class vocabulary emitted by `lib/html-template.ts` (`block-title`, `block-heading`, `block-paragraph`, `block-separator`, `block-qa`/`qa-block`; inside `.qa-block`: `.qa-question-text` with `<em>` translation, `.qa-grammar-note`, `.qa-response-label`, `.qa-user-answer`, `.qa-answer` exact-single-class, `.qa-translation`, `.qa-analyse`, `.qa-vocab-grid` `.two-col`/`.one-col` → `.qa-vocab-col` with headers "Vocabulaire Clé"/"Expressions Avancées"). Purely string-based — no DOM — runs identically in the browser and in node smoke tests. Unrecognized elements become paragraph blocks with the raw HTML preserved. Bold/italic/code markers restored as markdown (FR-42). Hide flags can't be detected from rendered HTML (hidden fields are omitted, so they never fabricate).
- **Exports:** `parseHtmlToBlocks(html): { blocks, unparsedCount }`, `collectTopLevel(html): Element[]`.
- **Functions:** `classList(attrs)`, `decodeHtml`, `textOnly(inner)`, `innerToMarkdown(inner)`, `elementEnd(html, start, tag)`, `collectTopLevel(html)`, `extractMain(html)`, `byClass(inner, cls)` (stack-based deep traversal — the M5 infinite-loop fix), `elementsByClass(inner, cls)`, `parseRows(container, rowClass)`, `parseQa(inner)`, `blockWithContent(type, content)`.

### `lib/structuring.ts` — Canonical AI block parser (M6, NEW)
- **Purpose:** THE one JSON-array parser for AI-structured content. Both the convert route and the client-side "Paste blocks (AI)" modal consume it, so the AI output shape, the Copy-for-AI format, and the paste round-trip are always the same format (FR-42). Tolerant: strips markdown fences, extracts first `[`…last `]`, zod-validates each entry, maps validated entries to blocks via the typed factories.
- **Exports:** `extractJsonArray(raw)` (fence-stripped slice → JSON or null), `aiBlockEntrySchema` (zod discriminatedUnion on `type` — title/heading/paragraph/qa/separator, `.loose()`, optional fields; qa requires `question`; paragraph carries `text` + `translation`/`analysis`/`vocab`/`expressions`), `parseStructuredBlocksResponse(raw): Block[]` (validates + normalizes: trims empty strings, drops empty lists, qa defaults `responseLabel: "RÉPONSE"` + `hideTranslation: false` + `hideModelAnswer: false`; skips empty-text entries).

### `lib/questions.ts` — Question-list parsing + AI structuring (M3, FR-32/38)
- **Purpose:** Local numbered/bulleted-list parser for question import, plus the AI-structuring prompt + tolerant JSON response parser (uses `extractJsonArray` from `./structuring`).
- **Functions:**
  - `splitQuestions(text)` — splits a pasted list: numbered (`1.`/`1)`), bulleted (`-`/`*`), blank-line separated; continuation lines merge into the current item; a numbered/bulleted line always starts a new item.
  - `questionsToQaBlocks(questions)` — question-only Q&A blocks with `responseLabel: "RÉPONSE"`.
  - `buildStructuringUserPrompt(questions)` — numbered list + exact JSON-array schema instruction for the AI.
  - `parseStructuredQaResponse(raw)` — tolerant: `extractJsonArray` → zod `.loose()` per entry → `QaContent[]`; empty array on garbage.

### `lib/prompt.ts` — Prompt assembly + block serialization (M3, FR-12/39, Plan §9.1)
- **Purpose:** The user section serializes every block with type markers (`<TITLE>`, `<HEADING LEVEL="2|3">`, `<PARAGRAPH FORMAT="markdown">`, `<SEPARATOR/>`, `<QA>` with `QUESTION:`/`QUESTION_TRANSLATION:`/`GRAMMAR_NOTE:`/`RESPONSE_LABEL:`/`MODEL_ANSWER:`/`ANSWER_TRANSLATION:`/`ANALYSIS:`/`VOCAB: term|def; …`/`EXPRESSIONS: …`/`HIDE_TRANSLATION:`/`HIDE_MODEL_ANSWER:`). **M6:** `USER_ANSWER:` was REMOVED from `serializeQa` — practice answers are private and never serialized anywhere (the "Copy for AI" markers and the convert prompt both exclude them). `buildAIPrompt` ends with the exact JSON-blocks demand: "Return ONLY a JSON array of block objects — no markdown fences, no explanations, no HTML" with the five block shapes, "Omit any optional field you cannot fill with confidence", "Never invent an answer for an unanswered question — leave modelAnswer out entirely", "Never include user answers".
- **Functions:**
  - `serializeQa(c)` (private) — one QA block in marker format (no user answer).
  - `serializeBlocksForAI(doc)` — whole document with type markers (also the `markerText` of the export-prompt route).
  - `buildAIPrompt(doc, instructions, goal?)` — `{ system, user }`: system = active instructions verbatim; user = optional `GOAL: …` line + serialized blocks + the JSON-blocks demand.
  - `serializePlainText(doc)` — quick plain-text flattening (FR-39 third option).

### `lib/validate.ts` — HTML validation & wrapping (M3, FR-10)
- **Purpose:** Pasted HTML is normalized before import: fences stripped, sanity-checked, fragments wrapped in a full document, DOCTYPE prepended. Never trusted raw. (AI conversion no longer goes through this — the convert route returns blocks, not HTML.)
- **Functions:**
  - `validateAndWrapHtml(input)` — strip fences → keep full documents (`<!doctype html>`/`<html`) as-is → otherwise wrap fragment with `<title>` from the first `<h1>` (fallback "Document").

### `lib/save.ts` — Document persistence flow (FR-17, M6)
- **Purpose:** Shared by POST/PUT document routes: always writes `document.json`; when a preview exists, also writes `document.html` + regenerates `document.pdf`. **M6:** `html?` is passed only by the import-html route; regular saves carry `instructionsVersion?` — when present, the server snapshots the ACTIVE instructions to `documents/<id>/instructions.snapshot.md` (FR-23), which is what makes "convert with this document's snapshot rules" possible later.
- **Functions:**
  - `persistDocument(storage, doc, html?, instructionsVersion?)` — saves JSON, then (if html) writes the html file + renders and writes the PDF file; when `instructionsVersion` is provided, reads the active instructions and writes the per-doc snapshot.

### `lib/ai.ts` — DeepSeek client (M3, FR-8/30/31, one-change-one-file FR-48)
- **Purpose:** THE ONLY file that talks to the AI. Plain `fetch` against `${baseUrl}/v1/chat/completions` (OpenAI-compatible), temperature 0.3, Authorization Bearer. Env-configurable base URL + model. Actionable error messages (FR-30). Token-usage console logging per conversion (FR-31).
- **Functions:**
  - `getAIConfig()` — `{ apiKey, baseUrl, model }` from `DEEPSEEK_API_KEY` / `DEEPSEEK_BASE_URL` (default `https://api.deepseek.com`) / `DEEPSEEK_MODEL` (default `deepseek-chat`).
  - `hasAIKey()` — true when `DEEPSEEK_API_KEY` is set.
  - `stripMarkdownFences(text)` — removes ```…``` code fences from AI output.
  - `convertWithAI(system, user)` — POST chat completion; throws `AIError` (message + optional HTTP status) on API errors; strips fences; logs usage (FR-31).

### `lib/zip.ts` — Zero-dependency ZIP writer (M5, backup)
- **Purpose:** Minimal ZIP archive builder (deflate method 8, node:zlib `deflateRawSync`) for the library backup — no external archive dependency.
- **Functions:**
  - `createZip(entries: { name: string; data: Buffer }[]): Buffer` — local file headers (0x04034b50, 30 bytes), central directory (0x02014b50, 46 bytes, offsets at 42), EOCD (0x06054b50, 22 bytes); per-entry CRC-32 from a table-driven `crc32` (256-entry `CRC_TABLE`).

### `lib/tags.ts` — Tag parsing (M5, FR-5/18)
- **Purpose:** Normalizes raw tag input ("French, #past-tense, french") into canonical tag strings.
- **Functions:**
  - `parseTags(raw: string): string[]` — lowercase, strip `#` prefixes, whitespace → `-`, trim, dedupe, drop empties.

### API routes (`app/api/…`)
- `api/convert/ai/route.ts` — **POST** `{ doc, goal?, useSnapshot? }` → `{ blocks, instructionsVersion }` (AI conversion, FR-8/29/30, **M6: returns editable structured blocks**). Zod-validates; missing key → 400 with actionable message (FR-30); instructions via `resolveConversionInstructions` (FR-23) as the system prompt; `buildAIPrompt` → `convertWithAI` → `parseStructuredBlocksResponse`; `blocks.length === 0` → 502 with a hint about the snapshot-rules toggle; `instructionsVersion = hashVersion(instructions)` returned so the editor records it on save (FR-23).
- `api/preview/route.ts` — **POST** `{ doc }` → `{ html }` (M6, NEW). Stateless on-demand preview: zod-validates the document, `getTokens()` → `generateTemplateHTML`. The editor posts its CURRENT doc (unsaved edits included) — no save, no artifact written. (Bug fix 2026-08-10: unwraps `payload.doc ?? body` like `/pdf` and `/convert/ai` — the editor's `{ doc }` wire shape previously hit a 400 "Invalid document payload".)
- `api/documents/route.ts` — **GET** list (optional `?owner=` filter, FR-45) → `{ documents }`; **POST** `{ doc, instructionsVersion? }` → creates + persists artifacts (201).
- `api/documents/[id]/route.ts` — **GET** → `{ doc, snapshotInfo: { version, differs } | null }` (404 if missing; `differs` = snapshot version ≠ active version — FR-23); **PUT** `{ doc, instructionsVersion? }` (id must match route; persists artifacts); **DELETE** → 204. `params` typed as `Promise<{ id }>` (Next 15+ convention).
- `api/documents/[id]/html/route.ts` — **GET** download HTML (saved file, else freshly generated from block data — regenerate, FR-20); attachment filename from doc title.
- `api/documents/[id]/pdf/route.ts` — **GET** `?variant=full|questions|my-answers` + **POST** `{ doc, variant }` (M6). Both generate the PDF instantly from block data via `generatePDFBuffer` — the POST variant renders the editor's CURRENT doc (unsaved edits included, no gating, FR-46 gate removed); `parseVariant` helper; per-variant attachment filenames (`-questions` / `-my-answers` suffixes).
- `api/documents/[id]/regenerate/route.ts` — **POST** re-convert from JSON (template render) + re-render PDF (FR-20); 404 when missing.
- `api/convert/structure/route.ts` — **POST** `{ questions: string[] }` (1..200) → `{ blocks }` (FR-32 AI mode, used by Paste questions → "Structure with AI"). Missing key → 400; instructions as system prompt + `buildStructuringUserPrompt`; `parseStructuredQaResponse`; empty result → 502.
- `api/documents/import-html/route.ts` — **POST** `{ html, title? }` → 201 `{ doc, html }` (FR-40). `titleFromHtml` (title tag or first h1), `validateAndWrapHtml`, new document with `source: "external-html"` + empty blocks, `persistDocument` (with html → writes html + pdf).
- `api/documents/backup/route.ts` — **GET** full-library backup ZIP (M5). Lists documents → entries `doc.id/` (directory), `doc.id/document.json` (pretty), plus `document.html`, `document.pdf`, `instructions.snapshot.md` when present → `createZip` → `Content-Type: application/zip` + `Content-Disposition: attachment; filename="writer-app-backup-<date>.zip"`; body via `new Uint8Array(zip)` (Buffer isn't a valid BodyInit).
- `api/export/prompt/route.ts` — **GET** `?docId=` → `{ system, user, plainText, markerText }` (FR-39 copy for external AI). 400 without docId, 404 when missing.
- `api/config/route.ts` — **GET** → `{ model, hasAIKey, instructionsVersion }` for the status bar / UI state (FR-28), never leaks the key; instructions version read via storage (seeds on first run).
- `api/instructions/route.ts` — **GET** → `getInstructionsState(storage)` (content/version/history — FR-21/22); **PUT** `{ content }` (zod min 1) → `saveInstructions`, `InstructionsError` → 400 with its message.
- `api/instructions/reset/route.ts` — **POST** → `resetInstructions(storage)` → `{ ok, version }` (FR-22).

### `next.config.ts`
- **Purpose:** `serverExternalPackages: ["@react-pdf/renderer"]` so the PDF engine works in route handlers (FR-14/15).

### `.gitignore` / `.env.local.example`
- **Purpose:** `/data` runtime storage ignored; `.env*` ignored except the committed example; env vars per requirements §12 (DEEPSEEK_*, DATA_DIR, MONGODB_URI, BLOB_READ_WRITE_TOKEN).

### `components/Editor.tsx` — Main editor (client, M6 redesign)
- **Purpose:** All document state + flows. M6: init by `docId` (route `/doc/[id]`; unknown ids start fresh with the same id so the first save creates the doc — no localStorage draft anymore); convert with AI → POST /api/convert/ai → the doc's blocks are REPLACED with the AI's editable structured blocks (practice answers + hide flags carried over by matching question text); save sends `{ doc, instructionsVersion }` (the version from the last conversion — drives snapshot bookkeeping); **autosave (M6 bug fix):** quiet debounced (~1.2s) server save on every edit — practice answers and any change land on the server without touching the toolbar's busy state (guards: `busyRef` + `savingRef`, dirty-flag cleared only when the saved snapshot is still current); on-demand preview (POST /api/preview → full-screen PreviewSheet); instant PDF (POST /api/documents/[id]/pdf with `{ doc, variant }` — three variants); Practice master key (all blocks shown — questions AND paragraphs get "My answer" boxes; Check/Hide-answers cycle + Reset practice clears qa AND paragraph answers); Cmd/Ctrl+S + Cmd/Ctrl+Enter shortcuts (FR-7); global visibility buttons (FR-35); copy-for-AI (FR-39); paste blocks/questions/HTML (M6 adds "Paste blocks (AI)") + copy-for-sharing dialog (FR-50); instructions version in the status bar (FR-28/47); snapshot-aware conversion toggle (FR-23); block operations (update/convert-type/remove/move/insert-after/append + M5 drag-reorder, Enter-split, Backspace-merge); document tags (M5); "Parse to blocks" for imported HTML (M5, FR-41).
- **Functions:** `beginBusy`/`endBusy` (busy label via state + `busyRef` so keyboard handlers never read stale state), `mutateDoc(fn)` (marks dirty), `updateBlock`/`convertBlock`/`removeBlock`/`moveBlock`/`insertAfter`/`appendBlock`/`setTitle` (useCallback ops), `reorderBlock(fromId, toId)`, `splitBlock(id, rest)`, `removeBlockFocusUp(id)`, `updateBlockTags(id, tags)`/`setDocTags(tags)`, `parseToBlocks()` (GET /api/documents/[id]/html → `parseHtmlToBlocks` → replace blocks + `source: "editor"`), `setAllQaFlags(key, value)` (FR-35), `convert(goal)` (M6: single AI path — replace blocks, carry over practice data, record `lastConvertInstructionsVersion`), `openPreview()` (M6), `copyPrompt(part)` (FR-39), `applyImportedBlocks(blocks)` (paste questions/blocks result — replace when empty, else append; closes both modals), `applyImportedHtml(doc, html)` (paste-HTML result — adopt the doc, resets snapshot info), `resetPractice()` (M6: confirm → clear every qa/paragraph `userAnswer` + uncheck), `persist()` (M6: the server round-trip — POST when `!persistedRef`, else PUT, `{ doc, instructionsVersion }`; clears the dirty flag only when the doc didn't change mid-flight), `save()` (busy-wrapped persist for the Save button / Cmd+S), autosave effect (M6: 1.2s debounce on `[doc, loading, isDirty]` → quiet `persist()` → "Saved automatically"), `downloadPdf(variant)` (M6: POST `{ doc, variant }`, no save, no gating, variant filename suffix), `downloadHtml()`, `ensureSaved()`, `downloadBlob()`/`safeFilename()`/`copyToClipboard()`/`blockHasContent()` helpers; computed `counts` (FR-37). State: `practiceMode` + `checked` (M6), `previewOpen` + `previewHtml` (M6), `lastConvertInstructionsVersion` (M6), `aiModel`, `instructionsVersion`, `snapshotInfo` + `useSnapshot`, modal flags (`showPasteQuestions`/`showPasteBlocks`/`showPasteHtml`/`showCopyDialog`); refs `docRef`/`persistedRef`/`useSnapshotRef`/`lastConvertRef`/`busyRef`/`savingRef`/`convertRef`/`saveRef`.

### `components/Toolbar.tsx` — Primary actions (client, M6 redesign, FR-29/30/35/37/38/39/46/50)
- **Purpose:** Two-row toolbar: **title row** = ✎ brand + "Writer" wordmark, borderless large title input, subtle tags input (M5, FR-5/18), quiet Instructions/Library/Home text links (M6: "New" → "Home", since "/" is now the dashboard); **actions row** = Convert with AI split button (primary converts; caret opens the goal input + snapshot-rules checkbox — M6: single AI mode, template removed), Save, Preview (M6: full-screen sheet), Practice toggle (M6 master key) + Check answers / Hide answers button (visible in practice, emerald when checked), and grouped dropdowns: Download ▾ (three PDF variants — full / questions only (share) / questions + my answers — + Download HTML, no disabled gating M6), View ▾ (Hide/Show all translations + answers FR-35; "Reset practice answers…" entry in practice mode M6), Copy ▾ (AI type markers / instructions system prompt / plain text — FR-39, Copy for sharing… — FR-50), Paste ▾ (blocks (AI) / questions / HTML — M6 adds blocks). `Dropdown` supports per-item `disabled` + `"—"` divider rows; all FR-* jargon removed from visible labels (kept in code comments).
- **Exports:** `VisibilityCounts` interface (translationsHidden/Total, answersHidden/Total — FR-37). (`ConvertMode` export REMOVED in M6.)
- **Functions:** `ActionButton` (module component), `Dropdown` (module component — fixed overlay for outside-click close), default export; convert-goal + tagsDraft state; props `practiceMode`/`checked`/`onToggleChecked`/`onResetPractice` (M6), `onPreview` (M6), `onDownloadPdf(variant: PDFVariant)` (M6), `onPasteBlocks` (M6), `snapshotInfo`/`useSnapshot`/`onToggleSnapshot` (FR-23).

### `components/BlockList.tsx` — Block list (client, M5 drag-reorder, M6)
- **Purpose:** Renders blocks in order with per-block controls and the bottom add-block affordance. Native HTML5 drag-and-drop reordering (M5, FR-3). **M6:** practice mode shows EVERY block (bug fix: paragraphs were hidden) — qa/paragraph blocks render their "My answer" cards (via `Block`), title/heading read as read-only context; the bottom `AddBlockMenu` is hidden in practice so structure can't change mid-practice.
- **Functions:** maps visible blocks → `Block` rows; `onDragStart`/`onDragOver`/`onDrop`/`onDragEnd` handlers (dragId/overId state); new props `practiceMode` + `checked` forwarded to `Block`.

### `components/Block.tsx` — Single block editor row (client, FR-1/3/25, M5, M6)
- **Purpose:** Text editing for title/heading/paragraph (auto-grow textarea), Q&A form (renders `QaBlockForm` with M6 `mode`/`checked`), separator render, `/` slash-command popup (FR-2), FR-3 keyboard editing (Enter-split, Backspace-merge). **M6:** paragraphs render `ParagraphFields` (AI enrichment: translation/analysis/vocab/expressions) under the textarea when NOT in practice mode. **M6 practice (bug fix):** paragraphs render `PracticeParagraphCard` (read-only text + "My answer" box; checked → green "Reference" box with the AI translation, or a placeholder); title/heading render as read-only text; the slash menu / textarea editing are absent in practice. Header row: type label, heading-level select, per-block tags input (M5, FR-5), ↑/↓/＋/✕ control cluster (revealed on hover/focus); title/heading textareas get document typography.
- **Exports:** `BLOCK_LABELS`, `SLASH_TYPES`; `PracticeParagraphCard` (module component, M6).
- **Functions:** `handleKeyDown`, `handleChange`, `applySlash(type)`; tags input (`tagsDraft`, commit on blur/Enter).

### `components/QaBlockForm.tsx` — Q&A card editor (client, FR-4/26/33/34/37, M6)
- **Purpose:** Two modes driven by the Practice master key. **Normal:** question + ALWAYS-visible "Answer" (modelAnswer) textarea with 👁/🙈 toggle (sets `hideModelAnswer`), optional extras behind "＋ chips" (question translation + EyeToggle, grammar note, answer label, answer translation, analysis, vocab, expressions) — M6: the reference answer is no longer an optional chip and `userAnswer` is no longer a normal-mode field; a muted note appears when a practice answer exists. **Practice (unchecked):** blue-tinted read-only question + "My answer" box (userAnswer, dashed border). **Practice (checked):** + green read-only "Model answer" box (or a "No model answer saved" placeholder). Rounded card container.
- **Functions:** `usedFields(content)` (module-level), `EyeToggle` (module component), default export form; `hideField(key)` clears + hides, `reveal(key)` shows; `RowEditor` + `inputCls`/`labelCls` MOVED to `components/RowEditor.tsx` (M6).

### `components/RowEditor.tsx` — Shared form primitives (client, M6, NEW)
- **Purpose:** Extracted from QaBlockForm so Q&A cards and paragraph enrichment share identical styling and the term/def row editor (vocabulary / expressions lists).
- **Exports:** `inputCls`, `labelCls` (shared class strings), `RowEditor({ rows, onRows, placeholderTerm, placeholderDef, termCls })` (term/def row list with add/remove).

### `components/ParagraphFields.tsx` — Paragraph enrichment editor (client, M6, NEW)
- **Purpose:** AI enrichment for paragraphs (translation input, analysis textarea, vocab/expressions RowEditor lists) — mirrors QaBlockForm's "＋ chip" pattern: empty optional fields stay hidden, a chip reveals each, removing a field clears its data. Rendered under paragraph textareas when not in practice mode.
- **Functions:** `usedFields(content)` (module-level — auto-reveal), default export; `reveal`/`hideField`/`set` helpers.

### `components/AddBlockMenu.tsx` — "+" menu (client, FR-2)
- **Purpose:** Floating + button with the full block-type menu (paragraph/heading/qa/title/separator).
- **Exports:** `ITEMS` list; default component `onAdd(type)`.

### `components/PreviewSheet.tsx` — Full-screen preview (client, M6, NEW)
- **Purpose:** "Preview" opens this full-screen sheet (fixed inset-0 z-50) instead of the old always-on pane. Header: title, Refresh (re-renders via the editor's `openPreview` — shows "Rendering…" while busy), a "no saving needed" hint, ✕ close. Body: A4-ish paper (max-w-[210mm]) in a sandboxed iframe (`sandbox=""` — no scripts, no same-origin, per suggestions.md). Placeholder when there's no HTML yet.
- **Functions:** none (stateless — props `html`, `busy`, `onRefresh`, `onClose`).

### `components/PasteQuestionsModal.tsx` — Paste-questions import (client, FR-32/38)
- **Purpose:** Single-step flow: paste a question list → live count of detected questions → "Structure with AI" (POST /api/convert/structure) or "Parse locally (offline)" (`questionsToQaBlocks`) → `onResult(blocks)`.
- **Functions:** `structureWithAI()` (async, inline errors), `parseLocally()`; `splitQuestions` memo on the pasted text.
- **Note (UI polish):** all four modals (`PasteQuestionsModal`, `PasteBlocksModal`, `PasteHtmlModal`, `CopyDialog`) share a unified chrome — `bg-zinc-900/40` backdrop with blur, rounded-2xl white panel with header bar (title + ✕ close) and a border-t footer with right-aligned Cancel/primary buttons.

### `components/PasteBlocksModal.tsx` — Paste AI blocks back (client, M6, NEW)
- **Purpose:** The JSON block array from "Copy → Copy for AI" (or any external AI) re-imports client-side via `parseStructuredBlocksResponse` (lib/structuring.ts) — completing the copy → external AI → paste round-trip (FR-42) for the new block format. Inline error when no valid blocks are found.
- **Functions:** `importBlocks()` (validates + `onResult(blocks)`).

### `components/PasteHtmlModal.tsx` — Paste HTML back (client, FR-40)
- **Purpose:** Paste HTML from any external AI → POST /api/documents/import-html → `onImported(doc, html)` (editor adopts the document; the amber "Parse to blocks" banner offers editing).
- **Functions:** `importHtml()` (async, inline errors).

### `components/CopyDialog.tsx` — Selective copy for sharing (client, FR-50)
- **Purpose:** Checkboxes choose exactly what goes to the clipboard as clean plain text (paragraphs, title/headings, questions, user answers, model answers, translations, grammar notes, analysis, vocab). Translations + model answers off by default; Q&A numbering preserved (1., 2., …); last-used selection remembered in localStorage (`writer-app:copy-selection`); live preview of the output; clipboard with textarea fallback.
- **Exports:** `CopySelection` interface, `DEFAULT_SELECTION`, `buildCopyText(doc, sel)` (pure — covered by smoke tests).
- **Functions:** `joinVocab` (private), `loadSelection` (private), `toggle(key)`, `copy()`.

### `components/NewDocumentButton.tsx` — New-document button (client, M6, NEW)
- **Purpose:** Home page + library empty state: creates a fresh document client-side (`createDocument()` + one empty paragraph block, FR-24) and navigates to `/doc/<id>`; the first save then persists it.
- **Functions:** `createNew()` (router.push to the new id). Optional `className` prop for call-site styling.

### `components/LibraryList.tsx` — Library cards (client, FR-18/19/20, M5, M6)
- **Purpose:** Document cards (title → editor `/doc/<id>` — M6, updated date, block count, tags) + Regenerate (FR-20, per-card busy state) + Delete with confirm (DELETE route + `router.refresh()`); client-side sort control (updated/created/title); M5: clickable `#tag` chips row with filter state, "⬇ Backup zip" button (filename parsed from the Content-Disposition header). M6: empty state uses `NewDocumentButton` (creates a fresh doc and navigates, instead of linking to `/`).
- **Functions:** `remove(doc)`, `regenerate(doc)`, `formatDate(iso)`, `downloadBackup()`; `allTags` memo (usage-frequency sorted); `useMemo` sorted/filtered list by `sort` key + `filterTag` state.

### `app/page.tsx` — Home dashboard (M6, NEW)
- **Purpose:** `/` — SERVER component (was the client editor route). Header (brand mark, headline, document count) + `NewDocumentButton` + `LibraryList`. `export const dynamic = "force-dynamic"` (fs read at request time — never prerendered). Metadata "Home — Writer App".

### `app/doc/[id]/page.tsx` — Editor route (M6, NEW)
- **Purpose:** `/doc/<id>` — async server page: `const { id } = await params` (Next 16: params is a Promise), renders `<Editor docId={id} />`. `force-dynamic` (the editor is fully client-side — never prerender a specific document). Metadata "Editor — Writer App".

### `app/library/page.tsx` — Legacy library route (M6)
- **Purpose:** `/library` — redirects to `/` (`redirect("/")`); the dashboard at `/` lists documents now.

### `app/instructions/page.tsx` — Instructions route (M4, FR-21/22)
- **Purpose:** `/instructions` — server page shell (`force-dynamic`), renders `InstructionsEditor`. Metadata "Instructions — Writer App".

### `components/InstructionsEditor.tsx` — Instructions editor (client, M4, FR-21/22/47)
- **Purpose:** Edit the active instructions (the ONE place the design system + AI rules live): loads GET /api/instructions, textarea with dirty tracking, Save (PUT — rejected client-side/server-side when the TOKENS block is missing, FR-47), Reset to repo copy (confirm dialog → POST /api/instructions/reset), version history list (version hash, date, char count; Preview → fills the editor as draft, Restore → PUT), status/error banners; explains the `<!-- TOKENS -->` block + FR-47.
- **Functions:** `load()` (initial GET), `save()` (PUT, dirty-gated), `reset()` (confirm + POST), `previewVersion(entry)`, `restoreVersion(entry)`; dirty state via `useState`.

### `app/layout.tsx` / `app/globals.css` / `public/`
- **Purpose:** Root layout (`LayoutProps<"/">` — Next 16.3 global helper), Tailwind v4 global styles, static assets. Metadata: "Writer App — Online Writer + Practice". `globals.css` (UI polish pass): light-only theme (dark-mode block removed), body font routed through `var(--font-sans)` so the loaded Geist font actually applies, global blue focus-visible outline + blue selection color. Document/print styles live in the instructions file, not here (FR-47).

### `tests/` — Smoke tests (M2 + M3 + M4 + M5)
- **Purpose:** In-project verification harness. `smoke-m2.ts` (22 checks: QA HTML + PDF variants — patched in M6: `{ practice: true }` → `{ variant: "questions" }`), `smoke-m3.ts` (37 checks: fences/validation, splitQuestions, structuring parser, prompt serialization + M6 "JSON blocks demand" / "user answer never serialized", buildCopyText, titleFromHtml), `smoke-m4.ts` (25 checks: hashVersion, seeding idempotence, save→history→cache-invalidate, TOKENS validation, reset, per-doc snapshot write via persistDocument — M6: version-gated, no version → no snapshot, resolveConversionInstructions active-vs-snapshot, history ordering/content), `smoke-m5.ts` (32/33 checks: parse-back round trip through the real template generator, tags parsing, ZIP structural signatures + inflate round-trip; 1 deferred check — vocab grid row term/def attribution, see suggestions.md). Compiled with `tests/tsconfig.json` (outDir `tests/build`, `rootDir ..`, `@/*` alias via `paths`), run with `node --require <abs>/tests/alias-hook.js tests/build/tests/smoke-*.js` + `NODE_PATH=<abs>/tests/build` (absolute paths required). `tests/build` and `tests/.tmp-*` are gitignored.
- **Files:** `smoke-m2.ts`, `smoke-m3.ts`, `smoke-m4.ts`, `smoke-m5.ts`, `tsconfig.json`, `alias-hook.js` (resolves `@/` to the emitted build tree at runtime).

---

## Environment Variables

| Variable | Required | Purpose | Referenced in |
|---|---|---|---|
| `DATA_DIR` | no | Storage root (default `./data`) | `lib/storage.ts` factory |
| `DEEPSEEK_API_KEY` | AI mode | DeepSeek API key; absent → 400 with actionable message (FR-30) | `lib/ai.ts` (`hasAIKey`) → routes `convert/ai`, `convert/structure`; `config` route reports presence |
| `DEEPSEEK_BASE_URL` | no | API base (default `https://api.deepseek.com`); model route is `${baseUrl}/v1/chat/completions` | `lib/ai.ts` (`getAIConfig`) |
| `DEEPSEEK_MODEL` | no | Model name (default `deepseek-chat`); shown in the editor status bar (FR-28) via `/api/config` | `lib/ai.ts` (`getAIConfig`), `api/config/route.ts` |
| `MONGODB_URI` | Vercel deploy | MongoDB storage switch (activates Mongo/Blob factory — M5, FR-44) | `lib/storage.ts` factory, `lib/storage-mongo.ts` |
| `BLOB_READ_WRITE_TOKEN` | Vercel deploy | Vercel Blob token for html/pdf file storage (M5, FR-44) | `lib/storage-mongo.ts` |

---

## Planned Changes

- **M6 done (2026-08-10):** dashboard home, AI-only editable-block conversion, practice master key, on-demand preview + 3-variant PDF, AI enrichment for all text, paste-blocks round-trip. Bug-fix pass done: preview payload, practice autosave, paragraphs in practice (editor + PDF + HTML). Type-checks clean; build green 18 routes; smoke M2–M5 green (M5 32/33).
- **Test generator (PLAN ONLY, FR-seam):** select 3–4 documents → AI builds a test from topics + questions only (paragraphs/answers NOT sent) — design recorded in suggestions.md, deliberately not built.
- Remaining: fix the one deferred M5 check (vocab grid row term/def attribution — see suggestions.md), final e2e pass against the running server, then push the two unpushed milestones (M5 + UI polish) with M6 + bug fixes once the user confirms.

## Verified

- **M1:** build green; smoke 18/18 (TOKENS parsing, PDF buffer); e2e convert/template + document CRUD + downloads.
- **M2:** smoke 22/22 (QA HTML, PDF normal + practice).
- **M3:** smoke 36/36 (fences, validation, splitQuestions, structuring, prompts, copy text, titleFromHtml).
- **M4:** smoke 24/24 (hashVersion, seeding, save→history→cache, TOKENS validation, reset, snapshots, resolveConversionInstructions); build green 17 routes.
- **M5:** full implementation + build green; Mongo/Blob typechecks; M5 smoke 32/33 after the hang fix.
- **M6:** `npx tsc --noEmit` clean (only the stale `.next/types/validator.ts` regenerated error — filtered, rebuilds on `next build`); anti-pattern greps clean (`canDownloadPdf`, `previewStale`, `ConvertMode`, `convert/template`, `PreviewPane`, `showPreview`, `?id=` links, `practice=true` — all gone from source; `USER_ANSWER` only in `lib/prompt.ts` comments as intended). Build + smoke suite + test compile pending (verification task).
- **M6 bug-fix pass (2026-08-10, user-reported):** preview 400 fixed (route unwraps `{ doc }`); practice answers autosave (quiet debounced persist); practice shows ALL blocks and paragraphs get "My answer" boxes; PDF/html render paragraph practice answers (`my-answers` variant includes paragraphs). Verified: `next build` green (18 routes); dev-server curl — `/api/preview` 200 for both `{ doc }` and bare shapes, paragraph answer in HTML; all three PDF variants 200 with correct content (text extracted via ToUnicode/cmap decode — full: para answer + translation + qa answer + model answer; questions: title + question only; my-answers: para + answers, no references); smoke M2 22/22, M3 37/37, M4 25/25, M5 32/33 (pre-existing deferred vocab-row check).
