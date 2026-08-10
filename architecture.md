# Architecture — Writer App

> **Project root:** `/Users/sukhjot/Desktop/untitled folder 2/writer-app` — Next.js (App Router, TypeScript, Tailwind v4) writer/practice app per `docs/writer_app_requirements.md` (v1.4, FR-1…FR-50) and `docs/Plan.md`.
> **Status:** Milestone M3 (DeepSeek + question import + copy/paste) **DONE** — AI-mode conversion via DeepSeek with the active instructions as system prompt (FR-8/12/30/31), paste-questions import with AI structuring + offline local parser (FR-32/38), Copy for AI with marker-format serialization + system prompt + plain text (FR-39), Paste HTML back with validation/wrapping (FR-40), selective plain-text copy dialog with remembered selection (FR-50), Convert (AI) / Template (offline) dropdown + optional goal (FR-29), model name in status bar (FR-28). M1 + M2 also complete. M4 (instructions management) is next. This file is updated after every change; it is the latest and current state of the app.

**Locked decisions (never revisit):** PDF engine = `@react-pdf/renderer` only (no Puppeteer/Chrome anywhere) · design tokens parsed at runtime from the instructions file `TOKENS` block (changing colors = editing `docs/html_instructions.md` only) · storage pluggable (filesystem now, MongoDB + Vercel Blob later) · no auth in v1, `ownerId` seams kept (FR-45) · one-change-one-file (AI → `lib/ai.ts`, PDF → `lib/pdf.ts`, storage → `lib/storage.ts`, design → instructions file, FR-48) · preview before PDF is mandatory (FR-46).

---

## Runtime layout (FR-17)

```
data/                          # gitignored runtime storage
  documents/<id>/document.json # source blocks (editable truth)
  documents/<id>/document.html # generated HTML
  documents/<id>/document.pdf  # generated PDF
  instructions/active.md       # editable instructions (seeded in M4)
  instructions/history/*.md    # version history (M4)
```

## Files

### `docs/html_instructions.md` — Style instructions (single source of design, FR-47)
- **Purpose:** The authoritative print-ready HTML design system (Georgia/Times, colors, Q&A blocks, cards, vocab grids, `@page` rules). Ends with the machine-readable `<!-- TOKENS --> … <!-- /TOKENS -->` block: `colors` (mainText, heading, accentGreen, lightBg, highlightBg, border, tableStripe, tagBg, tagText, badgeBg, badgeText), `fonts` (base, mono, pdf), `sizes` (base, print, small), `spacing` (pageMargin, printMargin, cardPadding, answerPadding), `radius` (card, badge, tag). **Changing a color = editing this file only.**
- **Functions:** none (data file — parsed by `lib/tokens.ts`).

### `docs/writer_app_requirements.md` / `docs/Plan.md` / `docs/suggestions.md` / `docs/architecture.md`
- **Purpose:** Requirements spec (v1.4), implementation plan (M1–M5), improvement log, and project-level architecture doc (parent folder scope). Documentation only.

### `lib/types.ts` — Shared data model (Plan §5)
- **Purpose:** Single source of truth for `Block`, `QaContent`, `Document` shapes (FR-1/33/34/45).
- **Functions:**
  - `createBlock(type: BlockType, id?)` — factory for a fresh block of any type with a unique id and type-appropriate empty content.
  - `createDocument(title?)` — factory for a fresh unsaved document (uuid id, `ownerId: null`, `source: "editor"`).

### `lib/schemas.ts` — zod validation schemas
- **Purpose:** API payload validation (Plan §3/§10). Mirrors `lib/types.ts`; `.loose()` on content objects preserves unknown/future fields through save/load.
- **Exports:** `blockSchema` (discriminated union on `type`), `documentSchema`, `saveDocumentPayloadSchema` (`{ doc, html? }`).

