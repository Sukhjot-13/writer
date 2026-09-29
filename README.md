# Writer App — Online Writer + Practice

A Next.js (App Router, TypeScript, Tailwind v4) writing-and-practice app that converts French (or any-language) practice content into print-ready A4 **HTML** and **PDF** documents — offline template mode and AI-assisted conversion (DeepSeek), Q&A practice blocks with per-question and global visibility controls, question import, copy-for-AI / paste-HTML-back workflows, instructions management with version history, and a backup ZIP export.

Built to requirements v1.4 (FR-1…FR-50); all milestones **complete**.

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
cp .env.local.example .env.local   # add your MONGODB_URI — required since 2026-08-13 (storage is MongoDB-only)
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
| `MONGODB_URI` | yes | MongoDB connection string — the ONLY storage config since 2026-08-13 (documents, folders, instructions) |

## Storage

MongoDB-only (FR-44, since 2026-08-13): local dev and Vercel both use the MongoDB backend via `MONGODB_URI` (documents, folders, instructions). The filesystem backend was removed from production — serverless filesystems are read-only, so the old FS fallback crashed deploys with `ENOENT: mkdir '/var/task/data'`. No auth in v1 — `ownerId` seams are kept on every operation (FR-45). The instructions seed/sync reads the bundled repo copy `docs/html_instructions.md` (read-only) and writes through the backend.

## Project structure

- `lib/` — one-change-one-file cores: `types` (data model), `storage*` (pluggable storage), `tokens`/`design-tokens` (runtime design system), `html-template` + `pdf.tsx` (two renderers over shared tokens), `ai` (the only AI client), `prompt`, `validate`, `questions`, `instructions`, `html-to-blocks` (HTML→blocks parse-back, FR-41), `zip`, `tags`, `save`
- `app/api/` — REST routes (documents, convert template/ai/structure, export prompt, instructions, backup, import-html)
- `components/` — editor UI: `Editor`, `BlockList`, `Block`, `QaBlockForm`, `AddBlockMenu`, `Toolbar`, `PreviewPane`, `LibraryList`, `InstructionsEditor`, paste/copy dialogs
- `app/` — routes: `/` (editor), `/library`, `/instructions`
- `tests/` — in-project smoke-test harness (compiled with `tests/tsconfig.json`; run via `node --require tests/alias-hook.js tests/build/tests/smoke-*.js`)

## Documentation

- `docs/html_instructions.md` — the design system + AI rules, with the machine-readable `TOKENS` block (FR-47)
- `docs/architecture.md` — always-current file/function inventory + env vars (update on every change)
- `docs/suggestions.md` — improvement / feature / vulnerability log
- `docs/to-do.md` — task list / session handoff

## Manager integration (optional)

This app can send its logs and page analytics to **Manager**, your personal project control
center. With no `MANAGER_*` variables set nothing changes: the integration is a set of
no-ops, so local development, CI and previews are never affected.

### What gets wired up

- **Server logs** — `lib/manager/index.ts` is the single entry point
  (`managerLog`, `logServerEvent`, `logServerError`). Route handlers, the OTP flow and
  the middleware report through it.
- **Middleware denials** — every unauthenticated hit is reported as `middleware_denied`.
  This is the app's cheapest real error signal: a scanner probing `/api/*` shows up in the
  central viewer with no credentials needed.
- **Browser logs + analytics** — `lib/manager/ManagerProvider.tsx`, mounted in the root
  layout, starts the browser logger and injects the analytics `<script>` once.

### Configuration

| Variable | Used by | Purpose |
|---|---|---|
| `MANAGER_ENDPOINT` | server | Manager's base URL (not this app's port) |
| `MANAGER_APP_ID` | server | project slug in Manager |
| `MANAGER_LOG_KEY` | server | `mlk_…` server key |
| `MANAGER_ANALYTICS_KEY` | server + tracker snippet | `mak_…` analytics key |
| `MANAGER_LOG_SOURCE` | server | optional, `server` by default |
| `NEXT_PUBLIC_MANAGER_ENDPOINT` | browser | same base URL, inlined at build time |
| `NEXT_PUBLIC_MANAGER_APP_ID` | browser | same project slug |
| `NEXT_PUBLIC_MANAGER_CLIENT_KEY` | browser | `mck_…` client key |
| `NEXT_PUBLIC_MANAGER_ANALYTICS_KEY` | browser | `mak_…` analytics key |

The `NEXT_PUBLIC_` values are read with static member access on purpose: Next.js only
inlines `process.env.NEXT_PUBLIC_X` when written that way, and a `process.env[name]`
lookup in client code silently returns nothing.

Set them in `.env.local` and in the Vercel project settings. See `.env.example`.

### Refresh the vendored SDK

`lib/manager/logger.ts` is the whole SDK in one file (zero dependencies):

```bash
curl -fsSL -H "x-manager-key: $MANAGER_LOG_KEY" \
  "https://your-manager-host/api/sdk/logger" -o lib/manager/logger.ts
```

The key travels in the `x-manager-key` header, never in a URL.

### Verify it works

```bash
npm run manager:check
```

Posts one log and one event through the real endpoints, asserts the right key kinds are
accepted and the wrong ones refused, then checks this app's own endpoint. Logs land under
*Project → Logs*, pageviews under *Project → Analytics*.

### Delivery tuning

Routine levels ride a 250 ms batch window (a burst of N lines is one request, not N);
`error`/`fatal` use a leading-edge flush so a crash right after logging cannot strand the
entry, with a 100 ms minimum gap so an error burst is still cheap. If this client ever has
to drop entries it reports them as `manager_sdk_dropped_entries` rather than losing them
silently — `getManagerDroppedCount()` exposes the counter.
