# Implementation Plan — Online Writer + Practice App

> **Source of truth:** `writer_app_requirements.md` (v1.4, FR-1…FR-50) · **Date:** 2026-08-09
> **Stack decision:** Next.js (App Router, TypeScript) + `@react-pdf/renderer` — no Puppeteer/Chrome anywhere; runs on Node, Edge, or client-side.
> **Alignment:** an FR → section matrix is at the end (§19) so coverage can be verified.

---

## 1. Overview

A Next.js (App Router, TypeScript) web app for composing language-learning documents from **paragraph blocks**, **headings**, and **structured Q&A blocks**. Content is stored as block data (`document.json`), rendered to **styled HTML** (template mode or DeepSeek AI mode) for preview, and to **A4 PDF** via `@react-pdf/renderer`. Both HTML and PDF are derived from the same block data — nothing is ever extracted from a PDF.

The app also supports: pasting a raw question list → structured practice sheet; per-question and global visibility controls for English translations and model answers; practice-mode PDFs with blank answer boxes; copy-for-AI (any external AI) and paste-HTML-back; selective plain-text copy for sharing; editable design system living in the instructions file.

## 2. Locked Decisions

| Decision | Choice |
|---|---|
| Framework | Next.js (App Router) + TypeScript |
| PDF engine | `@react-pdf/renderer` — no Chrome/Puppeteer; Node, Edge, or client-side |
| AI | DeepSeek API via plain `fetch` (env-configurable) |
| Design system source | The instructions file — prose + machine-readable `TOKENS` block |
| Storage | Pluggable interface: filesystem (local) now, MongoDB + Vercel Blob at Vercel deploy |
| Auth | **None in v1** — anonymous single user; `ownerId` seams keep it auth-ready (FR-45) |
| Preview before PDF | "Download PDF" is disabled until a preview exists; edits mark it stale (FR-46) |
| One change, one file | AI → `lib/ai.ts`; PDF → `lib/pdf.ts`; storage → `lib/storage.ts`; design → instructions file (FR-48) |
| Edge | Allowed anywhere (no browser engine); token parsing needs Node (filesystem) — Node runtime for storage-touching routes |

## 3. Tech Stack & Dependencies

| Concern | Choice |
|---|---|
| Framework | Next.js (App Router) + TypeScript |
| PDF rendering | `@react-pdf/renderer` (server `renderToBuffer`; client `usePDF` fallback) |
| AI integration | DeepSeek API (`/v1/chat/completions`, plain fetch) |
| App UI styling | Tailwind CSS (for the app UI only — generated documents use their own styles) |
| ID generation | `uuid` v4 |
| State management | React hooks + context (no external store) |
| Validation | `zod` (API payloads) |
| Storage (dev) | Node `fs/promises` |
| Storage (prod, later) | `mongodb` driver + `@vercel/blob` |
| Env vars | Next.js built-in `.env` support |
| Dev deps | `typescript`, `@types/node`, `@types/uuid`, `tailwindcss`, `postcss`, `autoprefixer`, `eslint` |

## 4. Project Structure

