# Architecture — Writer App

> **Project root:** `/Users/sukhjot/Desktop/untitled folder 2/writer-app` — Next.js (App Router, TypeScript, Tailwind v4) writer/practice app per `docs/writer_app_requirements.md` (v1.4, FR-1…FR-50) and `docs/Plan.md`.
> **Status:** Milestone M1 (Skeleton + Offline Loop) **in progress** — data layer + rendering + API routes done (smoke-tested); editor UI + library page following. This file is updated after every change; it is the latest and current state of the app.

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

### Scaffold (to be replaced in M1)
- `app/page.tsx`, `app/layout.tsx` (`LayoutProps<"/">` — Next 16.3 global helper), `app/globals.css` (Tailwind v4), `public/` assets — stock create-next-app files.

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

- **M1 (current):** document CRUD + convert/template + PDF routes; `lib/html-template.ts`, `lib/pdf.ts`; editor UI (blocks, autosave draft, FR-46 gating); save flow; library page.
- **M2:** Q&A blocks + practice controls + practice-mode PDF with blank answer boxes (FR-49).
- **M3:** DeepSeek integration + question import + copy/paste for any external AI.
- **M4:** instructions management (seed `active.md`, edit UI, history, snapshots).
- **M5:** polish (slash commands, shortcuts, drag-reorder, tags, backup), HTML→blocks parse-back, Mongo/Blob storage.
