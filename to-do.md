# To-do — Writer App (decisions recorded 2026-08-13)

---

## 🧭 NEW-SESSION HANDOFF — read this first (2026-08-13)

**Project:** Next.js (App Router, TS, Tailwind v4) French practice worksheet app. Read `AGENTS.md` at the repo root before writing any code (this Next version has breaking changes — docs live in `node_modules/next/dist/docs/`). Architecture + every file's functions: `architecture.md` (updated after every change — keep it that way). User to address as **Sukhjot**.

**Current state:**
- All 9 original items are decided; **item 2 (analysis bullet points) is DONE** (built in the "M7 round 10" commit — details in architecture.md round 10 + git history, removed from this file per the user). **Item 10 is NEW (2026-08-13) and is the user's current pain point — the manual "Reset to repo file" must die.** Everything else is **decided but NOT built**.
- Suggested build order: **10 first (quick standalone fix for the user's headache) → 1 → 8 → 6 → 7 → 4 → 9 → 5** (small quick wins; test generator last).
- Latest commit at handoff: `M7 round 10: analysis bullet points — "- " lines render as lists (HTML + PDF) + AI rule + visual test document + fixed never-passing M7 synonyms check + suggestions/to-do/arch sync` (locally committed, **not pushed** — push only after Sukhjot confirms).
- Standing notes: (1) **UNTIL item 10 is built**, the ACTIVE instructions (`data/instructions/active.md`) are a stale copy of `docs/html_instructions.md` — after any instructions change the user must click **"Reset to repo file" once on /instructions** (token cache invalidates automatically); the repo file `docs/html_instructions.md` is the single source for AI rules + design tokens; (2) practice answers (`userAnswer`) are private — never in prompts/AI/copy/preview/PDF; (3) commit locally only, push after user confirms; (4) future ideas live in `suggestions.md`.
- The visual bullet-test document `data/documents/points-test-8c31f0` ("Test — Rendu des points") exists locally (gitignored) for checking bullet rendering — delete anytime.

**Verification commands (run before declaring anything done):**
```
npx tsc --noEmit
next build
# smoke suites (M2–M8): compile with tests/tsconfig.json, then run with absolute paths:
cd tests && npx tsc -p tsconfig.json
NODE_PATH=<abs>/tests/build node --require <abs>/tests/alias-hook.js tests/build/tests/smoke-m2.js
# …same for smoke-m3.js … smoke-m8.js
```
Latest known: M2 22/22, M3 37/37, M4 25/25, M5 32/33 (1 pre-existing deferred check — "parse: vocab grid rows"), M6 24/24, M7 37/37, M8 23/23. Type-check + `next build` green. (Note: a round-9 M7 check — "synonyms: qa marker serialized" — could never pass: it expected a SYNONYMS marker while the fixture's synonyms sat on a PARAGRAPH (paragraphs serialize text-only by design); fixed 2026-08-13 by giving the qa fixture its own synonyms + updating the check. See architecture.md round 10.)

**File map (everything below in one place):**
- Renderers (the two that must never drift): `lib/html-template.ts` (HTML/preview) + `lib/pdf.tsx` (PDF, the only PDF engine).
- Data chain for any new field: `lib/types.ts` (model) → `lib/schemas.ts` (zod) → `lib/structuring.ts` (AI block parser) → `docs/html_instructions.md` (AI rules; also the design system via the `<!-- TOKENS -->` block) → `lib/prompt.ts` (`BLOCK_FORMAT_SPEC`, serialization, Copy-for-AI).
- Editor: `components/Editor.tsx` (all state: `detailed`, `practiceMode`, `previewOptions`, autosave, `toggleDetailed` with the scroll-anchor), `components/Toolbar.tsx` (+ `TogglePill` export), `components/QaBlockForm.tsx`, `components/Block.tsx`, `components/ParagraphFields.tsx`, `components/RowEditor.tsx` (shared `inputCls`/`labelCls`), `components/PreviewSheet.tsx`, `components/CopyDialog.tsx` (+ pure `buildCopyText`), `components/LibraryList.tsx` (cards, folders, `downloadDoc`), paste modals `PasteQuestionsModal/PasteBlocksModal/PasteHtmlModal`.
- Storage: `lib/storage.ts` (gateway — switches to Mongo when `MONGODB_URI` set; backend already built, `lib/storage-mongo.ts`), `lib/storage-fs.ts` (`data/` layout), `lib/instructions.ts`, `lib/save.ts`, `lib/tokens.ts` + `lib/design-tokens.ts`.
- Routes: `app/api/*` — documents CRUD, folders, preview (POST `/api/preview`), pdf (`POST/GET /api/documents/[id]/pdf` — `variant` full|questions|my-answers still accepted), convert/ai + convert/structure, backup zip.
- Tests: `tests/smoke-m2.ts` … `smoke-m8.ts` (pure-seam checks; compile + run as above).
- Other: `lib/suggestions.ts` (AI corrections), `lib/html-to-blocks.ts` (parse-back), `lib/ai.ts` (ONLY AI file), `lib/auto-grow.ts`, `lib/pdf-labels.ts`, `lib/zip.ts`, `lib/tags.ts`, `lib/questions.ts`, `lib/validate.ts`.

---

## ✅ 1. Copy dialog — wording, labels, French headings (NOT built)

**Decided:** keep "My practice answers" (renamed + explained, nothing deleted); `Modèle :` → `Réponse :`; practice answer `Réponse :` → `Ma réponse :`; question translation + grammar note get French headings.

**Build plan:**
1. `components/CopyDialog.tsx` checkboxes: "User answers" → **"My practice answers"** (helper: "what I wrote in practice"); "Model answers" → **"Answers"** (helper: "the correct answer — the Answer field").
2. `buildCopyText` (same file, exported pure — smoke-tested): qa model answer `Modèle : …` → **`Réponse : …`**; qa practice answer `Réponse : …` → **`Ma réponse : …`**; question translation gets **`Traduction de la question :`** (today bare); answer translation **`Traduction de la réponse :`** (today `Traduction :`); grammar note **`Grammaire :`** (today bare).
3. Update smoke-m7 string assertions that check the copy text.

## ✅ 3. Database — Atlas connection string (user supplies it; NOT built)

**Decided (user):** they will add the MongoDB **Atlas** connection string to the env file themselves.

**Notes / what to do when the string lands:**
1. User adds `MONGODB_URI=mongodb+srv://…` to `.env.local` — the app switches to Mongo automatically (`lib/storage.ts` factory → `lib/storage-mongo.ts`, already built M5). Optionally add a comment line in `.env.local.example`.
2. **Blob caveat:** `BLOB_READ_WRITE_TOKEN` (Vercel Blob) is only required lazily for the html/pdf *file artifacts* (import-html, saved html/pdf files). Without it, everything else works (documents, folders, instructions, backups, on-demand PDF). Only needed at Vercel deploy.
3. **Verify after the string is in:** save/list a document, folder CRUD, backup ZIP, PDF download — against Atlas.
4. Users later: `ownerId` seams already exist on every storage call (FR-45) — nothing to change now.
5. Practice-questions download/preview: **confirmed covered** — the preview's "Empty lines" toggle + hidden model answers gives the questions-only worksheet; Download PDF prints the same sheet. No new buttons.

## ✅ 4. Focus stays on the answer when toggling Detailed (NOT built)

**Decided:** build as planned:
1. `data-focus-id="${block.id}:${field}"` on every editor textarea (`QaBlockForm`, `Block`/`ParagraphFields`).
2. `toggleDetailed` (`components/Editor.tsx`, already has the scroll-anchor in a rAF): capture `document.activeElement` (id + caret) before flipping; in the same rAF refocus + restore `selectionStart/End` when the field still exists.
3. Fallback when the focused field only exists in the other mode → focus the same block's **Answer** field.
4. Rule confirmed: no focus anywhere → current behavior is fine (no restore).

## ✅ 5. Test generator (NOT built — the biggest item, do last)

**Decided:** build. New document named **"Test — 13 Aug"** (date helps identify). Random-average rule when no count given: 3–5 questions, 1–2 essays.

**Build plan:**
1. **`TestDialog`** modal on the Library page + home: pick documents (checkbox list) → Questions / Essays / Both → optional "Let AI pick randomly" + "How many questions" / "How many essays" inputs (each count disabled when its type isn't selected — validation exactly as the user specified).
2. **Random path (no AI):** pick N qa/essay blocks locally from the selected docs → assemble the new document. Instant, free.
3. **AI path:** new `POST /api/test` — serialize the chosen docs (practice answers never included — `serializeBlocksForAI` guarantees) + a TEST rule in the instructions → parse the returned blocks (existing `parseStructuredBlocksResponse`) → new document.
4. **Result:** document titled "Test — <date>" created and the editor opens it — practice, preview, PDF, copy all work like any document.
5. Files: new `components/TestDialog.tsx`, new `app/api/test/route.ts` (or assemble client-side + reuse POST `/api/documents`), library/home get the button. This is the long-planned feature (was "PLAN ONLY" in architecture.md).

## ✅ 6. Autosave (NOT built)

**Decided:** option (a) — keep the 1.2s debounce, add a **page-leave flush**: save immediately on `visibilitychange`/`pagehide` in `components/Editor.tsx` (the debounced autosave effect already lives there, guarded by the `autosave` toggle). No configurable interval.
**Later idea (recorded in suggestions.md):** an "unsaved changes" alert (beforeunload-style) when closing the tab — build only after the flush, as the last-resort net for a failed save.

## ✅ 7. Card download, JSON in preview, backup zip (NOT built)

**Decided:** ⬇ on cards = **PDF (full — everything)**; JSON download moves to the **Preview sheet**; backup ZIP ships **document.json + document.pdf** per doc in folders named **sanitized title + short random code**.

**Build plan:**
1. `components/LibraryList.tsx` — `downloadDoc` downloads `GET /api/documents/[id]/pdf?variant=full` as `<title>.pdf`. JSON download removed from the card.
2. `components/PreviewSheet.tsx` + `components/Editor.tsx` — a "Download JSON" button downloading the current doc as `<title>.json` (all fields, incl. practice answers — the only artifact with them).
3. `app/api/documents/backup/route.ts` — per doc: `document.json` always + `document.pdf` (generate on demand when missing); zip folder = `safeTitle_<4-char code>/` instead of `doc.id/` (sanitize `/ \ : * ? " < > |`, collapse whitespace, trim — any OS can unzip). **smoke-m5 zip checks updated** (they assert the old `doc.id/` paths + inflate round-trip).

## ✅ 8. Preview/PDF — French headings + no lonely "RÉPONSE" (NOT built)

**Decided:** all headings **in French** (the user reads French in the document); "Analyse :" is the style template (quiet, small, bold).

**Build plan:**
1. New headings in `lib/html-template.ts` + `lib/pdf.tsx`, styled like "Analyse :": **"Traduction :"** above the question translation, **"Grammaire :"** above the grammar note (both currently bare).
2. **RÉPONSE rule:** render the label only when there is something to label — an answer present, or empty writing lines ("Empty lines" toggle on). No answer + no empty lines → no "RÉPONSE" at all. Same rule in template (`qaBlockHtml`), PDF (`QABlockPDF`), and copy output.
3. Vocab grid headers (Vocabulaire Clé / Expressions Avancées / Synonymes) stay — they match the print spec.
4. smoke-m2/m7 assertions updated (they check the exact rendered strings).

## ✅ 9. Copy/paste/download improvements (NOT built)

**Decided (user):** build ideas 1, 2 + the backup-zip refinement (item 7). Ideas 3–5, 7 **removed** (user: "i dont need these 3 so remove them").

1. **Smart Paste box** — one paste area that sniffs the content: starts with `[` → blocks (AI), starts with `<` → HTML, otherwise → questions. The three existing Paste buttons stay as shortcuts.
2. **Copy presets** — "Worksheet (no answers)" and "Questions only" one-click buttons beside the checkboxes in Copy → For sharing.
3. Backup ZIP refinement — see item 7.

## ✅ 10. Instructions live in the DB, auto-synced from the repo — NO more "Reset to repo file" (NOT built)

**Pain point (user, 2026-08-13):** "i want the instruction and other things that should logically be on the db should be there and used from there… this is a headache going here and there and click reset to repo." Today the app reads `data/instructions/active.md`, which is seeded ONCE from `docs/html_instructions.md` (M4, FR-21) — every time the repo file changes (a feature adds a rule, e.g. ANALYSIS POINTS / synonyms), the app keeps serving the STALE copy and the user must manually click **"Reset to repo file"** on /instructions.

**Goal:** the active instructions live in **storage** and are **read from storage** (Mongo `instructions` collection when `MONGODB_URI` is set — already true; `data/instructions/active.md` in dev); the repo file is only the *seed/source* that **auto-propagates** when it changes. Zero manual resets. Design tokens follow automatically (they're parsed from whatever instructions are active).

**Design — "the newer writer wins" (one rule, no new schema):**
1. Every read of the active instructions (the two read paths: `getInstructionsState` + `resolveConversionInstructions` in `lib/instructions.ts`; token reads flow through them or invalidate on write) calls a new shared helper, e.g. `syncActiveFromRepo(storage)`:
   - `repoMtime = mtime(docs/html_instructions.md)` (fs.stat — the server always has the repo file, even with the Mongo backend; the repo path constant already exists in `lib/tokens.ts` as `REPO_INSTRUCTIONS_PATH`).
   - `activeEditedAt` = when the active copy was last written: FS backend → `stat(data/instructions/active.md).mtime`; Mongo backend → the `instructions` row's `savedAt` (user saves update it; add a `getInstructionsSavedAt`/include it in the existing read if not already returned).
   - **If `repoMtime > activeEditedAt`** → the repo file changed after the active copy was last written → copy the repo content over the active copy via the EXISTING `storage.writeInstructions(content)` (which already invalidates the design-token cache and snapshots history? — see point 3).
   - **If `activeEditedAt >= repoMtime`** → the user (or the last seed) is newer → keep the active copy untouched. This means: a user edit made AFTER a repo change intentionally wins; the next repo change re-syncs. No clicks, no lost edits, no extra columns/files.
2. First-run seeding (M4 behavior) stays — "file missing" is treated as `activeEditedAt = 0` so the seed happens in the same path.
3. Auto-sync must NOT pollute the version history: the sync overwrite should go through a dedicated internal write (no snapshot-to-history for machine syncs — history is for user saves). Keep `hashVersion` semantics: after a sync, the active version = repo hash; the Instructions editor's Save/Reset still work exactly as today (Reset becomes redundant but harmless).
4. The Instructions editor (`components/InstructionsEditor.tsx`) needs no changes (it reads/writes through the API which reads through storage). Optionally show a quiet "synced from repo" note in the status bar — NOT a button.
5. **Verify nothing else reads `docs/` at runtime** (grep `REPO_INSTRUCTIONS_PATH` / `docs/html_instructions` / `readFileSync` across `lib/` + `app/`) — everything must go through storage after this item.
6. **Tests (smoke-m4):** (a) repo file newer than active → next `getInstructionsState` returns the REPO content + repo version; (b) active saved by the user AFTER the repo change → user content kept; (c) after sync, history is unchanged (no phantom snapshot); (d) first-run seeding still works with no active copy; (e) Mongo path: row `savedAt` vs repo mtime — same decisions (the smoke suite runs against the real FS storage; the Mongo path is covered by the shared logic + code review).

**Files touched:** `lib/instructions.ts` (the helper + wiring into the two read paths), `lib/storage.ts` interface (+1 method: `getInstructionsEditedAt()` or include the timestamp in the existing read), `lib/storage-fs.ts` + `lib/storage-mongo.ts` (implement the timestamp read), `tests/smoke-m4.ts` (new checks). ~4 files, no schema change, no UI change. Build after item 10 ships: users never click Reset again; `docs/html_instructions.md` is the single file to edit for AI rules + design.
