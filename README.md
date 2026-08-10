# Writer App — Online Writer + Practice

A Next.js (App Router, TypeScript, Tailwind v4) writing-and-practice app that converts French (or any-language) practice content into print-ready A4 **HTML** and **PDF** documents — offline template mode and AI-assisted conversion (DeepSeek), Q&A practice blocks with per-question and global visibility controls, question import, copy-for-AI / paste-HTML-back workflows, instructions management with version history, and a backup ZIP export.

Built against `docs/writer_app_requirements.md` (v1.4, FR-1…FR-50) and `docs/Plan.md` (milestones M1–M5 — **all complete**).

## Features

**Editor (FR-1…FR-7)**
- Block-based editing: title, headings, paragraphs (plain or markdown `**bold**` / `*italic*` / `` `code` ``), separators, Q&A cards — with `/` slash commands, drag-to-reorder, Enter-to-split, Backspace-to-merge, and per-block ↑/↓/＋/✕ controls
- Debounced localStorage draft autosave + restore; `Cmd/Ctrl+S` and `Cmd/Ctrl+Enter` shortcuts
- Per-document tags (comma-separated) shown as chips on the rendered page and in the library

**Conversion → Preview → Download (FR-8…FR-16, FR-46)**
- **Template mode (offline, free):** deterministic styled HTML from block data, no API key required
- **AI mode (DeepSeek):** full-document conversion with an optional session goal; uses the active instructions as the system prompt
- Live sandboxed A4 preview iframe; **preview is required before PDF download**
- PDF via `@react-pdf/renderer` — the only PDF engine (no Puppeteer/Chrome anywhere)
- **Practice mode:** hides translations and model answers, renders blank ruled answer areas

**Q&A practice blocks (FR-33…FR-37, FR-49)**
- Question + optional translation, grammar note, response label, user answer, model answer, answer translation, analysis, vocab/expressions grid
- 👁/🙈 per-question hide toggles + global "hide/show all" buttons, with visibility counters
- In practice PDFs: blank answer areas instead of answers

**AI-agnostic copy/paste (FR-38…FR-42, FR-50)**
- Paste a question list → "Structure with AI" or offline local parsing → QA blocks
- Copy for AI (type-marked block serialization) → paste into any external AI → "Paste HTML back" → pipeline continues
- Selective plain-text copy for sharing (checkbox picker, remembers last selection)

**Instructions management (FR-21…FR-23, FR-47)**
- `/instructions` editor for the active rules (the single source of truth for the design system + AI rules)
- Save with version history (`data/instructions/history/*.md`), reset to repo copy, per-document snapshots + "convert with this document's snapshot rules"
- Design colors are parsed at runtime from the instructions file's `<!-- TOKENS -->` block — changing a color means editing `docs/html_instructions.md` only

**Library & backup**
- `/library` — document cards with sort, tag filter, regenerate, delete
- **Backup (zip):** one click downloads the whole library (`document.json` + html/pdf/snapshot files per document)

## Getting started

```bash
npm install
cp .env.local.example .env.local   # optional — template mode works with no keys
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Create a document in the editor, add Q&A blocks, convert (template or AI), preview, and download PDF/HTML.

```bash
npm run build && npm start   # production
```

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DEEPSEEK_API_KEY` | AI mode | DeepSeek API key (missing → actionable 400 in AI mode; template mode unaffected) |
| `DEEPSEEK_BASE_URL` | no | API base (default `https://api.deepseek.com`) |
| `DEEPSEEK_MODEL` | no | Model id (default `deepseek-chat`), shown in the editor status bar |
| `DATA_DIR` | no | Filesystem storage root (default `./data`) |
| `MONGODB_URI` | Vercel deploy | Switches storage to MongoDB + Vercel Blob (pluggable storage, FR-44) |
| `BLOB_READ_WRITE_TOKEN` | Vercel deploy | Vercel Blob token for html/pdf file storage |

## Storage

Pluggable (FR-44): locally the app uses the filesystem (`data/`); when `MONGODB_URI` + `BLOB_READ_WRITE_TOKEN` are set it uses MongoDB (documents, files index, instructions) + Vercel Blob (html/pdf files). No auth in v1 — `ownerId` seams are kept on every operation (FR-45).

```
data/                          # local filesystem layout (FR-17)
  documents/<id>/document.json # source blocks (editable truth)
  documents/<id>/document.html # generated HTML
  documents/<id>/document.pdf  # generated PDF
  instructions/active.md       # editable instructions
  instructions/history/*.md    # version history
```

## Project structure

- `lib/` — one-change-one-file cores: `types` (data model), `storage*` (pluggable storage), `tokens`/`design-tokens` (runtime design system), `html-template` + `pdf.tsx` (two renderers over shared tokens), `ai` (the only AI client), `prompt`, `validate`, `questions`, `instructions`, `html-to-blocks` (HTML→blocks parse-back, FR-41), `zip`, `tags`, `save`
- `app/api/` — REST routes (documents, convert template/ai/structure, export prompt, instructions, backup, import-html)
- `components/` — editor UI: `Editor`, `BlockList`, `Block`, `QaBlockForm`, `AddBlockMenu`, `Toolbar`, `PreviewPane`, `LibraryList`, `InstructionsEditor`, paste/copy dialogs
- `app/` — routes: `/` (editor), `/library`, `/instructions`
- `tests/` — in-project smoke-test harness (compiled with `tests/tsconfig.json`; run via `node --require tests/alias-hook.js tests/build/tests/smoke-*.js`)

## Documentation

- `docs/writer_app_requirements.md` — product requirements (v1.4, FR-1…FR-50)
- `docs/Plan.md` — implementation plan (milestones M1–M5)
- `docs/html_instructions.md` — the design system + AI rules, with the machine-readable `TOKENS` block (FR-47)
- `architecture.md` — always-current file/function inventory + env vars (update on every change)
- `docs/suggestions.md` — improvement / feature / vulnerability log