### `lib/tokens.ts` — TOKENS block parser (FR-47)
- **Purpose:** Reads the instructions file and extracts the machine-readable design tokens at runtime. Never rewrites source files.
- **Constants:** `REPO_INSTRUCTIONS_PATH` (`docs/html_instructions.md`), `ACTIVE_INSTRUCTIONS_PATH` (`data/instructions/active.md`).
- **Functions:**
  - `parseTokensBlock(markdown, defaults)` — extracts `<!-- TOKENS -->`…`<!-- /TOKENS -->`, parses whitespace-lenient `section:`/`key: value` lines (strips quotes), merges over `defaults`; returns `DesignTokens | null` (null when the block is missing).
  - `readActiveInstructions()` — returns `data/instructions/active.md` when present, else the repo `docs/html_instructions.md`; throws if neither exists.

### `lib/design-tokens.ts` — Runtime design tokens (FR-43)
- **Purpose:** Cached access to the parsed tokens + fallback defaults so the app never crashes. Both renderers (`html-template.ts`, `pdf.ts`) consume the same token object → HTML preview and PDF can never drift apart.
- **Exports:** `DesignTokens` interface, `DEFAULT_TOKENS` (fallback, kept in sync with the instructions file), `getTokens(): Promise<DesignTokens>` (cached), `invalidateDesignTokensCache()` (dropped on instructions save — M4).

### `lib/storage.ts` — Pluggable storage interface + factory (FR-44/45)
- **Purpose:** The only storage gateway app code uses. v1: filesystem (`DATA_DIR`); Vercel deploy: MongoDB + Vercel Blob (M5). Owner seams on every operation (v1 ignores them).
- **Exports:** `StorageBackend` interface, `getStorage()` (factory — MongoDB when `MONGODB_URI` set, else FS), `createMongoBlobStorage()` (throws — M5).

### `lib/storage-fs.ts` — Filesystem storage implementation (FR-17)
- **Purpose:** `data/` layout per FR-17. Path-traversal guard via `SAFE_FILENAMES` allowlist.
- **Functions:**
  - `createFSStorage(dataDir)` — returns a `StorageBackend`:
    - `listDocuments(ownerId?)` — scans `data/documents/*/document.json`, skips folders without valid JSON, sorts by `updatedAt` desc.
    - `getDocument(id)` — reads one document; null when missing/corrupt.
    - `saveDocument(doc)` — mkdir + writes pretty JSON.
    - `deleteDocument(id)` — recursive rm.
    - `readFile/writeFile/deleteFile(docId, filename)` — attachment files (html/pdf/snapshot).
    - `readInstructions()` — `data/instructions/active.md` else repo copy.
    - `writeInstructions(content)` — writes `active.md`.
    - `snapshotInstructions(version)` — copies current instructions to `history/<version>.md` (sanitized).

### `lib/html-template.ts` — Template-mode HTML generator (FR-9, Plan §8.1)
- **Purpose:** Deterministic, self-contained styled HTML from block data + shared tokens — the offline converter (no AI). Follows `docs/html_instructions.md`: A4 `@page`, Georgia/Times, token colors, `.qa-block` cards, `break-inside: avoid` in print. Full Q&A rendering (M2): sequential circular badges, translation `<em>`, grammar note, response label, user-answer box (dashed left border), model answer, answer translation, analysis, vocab grid (`.two-col`/`.one-col`). Color policy: every color from tokens only (FR-47); text-shade variations = mainText + opacity. Omission rules FR-36: hidden elements omitted entirely.
- **Functions:**
  - `escapeHtml(text)` — HTML-escapes user content (XSS defense; preview iframe is also sandboxed).
  - `renderInlineMarkdown(text)` — light inline markdown: `code`, `**bold**`, `*italic*` (applied after escaping).
  - `generateTemplateHTML(doc, tokens)` — builds the full HTML document (doctype, `<style>` from tokens, `<main class="document">` with block sections; Q&A numbering is sequential across the doc).
  - `tagClass(tag)` (private) — sanitizes user tags into CSS classes (`#past-tense` → `tag-past-tense`).
  - `qaVisible(doc, content, kind)` (private) — visibility check: hidden when the per-block flag OR the document `practice` default is set (FR-34/35).
  - `vocabGridHtml(vocab, expressions)` (private) — builds the vocab/expressions grid; `.two-col` when both lists exist, `.one-col` otherwise; headers + striped column bodies from tokens.
  - `qaBlockHtml(doc, block, tokens, number)` (private) — assembles a full `.qa-block` card with all optional parts; omitted parts never emitted.