```
writer-app/
├── next.config.js
├── tsconfig.json
├── tailwind.config.js
├── package.json
├── .env.local.example
├── .gitignore
├── data/                          # runtime storage (gitignored)
│   ├── documents/<id>/            # one folder per document
│   │   ├── document.json          # the full Document object (editable truth)
│   │   ├── document.html          # latest generated HTML
│   │   ├── document.pdf           # latest generated PDF
│   │   └── instructions.snapshot.md  # instructions version at last conversion
│   └── instructions/
│       ├── active.md              # editable copy of html_instructions.md
│       └── history/<timestamp>.md # version history
├── lib/
│   ├── types.ts                   # shared TypeScript types (Block, Document, …)
│   ├── storage.ts                 # storage interface + factory (FR-44)
│   ├── storage-fs.ts              # filesystem implementation
│   ├── storage-mongo.ts           # MongoDB + Blob implementation (future, Vercel)
│   ├── tokens.ts                  # parses instructions TOKENS block → token object (FR-47)
│   ├── design-tokens.ts           # runtime-derived tokens + fallback defaults (FR-43/47)
│   ├── html-template.ts           # template-mode HTML generator
│   ├── pdf.ts                     # @react-pdf components → PDF buffer (FR-14/15)
│   ├── ai.ts                      # DeepSeek client (FR-48)
│   ├── prompt.ts                  # block serialization + prompt assembly (FR-12)
│   ├── html-to-blocks.ts          # best-effort HTML → blocks parse-back (FR-41)
│   └── validate.ts                # HTML validation & wrapping (FR-10)
├── components/
│   ├── Editor.tsx                 # main two-pane editor layout
│   ├── BlockList.tsx              # renders list of blocks
│   ├── Block.tsx                  # single block wrapper
│   ├── QaBlockForm.tsx            # Q&A block form + 👁 visibility toggles (FR-33/34)
│   ├── AddBlockMenu.tsx           # + button and slash-command menu (FR-2)
│   ├── Toolbar.tsx                # Convert / Save / Download / Copy / Hide-all
│   ├── PreviewPane.tsx            # sandboxed iframe preview (FR-13)
│   ├── LibraryList.tsx            # document library page
│   ├── InstructionsEditor.tsx     # edit active instructions
│   ├── CopyDialog.tsx             # selective copy for sharing (FR-50)
│   └── PasteQuestionsModal.tsx    # import question list flow (FR-32/38)
├── app/
│   ├── layout.tsx
│   ├── page.tsx                   # editor route (/)
│   ├── library/page.tsx           # document library
│   └── api/
│       ├── convert/
│       │   ├── ai/route.ts        # POST: AI conversion
│       │   └── template/route.ts  # POST: template conversion
│       ├── documents/
│       │   ├── route.ts           # GET (list), POST (create)
│       │   ├── [id]/route.ts      # GET, PUT, DELETE
│       │   ├── [id]/pdf/route.ts  # GET PDF (?practice=true)
│       │   ├── [id]/html/route.ts # GET HTML
│       │   └── import-html/route.ts  # POST external HTML → new document (FR-40)
│       ├── instructions/route.ts  # GET, PUT active instructions (PUT → token invalidation)
│       └── export/prompt/route.ts # GET copy-ready prompt (FR-39)
└── public/                        # static assets (if any)
```

## 5. Data Model (`lib/types.ts`)

```ts
export type Block =
  | { id: string; type: "title";     tags: string[]; content: { text: string } }
  | { id: string; type: "heading";   tags: string[]; content: { text: string; level?: 2 | 3 } }
  | { id: string; type: "paragraph"; tags: string[]; content: { text: string; format?: "plain" | "markdown" } }
  | { id: string; type: "qa";        tags: string[]; content: QaContent }
  | { id: string; type: "separator"; tags: string[]; content: {} };

export interface QaContent {
  question: string;
  questionTranslation?: string;   // <em> under question (hideable)
  grammarNote?: string;
  responseLabel?: string;         // default "RÉPONSE"
  userAnswer?: string;            // practice answer written by the user (FR-33)
  modelAnswer?: string;           // reference answer (AI import or typed)
  answerTranslation?: string;
  analysis?: string;
  vocab?: { term: string; def: string }[];
  expressions?: { term: string; def: string }[];
  hideTranslation?: boolean;      // per-question visibility (FR-34)
  hideModelAnswer?: boolean;
}

export interface Document {
  id: string;
  title: string;
  ownerId?: string | null;        // null in v1 — reserved for future auth (FR-45)
  source: "editor" | "external-html";
  createdAt: string;
  updatedAt: string;
  tags: string[];
  blocks: Block[];
  practice?: {
    hideTranslations: boolean;    // document-level defaults (FR-35)
    hideModelAnswers: boolean;
  };
}
```

## 6. Storage Interface (pluggable, FR-44)

```ts
export interface StorageBackend {
  // Documents
  listDocuments(ownerId?: string | null): Promise<Document[]>;
  getDocument(id: string): Promise<Document | null>;
  saveDocument(doc: Document): Promise<void>;
  deleteDocument(id: string): Promise<void>;

  // File attachments (html/pdf/snapshots per document folder)
  readFile(docId: string, filename: string): Promise<Buffer | null>;
  writeFile(docId: string, filename: string, data: Buffer): Promise<void>;
  deleteFile(docId: string, filename: string): Promise<void>;

  // Instructions
  readInstructions(): Promise<string>;
  writeInstructions(content: string): Promise<void>;
  snapshotInstructions(version: string): Promise<void>; // → history/<version>.md
}

// Factory based on environment
export function getStorage(): StorageBackend {
  if (process.env.MONGODB_URI) return createMongoBlobStorage();
  return createFSStorage(process.env.DATA_DIR || "./data");
}
```

