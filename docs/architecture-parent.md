# Architecture — parent folder (html2pdf pipeline + writer-app)

Project root: `/Users/sukhjot/Desktop/untitled folder 2` — home to the HTML→PDF pipeline (CLI script + Express web app), the shared style instructions, and the Next.js writer/practice app.

> **Status:** HTML→PDF pipeline (2 projects) is working. The Next.js writer app (**`writer-app/`, separate git repo**) has **Milestones M1–M4 complete** (offline loop; Q&A blocks + practice controls; DeepSeek AI conversion, paste-questions import, copy-for-AI / paste-HTML-back, selective copy — FR-38/39/40/50; instructions management — FR-21/22/23/47). **The writer app's detailed, always-current architecture doc lives at `writer-app/docs/architecture.md`** — this file covers the parent folder; the writer app section below stays at milestone level. This file is updated whenever the codebase changes. (Renamed from `architecture.md` 2026-08-13 to make room for the writer app's own `docs/architecture.md`.)

---

## Files

### `html_instructions.md` — Print-Ready HTML Style Instructions
- **Purpose:** The authoritative design system for print-ready A4 HTML documents: typography, colors, reusable components (card, highlighted box, data table, toolbox panel), and the full Q&A block component spec (`.qa-block`, `.qa-question`, `.qa-num`, `.qa-grammar-note`, `.qa-response-label`, `.qa-answer`, `.qa-translation`, `.qa-analyse`, `.qa-vocab-grid` with `.two-col`/`.one-col` variants). Includes `@page` print rules and critical rules (content-driven structure, no auto title page/TOC).
- **Role in pipeline:** rules input for AI-driven text→HTML conversion (future writer app); reference for hand-written HTML (e.g. `a.html`).

### `a.html` — Sample styled HTML document
- **Purpose:** Example of the styled HTML output the instructions produce (French-language practice content with Q&A blocks).
- **Functions:** none (static sample/document).

### `all pdf/` — Generated PDF output folder
- **Purpose:** Holds PDFs produced by the pipeline (e.g. `résumé des notes .pdf`).
- **Functions:** none (output directory).

### `html2pdf_script/html2pdf.js` — CLI HTML→PDF converter
- **Purpose:** One-shot CLI: load a local HTML file in headless Chrome and print to A4 PDF.
- **Functions:**
  - `main()` (async IIFE) — reads CLI args (`htmlFile` = argv[2], `outputPdf` = argv[3]), checks the HTML file exists, launches Puppeteer headless, loads via `file://` URL, calls `page.pdf({ format: 'A4', printBackground: true })`, writes the PDF, exits with an error if Chrome fails to launch.
- **Usage:** `node html2pdf.js input.html [output.pdf]`

### `html2pdf_script/package.json`
- **Purpose:** CLI project metadata; `npm run convert` → `node html2pdf.js`; depends on `puppeteer ^22.8.0`.

### `html2pdf/server.js` — Express HTML→PDF web app (backend)
- **Purpose:** Serves the paste-HTML→preview→download-PDF app; renders PDFs with Puppeteer using a pinned, cached Chrome build.
- **Constants:** `CHROME_VERSION` (pinned Chrome build id), `CACHE_DIR` (`.cache/puppeteer` inside the project).
- **Functions:**
  - `ensureChrome()` — resolves the cached Chrome executable via `computeExecutablePath`; downloads the pinned build once via `install()` if missing; returns the executable path.
  - `POST /api/generate-pdf` handler — validates `req.body.html` (string, required); launches headless Chrome (no-sandbox flags); wraps fragment HTML in a full document if it lacks `<html>` tags; `page.setContent` + `page.pdf` (A4, `printBackground: true`, 20px margins); streams the PDF with attachment headers; returns 400/500 JSON errors; closes the browser in `finally`.
  - Startup — `ensureChrome()` then `app.listen(PORT)`; exits the process if Chrome install fails.
- **Serves:** static `public/` via `express.static`.

### `html2pdf/public/index.html` — Express app frontend (single page)
- **Purpose:** Two-panel UI: HTML editor textarea + live iframe preview, toolbar with Download PDF / Reset, status line and toasts.
- **Functions:**
  - `updatePreview()` — wraps raw HTML in a full document if needed, renders into the sandboxed `previewFrame` via `srcdoc`.
  - Debounced `input` handler (400 ms) — marks "Editing…", schedules `updatePreview`.
  - `resetEditor()` — clears the textarea and preview.
  - `showToast(msg, isError)` — transient toast notification.
  - `downloadPdf()` — POSTs `{ html }` to `/api/generate-pdf`, downloads the returned blob as `document.pdf`, manages button spinner/status/error states.

### `html2pdf/package.json`
- **Purpose:** Web app metadata; scripts `start`/`dev` → `node server.js`; `postinstall` → `puppeteer browsers install chrome`; deps: `express`, `puppeteer ^22`, `@puppeteer/browsers`.

### `html2pdf/.gitignore`
- **Purpose:** Excludes `node_modules` and `.cache` from git.

