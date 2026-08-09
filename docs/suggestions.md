# Suggestions Log

## 🟢 Improvements

- **2026-08-09 — Unify page margins:** `html2pdf/server.js` forces 20px margins, while `html_instructions.md` specifies `@page { margin: 14mm }`. The print CSS should be the single source of truth (the writer app already does this via the instructions file).
- **2026-08-09 — Validate HTML size server-side:** `server.js` limits JSON to 10MB but doesn't cap HTML length; add a sane length cap and strip `<script>` tags from user-pasted HTML in the preview iframe (currently `sandbox="allow-scripts"` permits scripts).
- **2026-08-09 — Golden-file check between HTML preview and PDF:** since HTML and PDF are now two renderers over the same block data + shared design tokens (FR-43 in the writer app), add a visual regression test comparing the template-rendered HTML against the react-pdf output for a sample document, so token drift is caught automatically instead of by eye.

## 🟡 New Features

- **2026-08-09 — Offline "Template mode"** in the writer app (already specced, FR-9): build styled HTML locally from block data so conversion works with no API key and zero cost; AI mode stays as an upgrade.
- **2026-08-09 — Instructions versioning + per-document snapshots** (FR-21–23): editing `html_instructions.md` never breaks old documents; each document remembers which rules it was generated with.
- **2026-08-09 — Batch export:** convert the whole `data/documents/` library (or a tagged subset) to PDFs in one action — a server-side loop over the react-pdf renderer (`lib/pdf.ts`).
- **2026-08-09 — Git-friendly document storage:** keep `document.json` files in a git repo (with `data/documents/` otherwise gitignored) so every edit is diffable and restorable; plus a one-click "backup all documents" zip.
- **2026-08-09 — Per-session focus goal:** a small "goal" field (e.g. "today: passé composé") appended to the AI prompt so practice sessions follow a theme without editing the instructions file.
- **2026-08-09 — Per-block AI convert:** alongside whole-document conversion, allow "convert just this block" so a single paragraph can be re-polished without re-running the full document through DeepSeek.

## 🔴 Vulnerabilities

- **2026-08-09 — No auth on the Express app:** `html2pdf` runs a listening server with no auth; fine for localhost but should bind to `127.0.0.1` explicitly or require auth if ever exposed. The writer app (per requirements) stays local-first, single-user.
- **2026-08-09 — AI output injected into iframe preview:** generated HTML from DeepSeek will be rendered in the preview iframe — keep the sandbox attribute and strip executable content before saving/printing.
