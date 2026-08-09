# Architecture — Writer App

> **Project root:** `/Users/sukhjot/Desktop/untitled folder 2/writer-app` — Next.js (App Router, TypeScript, Tailwind v4) writer/practice app per `docs/writer_app_requirements.md` (v1.4, FR-1…FR-50) and `docs/Plan.md`.
> **Status:** Milestone M1 (Skeleton + Offline Loop) **DONE** — production build passes; template conversion, CRUD, HTML + PDF download verified end-to-end against the running server. M2 (Q&A blocks + practice controls) is next. This file is updated after every change; it is the latest and current state of the app.

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
- **Purpose:** Deterministic, self-contained styled HTML from block data + shared tokens — the offline converter (no AI). Follows `docs/html_instructions.md`: A4 `@page`, Georgia/Times, token colors, `.qa-block` cards, `break-inside: avoid` in print. Renders title/heading/paragraph/separator + minimal QA fallback card (full Q&A in M2).
- **Functions:**
  - `escapeHtml(text)` — HTML-escapes user content (XSS defense; preview iframe is also sandboxed).
  - `renderInlineMarkdown(text)` — light inline markdown: `code`, `**bold**`, `*italic*` (applied after escaping).
  - `generateTemplateHTML(doc, tokens)` — builds the full HTML document (doctype, `<style>` from tokens, `<main class="document">` with block sections).
  - `tagClass(tag)` (private) — sanitizes user tags into CSS classes (`#past-tense` → `tag-past-tense`).

### `lib/pdf.tsx` — @react-pdf/renderer PDF generation (FR-14/15, Plan §8.2)
- **Purpose:** The ONLY PDF engine. Generates A4 PDFs from block data (never from HTML) — no Chrome/Puppeteer anywhere. Styles come from the shared tokens (FR-43): Times-Roman, token colors, print margins (~14mm). `.tsx` because it contains JSX.
- **Functions:**
  - `lengthToPt(value)` — converts token lengths ("14mm", "11.5px", "0.8rem") to points for react-pdf.
  - `BlockToPDF({ block, tokens })` — maps a block to react-pdf elements (title → h1-style Text, heading → h2/h3, paragraph → Text, separator → bordered View, qa → minimal card; full Q&A in M2).
  - `generatePDFBuffer(doc, tokens, opts?)` — renders `<PDFDocument>` via `renderToBuffer`; `opts.practice` accepted now, used in M2 (FR-16/36/49).

### `lib/save.ts` — Save flow (FR-17/20, FR-46)
- **Purpose:** Shared by POST/PUT document routes: always writes `document.json`; when a preview exists, also writes `document.html` + regenerates `document.pdf` (PDF always reflects what was previewed).
- **Functions:**
  - `persistDocument(storage, doc, html?)` — saves JSON, then (if html) writes html file + renders and writes the PDF file.

### API routes (`app/api/…`)
- `api/convert/template/route.ts` — **POST** `{ doc }` → `{ html }` (template-mode conversion, FR-9). Zod-validated; reads tokens via `getTokens()`.
- `api/documents/route.ts` — **GET** list (optional `?owner=` filter, FR-45) → `{ documents }`; **POST** `{ doc, html? }` → creates + persists artifacts (201).
- `api/documents/[id]/route.ts` — **GET** → `{ doc }` (404 if missing); **PUT** `{ doc, html? }` (id must match route; persists artifacts); **DELETE** → 204. `params` typed as `Promise<{ id }>` (Next 15+ convention).
- `api/documents/[id]/html/route.ts` — **GET** download HTML (saved file, else freshly generated from block data — regenerate, FR-20); attachment filename from doc title.
- `api/documents/[id]/pdf/route.ts` — **GET** download PDF, always generated from block data via `generatePDFBuffer` (FR-15); accepts `?practice=true` (used in M2).

### `next.config.ts`
- **Purpose:** `serverExternalPackages: ["@react-pdf/renderer"]` so the PDF engine works in route handlers (FR-14/15).

### `.gitignore` / `.env.local.example`
- **Purpose:** `/data` runtime storage ignored; `.env*` ignored except the committed example; env vars per requirements §12 (DEEPSEEK_*, DATA_DIR, MONGODB_URI, BLOB_READ_WRITE_TOKEN).

### `components/Editor.tsx` — Main editor (client, two-pane)
- **Purpose:** All document state + flows: init by `?id=` (else localStorage draft, else fresh doc with one paragraph block — FR-24), debounced localStorage draft autosave (FR-6), convert → preview → save → download with FR-46 gating, Cmd/Ctrl+S + Cmd/Ctrl+Enter shortcuts (FR-7), status bar (FR-28 partial: dirty, mode, last-converted), block operations (update/convert-type/remove/move/insert-after/append).
- **Functions:** `mutateDoc(fn)` (marks dirty + invalidates preview), `updateBlock`/`convertBlock`/`removeBlock`/`moveBlock`/`insertAfter`/`appendBlock`/`setTitle` (useCallback ops), `convert()` (POST /api/convert/template), `save()` (POST create or PUT update, html only when preview exists & fresh), `downloadPdf()` (FR-46-gated, auto-saves first), `downloadHtml()`, `ensureSaved()`, `loadDraft()`/`downloadBlob()`/`safeFilename()` helpers.