### `writer_app_requirements.md` — Requirements for the Next.js writer/practice app
- **Purpose:** Single input document for an AI planner to produce an implementation plan (date 2026-08-09, v1.4). Contains product vision, user stories, numbered functional requirements (FR-1…FR-50), block/content data model (including `userAnswer` vs `modelAnswer`, per-question `hideTranslation`/`hideModelAnswer` flags, reserved `ownerId` for future auth, and `source: "editor" | "external-html"`), paste-questions import flow (AI structuring + offline local parser), per-question and global (1-click) translation/answer visibility controls, **AI-agnostic copy/paste workflow** (Copy for AI → any external AI → Paste HTML back → pipeline continues; best-effort HTML→blocks parse-back), **selective plain-text copy for sharing with checkboxes** (FR-50), **blank answer boxes in practice PDFs** (FR-49), HTML mapping, smart-editor UX spec, DeepSeek prompt sketch, proposed Next.js app structure, **PDF engine = `@react-pdf/renderer` (decision 2026-08-09: same as Sukhjot's Vercel-deployed ResumeBuilder — no Puppeteer/Chrome anywhere; runs on Node, Edge, or client-side), design system sourced from the instructions file via a machine-readable TOKENS block → generated `design-tokens.ts` (FR-47, one place to change colors), preview-before-PDF flow (FR-46), auth-ready seams (FR-45), one-change-one-file principle (FR-48), pluggable storage (FS local / MongoDB+Vercel Blob on Vercel, FR-44)**, env vars, milestones M1–M5, success criteria, and an appendix summarizing `html_instructions.md`.

### `Plan.md` — Implementation plan for the writer app
- **Purpose:** Concrete build plan derived from `writer_app_requirements.md` v1.4 (FR-1…FR-50). Contains locked decisions, tech stack, project structure, data model, pluggable storage interface, design-token pipeline (runtime parsing of the instructions TOKENS block — no source-file rewriting), HTML/PDF rendering spec (`@react-pdf/renderer`), DeepSeek integration, API route table, component/state design, practice-mode visibility logic, auth-ready seams, milestones M1–M5 with task checklists, env vars, success criteria, and an FR → section alignment matrix.
- **Functions:** none (documentation). Sections are cross-referenced by FR IDs. **Status: M1–M4 of the milestone checklists are complete in `writer-app/`.**

### `writer-app/docs/suggestions.md` — Improvement / feature / vulnerability log
- **Purpose:** Dated log of improvement ideas, feature proposals, and vulnerability notes for the writer app (per project workflow). See file for entries. (Moved from the parent folder into `writer-app/docs/` 2026-08-13.)

### Generated / excluded directories
- `html2pdf/node_modules/`, `html2pdf/.cache/`, `html2pdf_script/node_modules/`, `html2pdf/.DS_Store` — generated or OS files, not part of the codebase.

---

## Environment Variables

| Variable | Purpose | Referenced in |
|---|---|---|
| `PORT` | HTTP port for the Express html→pdf server (default 3000) | `html2pdf/server.js` |
| `PUPPETEER_CACHE_DIR` | Puppeteer Chrome cache location used at launch | `html2pdf/server.js` |
| `DEEPSEEK_API_KEY` | **implemented in M3** — DeepSeek API key for AI text→HTML conversion (missing → 400 with actionable message) | `writer-app/lib/ai.ts`, `writer-app/api/convert/ai`, `writer-app/api/convert/structure`, `writer-app/api/config` |
| `DEEPSEEK_BASE_URL` | **implemented in M3** — DeepSeek endpoint override (default `https://api.deepseek.com`) | `writer-app/lib/ai.ts` |
| `DEEPSEEK_MODEL` | **implemented in M3** — Model id override (default `deepseek-chat`), shown in the editor status bar | `writer-app/lib/ai.ts`, `writer-app/api/config` |
| `DATA_DIR` | Writer-app storage root (default `./data`) — **implemented in M1** | `writer-app/lib/storage.ts`, `writer-app/.env.local.example` |
| `MONGODB_URI` | *(planned, Vercel deploy)* MongoDB connection string for document/block storage (ResumeBuilder pattern) | `writer_app_requirements.md` §12 |
| `BLOB_READ_WRITE_TOKEN` | *(planned, Vercel deploy)* Vercel Blob token for html/pdf file storage | `writer_app_requirements.md` §12 |

Notes: `CHROME_VERSION` and `CACHE_DIR` in `html2pdf/server.js` are hard-coded constants, not env vars. Hard-coded margins (20px in `server.js`) differ from the instructions' 14mm `@page` margin — the writer app should rely on the instructions' print CSS instead (see `writer-app/docs/suggestions.md`).

---

## Planned Changes

- **Writer app (`writer-app/`, separate git repo) — M1–M4 are complete** (offline loop; Q&A blocks + practice; DeepSeek conversion, question import, copy/paste; instructions management). Remaining milestone:
  - **M5:** polish (slash-command polish, drag-reorder, tags UI, backup zip), HTML→blocks parse-back (FR-41), MongoDB + Vercel Blob storage.

> **Status: Milestones M1–M4 complete** — see `writer-app/docs/architecture.md` for the full, current file/function inventory and env vars.
