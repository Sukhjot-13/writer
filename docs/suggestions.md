# Suggestions Log

## 🟢 Improvements

- **2026-08-09 — Unify page margins:** `html2pdf/server.js` forces 20px margins, while `html_instructions.md` specifies `@page { margin: 14mm }`. The print CSS should be the single source of truth (the writer app already does this via the instructions file).
- **2026-08-09 — Validate HTML size server-side:** `server.js` limits JSON to 10MB but doesn't cap HTML length; add a sane length cap and strip `<script>` tags from user-pasted HTML in the preview iframe (currently `sandbox="allow-scripts"` permits scripts).
- **2026-08-09 — Golden-file check between HTML preview and PDF:** since HTML and PDF are now two renderers over the same block data + shared design tokens (FR-43 in the writer app), add a visual regression test comparing the template-rendered HTML against the react-pdf output for a sample document, so token drift is caught automatically instead of by eye.
- **2026-08-09 — Testable block markers in generated HTML:** the M1 e2e "library shows block count" check failed as a grep artifact (React SSR inserts `<!-- -->` comment nodes between text children). Give the template generator stable `data-*` hooks (e.g. `data-block-type="paragraph"` per section) so tests and future HTML→blocks parse-back (FR-41) can locate blocks structurally instead of string-matching rendered text.
- **2026-08-09 — "Draft restored" indicator:** the editor silently restores a localStorage draft on load (FR-24). Surface a small toast/chip ("Restored draft from <time>") so the user knows stale content was recovered, with an explicit "discard draft" affordance.
- **2026-08-09 — Embed a print-matched serif font in the PDF:** PDF uses Times-Roman while HTML print uses Georgia (per tokens). Intended for M1, but embedding Georgia (or a metric-compatible open serif) into the react-pdf bundle would make PDF and print preview pixel-identical — a natural M5 polish candidate.
- **2026-08-10 — react-pdf has no `break-inside: avoid`:** react-pdf v4.6 exposes no `pageBreakInside`/`breakInside` style (only `break` = page-break-before and `minPresenceAhead`). QA cards use `minPresenceAhead={150}` as a keep-together approximation; a long card can still split across pages. Candidate future fix: a per-card `break` toggle in the editor for cards the user wants on their own page.
- **2026-08-10 — "Structure with AI" preview step:** FR-38's preview shows only the detected question count; AI-structured blocks land directly in the editor and replace/append. A staged preview (structured blocks → confirm → apply) would let users discard bad structuring without undoing edits — parseStructuredQaResponse already returns blocks, so this is a small UI addition.
- **2026-08-10 — Remember the last convert goal per document:** the Convert goal input (FR-29) resets every session. Persist it with the draft (localStorage) so themed sessions ("today: passé composé") survive reloads.
- **2026-08-10 — Copy dialog Markdown option:** FR-50 outputs clean plain text; a "Copy as Markdown" variant (headings as `##`, vocab as bullet lists, bold field labels) would paste nicer into notes/chat apps — buildCopyText is already the pure seam for it.

## 🟡 New Features

- **2026-08-09 — Offline "Template mode"** in the writer app (already specced, FR-9): build styled HTML locally from block data so conversion works with no API key and zero cost; AI mode stays as an upgrade.
- **2026-08-09 — Instructions versioning + per-document snapshots** (FR-21–23): editing `html_instructions.md` never breaks old documents; each document remembers which rules it was generated with. **✓ Implemented 2026-08-10 (M4):** `/instructions` editor with save/reset/history, `data/instructions/history/*.md`, per-document `instructions.snapshot.md` + "convert with snapshot rules" toggle (FR-23), TOKENS validation on save + token-cache invalidation (FR-47), version in the status bar (FR-28).
- **2026-08-10 — Diff view between instruction versions:** the history list shows version/date/char-count but not *what changed*. A `git diff`-style view (old vs new content) before Restore/Preview would make the "why did my PDF change" question answerable at a glance — the history files are already plain markdown on disk.
- **2026-08-09 — Batch export:** convert the whole `data/documents/` library (or a tagged subset) to PDFs in one action — a server-side loop over the react-pdf renderer (`lib/pdf.ts`).
- **2026-08-09 — Git-friendly document storage:** keep `document.json` files in a git repo (with `data/documents/` otherwise gitignored) so every edit is diffable and restorable; plus a one-click "backup all documents" zip.
- **2026-08-09 — Per-session focus goal:** a small "goal" field (e.g. "today: passé composé") appended to the AI prompt so practice sessions follow a theme without editing the instructions file. **✓ Implemented 2026-08-10 (M3):** goal input in the Convert dropdown (FR-29), passed as `GOAL: …` in `lib/prompt.ts`.
- **2026-08-09 — Per-block AI convert:** alongside whole-document conversion, allow "convert just this block" so a single paragraph can be re-polished without re-running the full document through DeepSeek.

## 🔴 Vulnerabilities

- **2026-08-09 — No auth on the Express app:** `html2pdf` runs a listening server with no auth; fine for localhost but should bind to `127.0.0.1` explicitly or require auth if ever exposed. The writer app (per requirements) stays local-first, single-user.
- **2026-08-09 — AI output injected into iframe preview:** generated HTML from DeepSeek will be rendered in the preview iframe — keep the sandbox attribute and strip executable content before saving/printing.
