# To-do — Writer App (cleaned 2026-08-13 — every item is done)

---

## 🧭 NEW-SESSION HANDOFF — read this first (2026-08-13)

**Project:** Next.js (App Router, TS, Tailwind v4) French practice worksheet app. Read `AGENTS.md` at the repo root before writing any code (this Next version has breaking changes — docs live in `node_modules/next/dist/docs/`). Architecture + every file's functions: `architecture.md` (updated after every change — keep it that way). User to address as **Sukhjot**.

**Current state:**
- **EVERYTHING IS DONE (2026-08-13).** All to-do items were built in one pass and verified (item 10 instructions auto-sync → 1 copy wording + French headings → 8 French headings + no lonely RÉPONSE → 6 page-leave flush → 7 card ⬇ PDF / JSON in preview / backup zip naming → 4 focus retention on Detailed → 9 smart paste + copy presets → 5 test generator + `tests/run-all.ts`), plus item 2 (analysis bullet points, previous round) and rounds 12 (reset button relabeled + tests auto-open in practice via `Document.opensInPractice`), 13 (on-demand rework — no pre-generated html/pdf/snapshot files) and 13b (MongoDB-only storage for Vercel). **The full item list with decisions/build plans was REMOVED from this file (user: "remove what is done from there")** — every item was ✅; the decisions are recorded in `architecture.md` (M7 round 11 + 12 + 13 + 13b entries) and in git history.
- Item 3's pending user action is DONE: `MONGODB_URI` is in `.env.local` (the app is Mongo-only since round 13b — no filesystem fallback; `BLOB_READ_WRITE_TOKEN` is not needed).
- All commits are pushed to `origin/main` (0 ahead/behind as of 2026-08-13; latest: `e79c928` M7 round 13b).
- Standing notes: (1) **The Instructions reset button is relabeled "Discard my edits — restore repo copy" (2026-08-13)** — item 10's `syncActiveFromRepo` auto-propagates `docs/html_instructions.md` into storage whenever the repo file is newer (read-time sync on both backends; no history snapshots for machine syncs; a user save after a repo change wins). (2) practice answers (`userAnswer`) are private — never in prompts/AI/copy/preview/PDF. (3) **test mode = practice mode (2026-08-13):** generated tests set `Document.opensInPractice` and the editor auto-opens them in practice (answers hidden until Check — the teacher's key). (4) commit locally only, push after user confirms. (5) future ideas live in `suggestions.md`. (6) **NO pre-generated file artifacts (2026-08-13 round 13):** `persistDocument` writes only the document — html/pdf render on demand, the FR-23 snapshot is `doc.instructionsSnapshot`, imported HTML is `doc.sourceHtml`; legacy `document.html`/`document.pdf`/`instructions.snapshot.md` files are READ-ONLY fallbacks for older documents.
- The visual bullet-test document `data/documents/points-test-8c31f0` ("Test — Rendu des points") exists locally (gitignored) for checking bullet rendering — delete anytime.

**What's left (nothing to build):**
1. **Verify the app against MongoDB Atlas.** `.env.local` now carries `MONGODB_URI`; the Mongo-only runtime path (round 13b) was NOT fully exercised locally — the round-13b curl checks hit a stale pre-change `next start`. Quick e2e: start the app, save/list a document, folder CRUD, backup ZIP, PDF download.
2. **The one deferred M5 smoke check** — "parse: vocab grid rows" (term/def attribution in parse-back); pre-existing and documented; M5 = 37 passed + 1 deferred.

**Verification commands (run before declaring anything done):**
```
npx tsc --noEmit
next build
# smoke suites (M2–M9) — ONE file runs everything (user's token-saving ask):
cd tests && npx tsc -p tsconfig.json
node tests/build/tests/run-all.js        # all suites
node tests/build/tests/run-all.js m7     # only suite m7 (re-run a failure)
```
Latest known (2026-08-13, the full final run): M2 26/26, M3 48/48, M4 31/31, M5 37 passed + 1 pre-existing deferred check ("parse: vocab grid rows"), M6 24/24, M7 37/37, M8 23/23, M9 18/18 → **7/8 suites pass** (M5's only failure is the documented deferred check). Type-check + `next build` green (19 routes — `/api/test` added).

**File map (everything below in one place):**
- Renderers (the two that must never drift): `lib/html-template.ts` (HTML/preview) + `lib/pdf.tsx` (PDF, the only PDF engine).
- Data chain for any new field: `lib/types.ts` (model) → `lib/schemas.ts` (zod) → `lib/structuring.ts` (AI block parser) → `docs/html_instructions.md` (AI rules; also the design system via the `<!-- TOKENS -->` block) → `lib/prompt.ts` (`BLOCK_FORMAT_SPEC`, serialization, Copy-for-AI).
- Editor: `components/Editor.tsx` (all state: `detailed`, `practiceMode`, `previewOptions`, autosave, `toggleDetailed` with the scroll-anchor), `components/Toolbar.tsx` (+ `TogglePill` export), `components/QaBlockForm.tsx`, `components/Block.tsx`, `components/ParagraphFields.tsx`, `components/RowEditor.tsx` (shared `inputCls`/`labelCls`), `components/PreviewSheet.tsx`, `components/CopyDialog.tsx` (+ pure `buildCopyText`), `components/LibraryList.tsx` (cards, folders, `downloadDoc`), paste modals `PasteQuestionsModal/PasteBlocksModal/PasteHtmlModal`.
- Storage: `lib/storage.ts` (gateway — MongoDB-only since round 13b; backend `lib/storage-mongo.ts`), `lib/storage-fs.ts` (TEST-ONLY fixture), `lib/instructions.ts`, `lib/save.ts`, `lib/tokens.ts` + `lib/design-tokens.ts`.
- Routes: `app/api/*` — documents CRUD, folders, preview (POST `/api/preview`), pdf (`POST/GET /api/documents/[id]/pdf` — `variant` full|questions|my-answers still accepted), convert/ai + convert/structure, backup zip, **test (2026-08-13 — POST `/api/test`, the AI test-generator path)**.
- Tests: `tests/smoke-m2.ts` … `smoke-m9.ts` + `run-all.ts` (the single all-suite runner — pure-seam checks; compile + run as above).
- Other: `lib/suggestions.ts` (AI corrections), `lib/html-to-blocks.ts` (parse-back), `lib/ai.ts` (ONLY AI file), `lib/auto-grow.ts`, `lib/pdf-labels.ts`, `lib/zip.ts`, `lib/tags.ts`, `lib/questions.ts`, `lib/validate.ts`, **`lib/backup.ts` (backup folder naming), `lib/paste-sniff.ts` (smart paste), `lib/test-generator.ts` (random test path)**.