### `components/BlockList.tsx` — Block list (client)
- **Purpose:** Renders blocks in order with per-block controls and the bottom add-block affordance.
- **Functions:** maps blocks → `Block` rows (passes index/total for reorder bounds), bottom `AddBlockMenu`.

### `components/Block.tsx` — Single block editor row (client, FR-1/3/25)
- **Purpose:** Text editing for title/heading/paragraph (auto-grow textarea), separator render, per-block ↑/↓/＋/✕ controls on hover, `/` slash-command popup (FR-2) to convert block type.
- **Exports:** `BLOCK_LABELS`, `SLASH_TYPES` (paragraph/heading/title/separator; QA lands in M2).
- **Functions:** `handleKeyDown` (slash menu nav: arrows/Enter/Escape), `handleChange` (content update, closes menu when "/" edited away), `applySlash(type)`.

### `components/AddBlockMenu.tsx` — "+" menu (client, FR-2)
- **Purpose:** Floating + button with block-type menu (QA listed, disabled until M2).
- **Exports:** `ITEMS` list; default component `onAdd(type)`.

### `components/Toolbar.tsx` — Primary actions (client, FR-29/30/46)
- **Purpose:** Title input, Convert (Template), Save, Download PDF (disabled until preview — FR-46, tooltip explains), Download HTML, preview toggle, Library/New links, inline error display.

### `components/PreviewPane.tsx` — Live preview (client, FR-13/27/46)
- **Purpose:** A4-ish iframe preview of generated HTML. Fully sandboxed (`sandbox=""` — no scripts, per suggestions.md). Placeholder when no preview; "Stale" badge after edits; green "Preview · time" chip when fresh.

### `components/LibraryList.tsx` — Library cards (client, FR-18/19)
- **Purpose:** Document cards (title → editor `/?id=`, updated date, block count, tags) + Delete with confirm (DELETE route + `router.refresh()`).
- **Functions:** `remove(doc)`, `formatDate(iso)`.

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
| `DEEPSEEK_API_KEY` | for AI mode (M3) | DeepSeek API key | `lib/ai.ts` (planned) |
| `DEEPSEEK_BASE_URL` | no | Default `https://api.deepseek.com` | `lib/ai.ts` (planned) |
| `DEEPSEEK_MODEL` | no | Default `deepseek-chat` | `lib/ai.ts` (planned) |
| `MONGODB_URI` | Vercel deploy | MongoDB storage switch (activates Mongo/Blob factory) | `lib/storage.ts` |
| `BLOB_READ_WRITE_TOKEN` | Vercel deploy | Vercel Blob file storage | `lib/storage-mongo.ts` (planned) |

---

## Planned Changes

- **M2:** `QaBlockForm` (FR-4), full Q&A rendering in template + PDF (badges, numbering, vocab grids, omission rules FR-36), `userAnswer` field, per-question 👁 toggles + global hide/show (FR-33–35), practice-mode PDF with blank answer boxes (FR-16/36/49), `?practice=true` wiring, library "Regenerate".
- **M3:** `lib/ai.ts` DeepSeek client + `/api/convert/ai`; `lib/prompt.ts`; paste-questions import (AI + local parser); copy-for-AI + paste-HTML-back; selective copy dialog (FR-50).
- **M4:** instructions management (seed `active.md`, edit UI, history, per-document snapshots, token cache invalidation on save).
- **M5:** polish (slash-command polish, drag-reorder, tags UI, backup zip), HTML→blocks parse-back (FR-41), Mongo/Blob storage.

## Verified (M1)

- `npm run build` passes (all routes compiled; `/` static shell, `/library` + API routes dynamic).
- Smoke tests: TOKENS parsing (18 checks incl. XSS escaping + defaults fallback), react-pdf buffer generation (`%PDF` magic).
- End-to-end against `next start`: convert/template (200 + invalid-payload 400), document create/list/get/update/delete, `document.html` + `document.pdf` written to disk on save, PDF + HTML download routes (correct attachment filenames), library page listing, missing-doc 404.
- **M3:** DeepSeek integration + question import + copy/paste for any external AI.
- **M4:** instructions management (seed `active.md`, edit UI, history, snapshots).
- **M5:** polish (slash commands, shortcuts, drag-reorder, tags, backup), HTML→blocks parse-back, Mongo/Blob storage.