### `lib/pdf.tsx` — @react-pdf/renderer PDF generation (FR-14/15, Plan §8.2)
- **Purpose:** The ONLY PDF engine. Generates A4 PDFs from block data (never from HTML) — no Chrome/Puppeteer anywhere. Styles come from the shared tokens (FR-43): Times-Roman, token colors, print margins (~14mm). `.tsx` because it contains JSX. Full Q&A rendering (M2): circular badge (View + centered Text — no SVG), question + italic translation, grammar note, response label, user-answer box, model answer, translation, analysis, vocab grid, `minPresenceAhead` keep-together hint. Note: react-pdf v4.6 has no `breakInside: "avoid"` — closest available is `minPresenceAhead` (documented limitation, see suggestions.md).
- **Functions:**
  - `lengthToPt(value)` — converts token lengths ("14mm", "11.5px", "0.8rem") to points for react-pdf.
  - `BlockToPDF({ block, doc, tokens, qaNumber, practice })` — maps a block to react-pdf elements; QA numbering sequential across the doc.
  - `QABlockPDF(...)` (private) — full Q&A card; mirrors `qaBlockHtml`'s omission rules (FR-36).
  - `BlankAnswerArea({ basePt, color })` (private) — practice-mode empty ruled dashed area ≈4 lines (FR-49); never contains answer/translation content.
  - `qaVisible(doc, content, kind)` (private) — same visibility logic as the HTML template (FR-34/35).
  - `generatePDFBuffer(doc, tokens, opts?)` — renders `<PDFDocument>` via `renderToBuffer`; `opts.practice` → translations + model answers always omitted (FR-36), user answers retained, blank areas for unanswered questions (FR-49).

### `lib/save.ts` — Save flow (FR-17/20, FR-46)
- **Purpose:** Shared by POST/PUT document routes: always writes `document.json`; when a preview exists, also writes `document.html` + regenerates `document.pdf` (PDF always reflects what was previewed).
- **Functions:**
  - `persistDocument(storage, doc, html?)` — saves JSON, then (if html) writes html file + renders and writes the PDF file.

### `lib/ai.ts` — DeepSeek client (M3, FR-8/30/31, one-change-one-file FR-48)
- **Purpose:** THE ONLY file that talks to the AI. Plain `fetch` against `${baseUrl}/v1/chat/completions` (OpenAI-compatible), temperature 0.3, Authorization Bearer. Env-configurable base URL + model. Actionable error messages (FR-30). Token-usage console logging per conversion (FR-31).
- **Functions:**
  - `getAIConfig()` — `{ apiKey, baseUrl, model }` from `DEEPSEEK_API_KEY` / `DEEPSEEK_BASE_URL` (default `https://api.deepseek.com`) / `DEEPSEEK_MODEL` (default `deepseek-chat`).
  - `hasAIKey()` — true when `DEEPSEEK_API_KEY` is set.
  - `stripMarkdownFences(text)` — removes ```…``` code fences from AI output.
  - `convertWithAI(system, user)` — POST chat completion; throws `AIError` (message + optional HTTP status) on API errors; strips fences; logs usage (FR-31).

### `lib/prompt.ts` — Prompt assembly + block serialization (M3, FR-12/39, Plan §9.1)
- **Purpose:** The user section serializes every block with type markers (`<TITLE>`, `<HEADING LEVEL="2|3">`, `<PARAGRAPH FORMAT="markdown">`, `<SEPARATOR/>`, `<QA>` with `QUESTION:`/`QUESTION_TRANSLATION:`/`GRAMMAR_NOTE:`/`RESPONSE_LABEL:`/`USER_ANSWER:`/`MODEL_ANSWER:`/`ANSWER_TRANSLATION:`/`ANALYSIS:`/`VOCAB: term|def; …`/`EXPRESSIONS: …`/`HIDE_TRANSLATION:`/`HIDE_MODEL_ANSWER:`). This exact format is what "Copy for AI" exposes (FR-39), making the copy→AI→paste round-trip reliable (FR-42).
- **Functions:**
  - `serializeQa(c)` (private) — one QA block in marker format.
  - `serializeBlocksForAI(doc)` — whole document with type markers (also the `markerText` of the export-prompt route).
  - `buildAIPrompt(doc, instructions, goal?)` — `{ system, user }`: system = active instructions verbatim; user = optional `GOAL: …` line + serialized blocks + "Return a complete, valid, self-contained HTML document only. No markdown fences, no explanations."
  - `serializePlainText(doc)` — quick plain-text flattening (FR-39 third option).