**FS implementation (`storage-fs.ts`):** `listDocuments` reads `data/documents/*/document.json`; `saveDocument` writes the JSON and any attachments; `deleteDocument` removes the folder recursively.

**MongoDB + Blob implementation (`storage-mongo.ts`, future/Vercel):** document metadata + blocks in a MongoDB collection; HTML/PDF/snapshot files in Vercel Blob keyed by `docId/filename`; maintains an owner index (FR-45). Pattern copied from Sukhjot's ResumeBuilder.

## 7. Design Tokens (single source = instructions file, FR-47)

The active instructions file (`data/instructions/active.md`, seeded from `html_instructions.md`) ends with a machine-readable `TOKENS` block:

```
<!-- TOKENS -->
colors:
  mainText: "#1a1a1a"
  heading: "#1e3a5f"
  accentGreen: "#2c5f2d"
  lightBg: "#f7f9fb"
  highlightBg: "#fdfcf9"
  border: "#d0d5dc"
  tableStripe: "#f0f3f6"
  tagBg: "#e8f0e9"
  tagText: "#2c5f2d"
  badgeBg: "#1e3a5f"
  badgeText: "#ffffff"
fonts:
  base: "Georgia, Times New Roman, serif"
  mono: "Courier New, monospace"
  pdf: "Times-Roman"
sizes:
  base: "11.5px"
  print: "10.5px"
  small: "0.8rem"
spacing:
  pageMargin: "18mm"
  printMargin: "14mm"
  cardPadding: "14px 16px"
  answerPadding: "8px 12px"
radius:
  card: "6px"
  badge: "50%"
  tag: "3px"
<!-- /TOKENS -->
```