### `lib/validate.ts` — HTML validation & wrapping (M3, FR-10)
- **Purpose:** Conversion output (AI or pasted HTML) is normalized before preview/save: fences stripped, sanity-checked, fragments wrapped in a full document, DOCTYPE prepended. Never trusted raw.
- **Functions:**
  - `validateAndWrapHtml(input)` — strip fences → keep full documents (`<!doctype html>`/`<html`) as-is → otherwise wrap fragment with `<title>` from the first `<h1>` (fallback "Document").

### `lib/questions.ts` — Question-list parsing + AI structuring (M3, FR-32/38)
- **Purpose:** Local numbered/bulleted-list parser for offline mode, plus the AI-structuring prompt + tolerant JSON response parser.
- **Functions:**
  - `splitQuestions(text)` — splits a pasted list: numbered (`1.`/`1)`), bulleted (`-`/`*`), blank-line separated; continuation lines merge into the current item; a numbered/bulleted line always starts a new item.
  - `questionsToQaBlocks(questions)` — question-only Q&A blocks with `responseLabel: "RÉPONSE"` (FR-32 template mode).
  - `buildStructuringUserPrompt(questions)` — numbered list + exact JSON-array schema instruction for the AI.
  - `parseStructuredQaResponse(raw)` — tolerant: fences stripped, first `[`…last `]`, zod `.loose()` per entry → `QaContent[]`; empty array on garbage.

### API routes (`app/api/…`)
- `api/convert/template/route.ts` — **POST** `{ doc }` → `{ html }` (template-mode conversion, FR-9). Zod-validated; reads tokens via `getTokens()`.
- `api/documents/route.ts` — **GET** list (optional `?owner=` filter, FR-45) → `{ documents }`; **POST** `{ doc, html? }` → creates + persists artifacts (201).
- `api/documents/[id]/route.ts` — **GET** → `{ doc }` (404 if missing); **PUT** `{ doc, html? }` (id must match route; persists artifacts); **DELETE** → 204. `params` typed as `Promise<{ id }>` (Next 15+ convention).
- `api/documents/[id]/html/route.ts` — **GET** download HTML (saved file, else freshly generated from block data — regenerate, FR-20); attachment filename from doc title.
- `api/documents/[id]/pdf/route.ts` — **GET** download PDF, always generated from block data via `generatePDFBuffer` (FR-15); `?practice=true` → practice-mode PDF (FR-16/36/49).
- `api/documents/[id]/regenerate/route.ts` — **POST** re-convert from JSON (template mode) + re-render PDF (FR-20); 404 when missing.
- `api/convert/ai/route.ts` — **POST** `{ doc, goal? }` → `{ html }` (AI-mode conversion, FR-8/29/30). Zod-validates; missing key → 400 with actionable message; instructions from storage as system prompt; `validateAndWrapHtml` on output (FR-10); `AIError` → its status, else 502.
- `api/convert/structure/route.ts` — **POST** `{ questions: string[] }` (1..200) → `{ blocks }` (FR-32 AI mode). Missing key → 400; instructions as system prompt + `buildStructuringUserPrompt`; `parseStructuredQaResponse`; empty result → 502.
- `api/documents/import-html/route.ts` — **POST** `{ html, title? }` → 201 `{ doc, html }` (FR-40). `titleFromHtml` (title tag or first h1), `validateAndWrapHtml`, new document with `source: "external-html"` + empty blocks, `persistDocument`.
- `api/export/prompt/route.ts` — **GET** `?docId=` → `{ system, user, plainText, markerText }` (FR-39 copy for external AI). 400 without docId, 404 when missing.
- `api/config/route.ts` — **GET** → `{ model, hasAIKey }` for the status bar / UI state (FR-28), never leaks the key.

### `next.config.ts`
- **Purpose:** `serverExternalPackages: ["@react-pdf/renderer"]` so the PDF engine works in route handlers (FR-14/15).

### `.gitignore` / `.env.local.example`
- **Purpose:** `/data` runtime storage ignored; `.env*` ignored except the committed example; env vars per requirements §12 (DEEPSEEK_*, DATA_DIR, MONGODB_URI, BLOB_READ_WRITE_TOKEN).

### `components/Editor.tsx` — Main editor (client, two-pane)
- **Purpose:** All document state + flows: init by `?id=` (else localStorage draft, else fresh doc with one paragraph block — FR-24), debounced localStorage draft autosave (FR-6), convert (AI or template, FR-29) → preview → save → download with FR-46 gating, Cmd/Ctrl+S + Cmd/Ctrl+Enter shortcuts (FR-7), practice-mode state for PDF download (`?practice=true`), global visibility buttons (FR-35), copy-for-AI (FR-39), paste questions (FR-38) + paste HTML (FR-40) + copy-for-sharing dialogs (FR-50), status bar (FR-28: dirty, mode incl. model name from /api/config, last-converted, hidden counts FR-37, practice indicator), block operations (update/convert-type/remove/move/insert-after/append).
- **Functions:** `mutateDoc(fn)` (marks dirty + invalidates preview), `updateBlock`/`convertBlock`/`removeBlock`/`moveBlock`/`insertAfter`/`appendBlock`/`setTitle` (useCallback ops), `setAllQaFlags(key, value)` (writes per-question flags + document `practice` defaults — FR-35), `convert(mode, goal)` (POST /api/convert/ai or /api/convert/template — FR-8/9/29), `copyPrompt(part)` (ensureSaved → GET /api/export/prompt → clipboard — FR-39), `applyImportedBlocks(blocks)` (paste-questions result: replace when the doc is empty, else append — FR-38), `applyImportedHtml(doc, html)` (paste-HTML result: adopt the new document, preview immediately — FR-40), `save()` (POST create or PUT update, html only when preview exists & fresh), `downloadPdf()` (FR-46-gated, auto-saves first, practice flag appended), `downloadHtml()`, `ensureSaved()`, `loadDraft()`/`downloadBlob()`/`safeFilename()`/`copyToClipboard()`/`blockHasContent()` helpers; computed `counts` (FR-37).

### `components/BlockList.tsx` — Block list (client)
- **Purpose:** Renders blocks in order with per-block controls and the bottom add-block affordance.
- **Functions:** maps blocks → `Block` rows (passes index/total for reorder bounds), bottom `AddBlockMenu`.

### `components/Block.tsx` — Single block editor row (client, FR-1/3/25)
- **Purpose:** Text editing for title/heading/paragraph (auto-grow textarea), Q&A form (renders `QaBlockForm`), separator render, per-block ↑/↓/＋/✕ controls on hover, `/` slash-command popup (FR-2) to convert block type.
- **Exports:** `BLOCK_LABELS`, `SLASH_TYPES` (paragraph/heading/**qa**/title/separator — FR-2 `/para` `/h2` `/qa` `/title`).
- **Functions:** `handleKeyDown` (slash menu nav: arrows/Enter/Escape), `handleChange` (content update, closes menu when "/" edited away), `applySlash(type)`.

### `components/QaBlockForm.tsx` — Q&A block form (client, FR-4/26/33/34/37)
- **Purpose:** Guided Q&A editing: required `question` + optional fields revealed only once used (chips "Add: …" — FR-4/26); `userAnswer` is the primary practice field (FR-33); 👁/🙈 toggles on translation + model answer set `hideTranslation`/`hideModelAnswer` (FR-34) with a visible "hidden/shown in output" chip (FR-37); vocab/expressions row editors.
- **Functions:** `usedFields(content)` (module-level — which optionals have content), `EyeToggle` (module component), `RowEditor` (module component — term/def row list), default export form; `hideField(key)` clears + hides, `reveal(key)` shows.