**Implementation (works on Vercel's read-only filesystem):**
- `lib/tokens.ts` parses the `TOKENS` block **at runtime** and returns a typed token object; `lib/design-tokens.ts` exports `getTokens()` (cached, invalidated whenever the instructions are saved via the API). It never rewrites source files.
- Fallback: if the `TOKENS` block is missing, `design-tokens.ts` falls back to the current documented values (kept in sync manually) so the app never crashes.
- Both the HTML template renderer and the react-pdf components import the same token object → visual parity (FR-43).
- Changing a color = editing the instructions file → save → new conversions (HTML + PDF) reflect it. Old documents keep their `instructions.snapshot.md` (FR-21–23).

## 8. Rendering

### 8.1 Template-mode HTML (`lib/html-template.ts`)

`generateTemplateHTML(doc: Document): string` — builds a complete, self-contained HTML document following `html_instructions.md`, with an inline `<style>` generated from tokens (`@page { size: A4; margin: 14mm }`, `.qa-block`/`.card` `break-inside: avoid`).

| Block | HTML |
|---|---|
| `title` | `<h1>` (bold, heading color) |
| `heading` | `<h2>`/`<h3>` |
| `paragraph` | `<p>` (light markdown: bold/italic/lists/inline code if `format: "markdown"`) |
| `qa` | `<div class="qa-block">` — auto-numbered `.qa-num` circular badge, `.qa-question-text` (+ `<em>` translation, omitted if `hideTranslation`), `.qa-grammar-note`, `.qa-response-label`, `.qa-user-answer` (dashed border, only when `userAnswer` filled), `.qa-answer` model answer (omitted if `hideModelAnswer`), `.qa-translation`, `.qa-analyse`, `.qa-vocab-grid` (`.two-col` when vocab+expressions, else `.one-col`) |
| `separator` | `<hr>` |

Hidden translations/answers are **omitted entirely** (never blurred) — the output genuinely tests memory (FR-36).

### 8.2 PDF (`lib/pdf.ts`, FR-14/15)

`generatePDFBuffer(doc: Document, practiceMode?: boolean): Promise<Buffer>` — server-side via `renderToBuffer`; client-side fallback via the `usePDF` hook.

- `PDFDocument` maps blocks → `BlockToPDF`; Q&A renders badge (SVG circle), texts, vocab grid (`View`/`Text`), `pageBreakInside: "avoid"` on the QA container.
- Page: **A4**, margins ≈14mm, **Times-Roman** (built into react-pdf; matches Georgia/Times).
- **Practice mode** (`?practice=true`): model answers and translations omitted per block flags + document defaults; each question renders an **empty dashed answer area (≈3–4 lines)** for handwritten practice (FR-49).
- All styles come from the shared token object (FR-43).

## 9. AI Integration (DeepSeek)

### 9.1 Prompt assembly (`lib/prompt.ts`, FR-12)

`buildAIPrompt(doc, instructions, goal?): { system, user }`

- **System:** contents of the active instructions file, verbatim.
- **User:** optional `GOAL: …` line, then blocks serialized with type markers:

```
<TITLE>…</TITLE>
<PARAGRAPH>…</PARAGRAPH>
<QA>
QUESTION: Qu'est-ce que tu as fait hier ?
QUESTION_TRANSLATION: What did you do yesterday?
GRAMMAR_NOTE: passé composé
USER_ANSWER: (user's practice answer, if any)
MODEL_ANSWER: J'ai mangé une pomme.
ANSWER_TRANSLATION: I ate an apple.
ANALYSIS: Le passé composé du verbe «manger»…
VOCAB: pomme|apple; mangé|eaten
EXPRESSIONS: avoir faim|to be hungry
HIDE_TRANSLATION: false
HIDE_MODEL_ANSWER: false
</QA>
```

- Response instruction: *"Return a complete, valid, self-contained HTML document only. No markdown fences, no explanations."*

### 9.2 DeepSeek client (`lib/ai.ts`, FR-48)

`convertWithAI(system, user): Promise<string>` — `fetch` to `${DEEPSEEK_BASE_URL}/v1/chat/completions`, temperature ~0.3, strips markdown fences, logs token usage (cost visibility, FR-31). Config: `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL` (default `https://api.deepseek.com`), `DEEPSEEK_MODEL` (default `deepseek-chat`).

### 9.3 Routes

- `POST /api/convert/ai` — Edge-compatible (single fetch). Receives `{ doc }`, reads instructions from storage, builds prompt, calls DeepSeek, validates output (`validate.ts`), returns `{ html }`.
- `POST /api/convert/template` — offline: reads tokens, calls `generateTemplateHTML`, returns `{ html }`.
- Both feed the same frontend flow: **Convert → preview → then PDF** (FR-46).

## 10. API Routes

| Route | Method | Purpose | Body / Query | Response |
|---|---|---|---|---|
| `/api/convert/ai` | POST | AI conversion | `{ doc }` | `{ html }` |
| `/api/convert/template` | POST | Template conversion | `{ doc }` | `{ html }` |
| `/api/documents` | GET | List documents | query `?owner=` (optional) | `{ documents }` |
| `/api/documents` | POST | Create document | `{ doc }` | `{ doc }` |
| `/api/documents/[id]` | GET | Get document | — | `{ doc }` |
| `/api/documents/[id]` | PUT | Update/save | `{ doc }` | `{ doc }` |
| `/api/documents/[id]` | DELETE | Delete | — | `204` |
| `/api/documents/[id]/pdf` | GET | Download PDF | query `?practice=true` | PDF buffer |
| `/api/documents/[id]/html` | GET | Download HTML | — | HTML |
| `/api/documents/import-html` | POST | Import external HTML → new doc (FR-40) | `{ html, title? }` | `{ doc }` |
| `/api/instructions` | GET | Get active instructions | — | `{ instructions }` |
| `/api/instructions` | PUT | Update instructions → invalidates token cache | `{ content }` | `200` |
| `/api/export/prompt` | GET | Copy-ready prompt (FR-39) | query `?docId=` | `{ system, user }` |

- All POST/PUT bodies validated with zod.
- Auth-ready: routes accept an optional owner filter; storage functions take `ownerId` (v1 ignores it — FR-45).
- **FR-46 enforcement:** the frontend disables "Download PDF" until a preview exists; editing blocks marks the preview stale and requires a fresh conversion.

## 11. Frontend Components & State

### 11.1 Editor page (`app/page.tsx` + `Editor.tsx`)

State lifted into `Editor`:

```ts
const [doc, setDoc] = useState<Document>(initialDoc);
const [html, setHtml] = useState<string | null>(null); // latest preview
const [previewStale, setPreviewStale] = useState(false); // FR-46
const [isDirty, setIsDirty] = useState(false);
```

- Autosave: debounced draft to `localStorage`; `PUT` via API every ~30s (FR-6).
- Two panes: left = `BlockList` + `AddBlockMenu`; right = `PreviewPane` (togglable).
- `?id=` opens an existing document; otherwise a new blank one.

### 11.2 Blocks

- `BlockList` — renders blocks; reorder via up/down buttons in M1, drag-and-drop (dnd-kit) in M5.
- `Block` — wrapper with drag handle; renders the right form per type.
- `QaBlockForm` (FR-4) — required `question` + optional fields that appear only when used (toggle-to-add): translation, grammar note, response label (default "RÉPONSE"), **user answer** (primary practice field, dashed-left style), model answer, answer translation, analysis, vocab rows, expressions rows. 👁 toggles next to translation/model answer set `hideTranslation` / `hideModelAnswer` (FR-34).
- `AddBlockMenu` — `+` button and `/` slash-command popup: Paragraph, Heading 2, QA, Title, Separator (FR-2).

### 11.3 Toolbar

| Action | Behavior |
|---|---|
| Convert (AI) | `POST /api/convert/ai` → sets preview, enables PDF (FR-46) |
| Convert (Template) | offline fallback → same flow |
| Save | `PUT` document |
| Download PDF | opens `/api/documents/[id]/pdf` (disabled until preview exists) |
| Download HTML | `/api/documents/[id]/html` |
| Copy for AI | submenu: Copy system prompt / Copy full prompt (FR-39) |
| Copy | opens `CopyDialog` — selective plain text (FR-50) |
| Paste HTML | modal → import-html (FR-40) |
| Paste Questions | modal → question import (FR-32/38) |
| Hide/Show all translations · Hide/Show all answers | sets flags on every QA block in one click, saves (FR-35) |

Status bar: dirty indicator, last-converted time, active instructions version.

### 11.4 Other components

- `PreviewPane` — sandboxed iframe (`srcdoc`); placeholder when empty; "stale" badge per FR-46.
- `LibraryList` (`/library`) — cards (title, date, tags, block count), open, delete.
- `InstructionsEditor` — textarea over active instructions; Save → `PUT /api/instructions` → token cache invalidated (FR-47); version history dropdown.
- `CopyDialog` (FR-50) — checkboxes: paragraphs, title/headings, questions, user answers, model answers, translations, grammar notes, analysis, vocab. **Default: everything except translations and model answers** (share-safe). Numbering preserved. Last selection remembered (localStorage).
- `PasteQuestionsModal` (FR-32/38) — paste list → detected-question count preview → "Structure with AI" or "Parse locally" → blocks replace document (after confirm).

## 12. Import / Export Flows

### 12.1 Paste HTML back (FR-40)

Modal → `POST /api/documents/import-html` with `{ html, title? }` → validated/wrapped (FR-10) → saved as document (`source: "external-html"`, blocks empty) → navigate to editor with preview + PDF enabled. "Parse to blocks" (FR-41, M5) scans for known classes (`.qa-block`, …) via `lib/html-to-blocks.ts`; success → blocks become the editable source (`source: "editor"`); unparseable fragments become paragraph blocks with raw HTML preserved.

### 12.2 Copy for AI (FR-39)

`GET /api/export/prompt?docId=` returns `{ system, user }`; the client copies each to the clipboard. The `user` section uses the exact §9.1 serialization → paste into any AI → paste its HTML back (FR-42 round-trip).

### 12.3 Selective copy (FR-50)

`CopyDialog` assembles clean numbered plain text — no HTML, no markers, no translations by default.

## 13. Practice Mode & Visibility Logic

- Global hide/show buttons iterate every QA block, set flags, save (FR-35).
- HTML template and PDF components both omit flagged elements entirely (FR-36).
- Practice PDF (`?practice=true`): omissions + blank answer boxes (FR-49).
- AI conversion: flags are included in the prompt (HIDE_TRANSLATION/HIDE_MODEL_ANSWER) so the AI omits those sections.

## 14. Auth-Ready Design (v1 has no auth, FR-45)

- All storage functions accept `ownerId` (null in v1); document creation sets `ownerId: null`.
- List/get routes accept an optional owner query param (not enforced in v1).
- **Later:** add auth middleware (e.g., NextAuth) → set `ownerId` from session → pass to storage. No data-model changes required.

## 15. Milestones

### M1 — Skeleton + Offline Loop (no AI)

**Goal:** editor with basic blocks, template HTML, react-pdf PDF, local save/load.

- [ ] Scaffold Next.js (TypeScript, Tailwind, App Router)
- [ ] `lib/types.ts` — full data model
- [ ] `lib/tokens.ts` + `lib/design-tokens.ts` — TOKENS parsing from `html_instructions.md`, fallback defaults
- [ ] `lib/storage.ts` factory + `storage-fs.ts`
- [ ] Document CRUD routes (FS storage)
- [ ] Editor: title/heading/paragraph/separator blocks, `AddBlockMenu`, autosave draft (FR-1–7)
- [ ] `html-template.ts` for those block types; `POST /api/convert/template`
- [ ] `PreviewPane` (iframe) + **FR-46 gating** (PDF disabled until preview; stale on edit)
- [ ] `pdf.ts` react-pdf components for title/heading/paragraph/separator; `POST/GET /api/documents/[id]/pdf`
- [ ] Save flow (JSON + HTML + PDF via storage interface); library page; Download HTML/PDF

**Done when:** paragraph/heading document → convert → preview → A4 PDF → save → reopen — all offline, no AI.

### M2 — Q&A Blocks + Practice Controls

**Goal:** full Q&A editing, visibility toggles, practice-mode PDF, library polish.

- [ ] `QaBlockForm` with optional-field toggles + vocab/expression row editors (FR-4)
- [ ] `html-template.ts` Q&A rendering (badges, numbering, vocab grids, omission rules FR-36)
- [ ] `pdf.ts` `QABlockPDF` (SVG badge, vocab grid, `pageBreakInside: "avoid"`)
- [ ] Practice mode: omit answers/translations + **blank answer boxes** (FR-49)
- [ ] Per-question 👁 toggles (FR-34); global hide/show toolbar buttons (FR-35)
- [ ] `?practice=true` on the PDF route
- [ ] Library sorting/tags; "Regenerate" button (re-convert from JSON)

**Done when:** full Q&A document → practice PDF hides answers and shows blank boxes; visibility state survives save/reload.

### M3 — DeepSeek + Question Import + Copy/Paste

**Goal:** AI conversion, question import, AI-agnostic copy/paste loop.

- [ ] `lib/ai.ts` DeepSeek client (env-driven, usage logging FR-31)
- [ ] `lib/prompt.ts` serialization (FR-12); `POST /api/convert/ai`; Convert (AI) button with loading/error states
- [ ] Question import backend: AI structuring (JSON-return prompt) + local numbered-line parser (FR-32)
- [ ] `PasteQuestionsModal` with count preview (FR-38)
- [ ] `GET /api/export/prompt` + copy UI (FR-39)
- [ ] `POST /api/documents/import-html` + Paste HTML modal (FR-40)
- [ ] `CopyDialog` selective copy (FR-50)
- [ ] Missing-API-key error → clear message + template fallback (FR-30)

**Done when:** AI conversion works; pasting questions yields structured blocks; external AI copy→paste round-trip functions (FR-42).

### M4 — Instructions Management

**Goal:** instructions = single source of design; editable in-app; versioned.

- [ ] Seed `data/instructions/active.md` from `html_instructions.md` (first run / startup check)
- [ ] `GET/PUT /api/instructions`; PUT invalidates the token cache (FR-47)
- [ ] `InstructionsEditor` (textarea + save + reset-to-repo + version history)
- [ ] Per-document `instructions.snapshot.md` on conversion (FR-21–23)
- [ ] History files in `data/instructions/history/<timestamp>.md`; UI dropdown
- [ ] "Convert with latest rules" toggle for old documents

**Done when:** editing the instructions file in-app changes new conversions (HTML + PDF); old documents unchanged.

### M5 — Polish + Storage for Vercel

**Goal:** production-ready UX; deployability.

- [ ] Slash-command menu polish; keyboard shortcuts (Cmd+Enter = convert, Cmd+S = save, FR-7)
- [ ] Drag-and-drop reordering; tag management + library filter
- [ ] Backup/export: one-click zip of `data/documents/`
- [ ] `lib/html-to-blocks.ts` parse-back + "Parse to blocks" integration (FR-41)
- [ ] `storage-mongo.ts` MongoDB + Blob implementation (if deploying to Vercel — ResumeBuilder pattern, FR-44)
- [ ] README, `.gitignore`, `.env.local.example`, final end-to-end testing

## 16. Environment Variables (`.env.local.example`)

```text
# AI
DEEPSEEK_API_KEY=            # required for AI mode
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat

# Storage
DATA_DIR=./data

# Vercel deploy only
MONGODB_URI=
BLOB_READ_WRITE_TOKEN=
```

## 17. Development Notes

- **No Puppeteer/Chrome anywhere.** PDFs come from `@react-pdf/renderer`; the AI route is a single fetch; storage is pluggable — every route can run on Node or Edge. Storage-touching routes (documents, instructions) need the Node runtime for the filesystem; the convert routes are Edge-compatible.
- **Token regeneration must not rewrite source files** — it invalidates an in-memory cache (works on Vercel's read-only filesystem). Only newly converted documents pick up changed tokens.
- Client-side PDF fallback: if the server route is ever too heavy, `usePDF` renders in the browser — same `pdf.ts` components.
- `data/` is gitignored; the seed instructions copy is created by a first-run check.
- `validate.ts`: strips markdown fences, checks `<html>`/`<body>`, wraps fragments, prepends `<!DOCTYPE html>` (FR-10).
- Preview iframe stays sandboxed; strip executable content from AI/pasted HTML before saving (see docs/suggestions.md).

## 18. Success Criteria (from requirements §15)

1. Mixed paragraph + Q&A document → Convert (AI and template) → styled HTML per `html_instructions.md` → A4 PDF visually matching the preview via shared tokens (FR-43).
2. Save → reopen → edit → regenerate both files; never PDF→text (FR-6, 17–20).
3. Edit instructions file → new conversions change, old documents don't (FR-21–23, 47).
4. Template mode works fully offline (FR-9).
5. Paste 10 questions → structure → answer → hide all translations in one click → practice PDF shows questions + user answers only, with blank answer boxes (FR-32–36, 49).
6. Copy for AI → external AI → paste back → preview + PDF match; best-effort blocks editable again (FR-39–42).
7. Change accent color in instructions file → HTML preview and PDF both change, zero code edits (FR-47).
8. Selective copy produces clean numbered plain text without translations (FR-50).

## 19. Alignment Matrix (FR → Plan Section)

| Requirement group | FRs | Plan sections |
|---|---|---|
| Editor & blocks | 1–7, 24–30, 37–38 | §5, §11 |
| Conversion (AI + template) | 8–12, 31 | §9, §8.1 |
| Preview & PDF | 13–16, 46, 49 | §8.2, §11.3 |
| Storage & library | 17–20, 44 | §6, §15 (M1/M5) |
| Instructions management | 21–23, 47 | §7, §15 (M4) |
| Question import | 32, 38 | §11.4, §15 (M3) |
| Visibility & practice | 33–36 | §11.2, §13 |
| Copy/paste AI-agnostic | 39–42, 50 | §12, §15 (M3) |
| Auth-ready | 45 | §14 |
| One-change-one-file | 48 | §2, §9.2 |
| Architecture principles | 43–48 | §2, §7, §14 |

## 20. Appendix: TOKENS Block Format

Appended at the end of `html_instructions.md` (after the last rule), delimited by `<!-- TOKENS -->` … `<!-- /TOKENS -->`. YAML-like `key: value` lines; values may be quoted; parser is whitespace-lenient; all keys in §7 must be present. The parser lives in `lib/tokens.ts`; it is the only consumer of this block.

---

*End of Implementation Plan — generated 2026-08-09 from `writer_app_requirements.md` v1.4 (FR-1…FR-50).*