### `components/AddBlockMenu.tsx` — "+" menu (client, FR-2)
- **Purpose:** Floating + button with the full block-type menu (paragraph/heading/qa/title/separator).
- **Exports:** `ITEMS` list; default component `onAdd(type)`.

### `components/Toolbar.tsx` — Primary actions (client, FR-29/30/35/37/38/39/46/50)
- **Purpose:** Title input, Convert split button — primary converts in the current mode, caret opens the mode menu ("Convert (AI) — DeepSeek" / "Convert (Template, offline)") with an optional goal input (FR-29), Save, Practice PDF checkbox (FR-16), Download PDF (disabled until preview — FR-46), Download HTML, Hide/Show all translations + answers (FR-35), Copy ▾ dropdown (Copy for AI type markers / Copy instructions system prompt / Copy plain text — FR-39, Copy for sharing… dialog — FR-50), Paste ▾ dropdown (Paste questions… FR-38 / Paste HTML… FR-40), preview toggle, Library/New links, inline error display.
- **Exports:** `ConvertMode` type (`"ai" | "template"`), `VisibilityCounts` interface (translationsHidden/Total, answersHidden/Total — FR-37).
- **Functions:** `ActionButton` (module component), `Dropdown` (module component — fixed overlay for outside-click close), default export; convert-mode + goal state.

### `components/PasteQuestionsModal.tsx` — Paste-questions import (client, FR-32/38)
- **Purpose:** Single-step flow: paste a question list → live count of detected questions → "Structure with AI" (POST /api/convert/structure) or "Parse locally (offline)" (`questionsToQaBlocks`) → `onResult(blocks)`.
- **Functions:** `structureWithAI()` (async, inline errors), `parseLocally()`; `splitQuestions` memo on the pasted text.

### `components/PasteHtmlModal.tsx` — Paste HTML back (client, FR-40)
- **Purpose:** Paste HTML from any external AI → POST /api/documents/import-html → `onImported(doc, html)` (editor adopts the document and previews immediately).
- **Functions:** `importHtml()` (async, inline errors).

### `components/CopyDialog.tsx` — Selective copy for sharing (client, FR-50)
- **Purpose:** Checkboxes choose exactly what goes to the clipboard as clean plain text (paragraphs, title/headings, questions, user answers, model answers, translations, grammar notes, analysis, vocab). Translations + model answers off by default; Q&A numbering preserved (1., 2., …); last-used selection remembered in localStorage (`writer-app:copy-selection`); live preview of the output; clipboard with textarea fallback.
- **Exports:** `CopySelection` interface, `DEFAULT_SELECTION`, `buildCopyText(doc, sel)` (pure — covered by smoke tests).
- **Functions:** `joinVocab` (private), `loadSelection` (private), `toggle(key)`, `copy()`.

### `tests/` — Smoke tests (M2 + M3)
- **Purpose:** In-project verification harness. `smoke-m2.ts` (22 checks: QA HTML + practice PDF) and `smoke-m3.ts` (36 checks: fences/validation, splitQuestions, structuring parser, prompt serialization, buildCopyText, titleFromHtml). Compiled with `tests/tsconfig.json` (outDir `tests/build`, `rootDir ..`, `@/*` alias via `paths`), run with `node --require tests/alias-hook.js tests/build/tests/smoke-*.js` + `NODE_PATH`. `tests/build` is gitignored.
- **Files:** `smoke-m2.ts`, `smoke-m3.ts`, `tsconfig.json`, `alias-hook.js` (resolves `@/` to the emitted build tree at runtime).

### `components/PreviewPane.tsx` — Live preview (client, FR-13/27/46)
- **Purpose:** A4-ish iframe preview of generated HTML. Fully sandboxed (`sandbox=""` — no scripts, per suggestions.md). Placeholder when no preview; "Stale" badge after edits; green "Preview · time" chip when fresh.

### `components/LibraryList.tsx` — Library cards (client, FR-18/19/20)
- **Purpose:** Document cards (title → editor `/?id=`, updated date, block count, tags) + Regenerate (FR-20: POST regenerate route, per-card busy state) + Delete with confirm (DELETE route + `router.refresh()`); client-side sort control (updated/created/title).
- **Functions:** `remove(doc)`, `regenerate(doc)`, `formatDate(iso)`; `useMemo` sorted list by `sort` key.

### `app/page.tsx` — Editor route
- **Purpose:** `/` — client page; reads `?id=` via `useSearchParams` inside `<Suspense>` (Next 16 requirement), renders `Editor`.

### `app/library/page.tsx` — Library route
- **Purpose:** `/library` — server component listing documents via `getStorage()`; `export const dynamic = "force-dynamic"` (fs read at request time — never prerendered). Metadata "Library — Writer App".

### `app/layout.tsx` / `app/globals.css` / `public/`
- **Purpose:** Root layout (`LayoutProps<"/">` — Next 16.3 global helper), Tailwind v4 global styles, static assets. Metadata: "Writer App — Online Writer + Practice".

---

## Environment Variables

| Variable | Required | Purpose | Referenced in |
|---|---|---|---|
| `DATA_DIR` | no | Storage root (default `./data`) | `lib/storage.ts` factory |
| `DEEPSEEK_API_KEY` | AI mode | DeepSeek API key; absent → 400 with actionable message (FR-30) | `lib/ai.ts` (`hasAIKey`) → routes `convert/ai`, `convert/structure`; `config` route reports presence |
| `DEEPSEEK_BASE_URL` | no | API base (default `https://api.deepseek.com`); model route is `${baseUrl}/v1/chat/completions` | `lib/ai.ts` (`getAIConfig`) |
| `DEEPSEEK_MODEL` | no | Model name (default `deepseek-chat`); shown in the editor status bar (FR-28) via `/api/config` | `lib/ai.ts` (`getAIConfig`), `api/config/route.ts` |
| `MONGODB_URI` | Vercel deploy | MongoDB storage switch (activates Mongo/Blob factory) | `lib/storage.ts` |
| `BLOB_READ_WRITE_TOKEN` | Vercel deploy | Vercel Blob file storage | `lib/storage-mongo.ts` (planned, M5) |

---

## Planned Changes

- **M4 (next):** instructions management (seed `active.md`, edit UI, history, per-document snapshots, token cache invalidation on save — FR-21–23/47).
- **M5:** polish (slash-command polish, drag-reorder, tags UI, backup zip), HTML→blocks parse-back (FR-41), Mongo/Blob storage.

## Verified (M1)

- `npm run build` passes (all routes compiled; `/` static shell, `/library` + API routes dynamic).
- Smoke tests: TOKENS parsing (18 checks incl. XSS escaping + defaults fallback), react-pdf buffer generation (`%PDF` magic).
- End-to-end against `next start`: convert/template (200 + invalid-payload 400), document create/list/get/update/delete, `document.html` + `document.pdf` written to disk on save, PDF + HTML download routes (correct attachment filenames), library page listing, missing-doc 404.
- M2 smoke (22/22): QA HTML — sequential numbering, translation/grammar/response label, dashed user-answer box, model answer, answer translation, analysis, two-col vocab grid (vocab+expr), wrapper + tag classes, hidden elements omitted (FR-36), XSS escaping; PDF normal + practice mode — `%PDF` magic, blank-area path renders, practice PDF omits model answers.
- **M3 smoke (36/36):** fence stripping; validateAndWrapHtml (full-doc pass-through, fragment wrap with h1 title, fenced fragment); splitQuestions (numbered `.`/`)`, bullets, continuation merge, blank-line separated); questionsToQaBlocks; buildStructuringUserPrompt; parseStructuredQaResponse (fences+prose tolerance, vocab/expressions mapping, garbage → empty); buildAIPrompt (system verbatim, GOAL line, markers, HIDE flags, HTML-only instruction); serializeBlocksForAI; serializePlainText; buildCopyText (numbering, defaults exclude translations/model answers, RÉPONSE label, analysis/vocab/expressions, all-on, numbering survives partial selection); titleFromHtml (title tag, h1 fallback, null).
- **M4:** instructions management (seed `active.md`, edit UI, history, snapshots).
- **M5:** polish (slash commands, shortcuts, drag-reorder, tags, backup), HTML→blocks parse-back, Mongo/Blob storage.
