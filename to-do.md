# To-do — Writer App (decisions recorded 2026-08-13)

---

## 🧭 NEW-SESSION HANDOFF — read this first (2026-08-13)

**Project:** Next.js (App Router, TS, Tailwind v4) French practice worksheet app. Read `AGENTS.md` at the repo root before writing any code (this Next version has breaking changes — docs live in `node_modules/next/dist/docs/`). Architecture + every file's functions: `architecture.md` (updated after every change — keep it that way). User to address as **Sukhjot**.

**Current state:**
- **Item 2 (analysis bullet points) — DONE this session** ("M7 round 10" commit). Everything else in this file is **decided but NOT built**.
- Suggested build order: **1 → 8 → 6 → 7 → 4 → 9 → 5** (small quick wins first; test generator last).
- Latest commit at handoff: `M7 round 10: analysis bullet points — "- " lines render as lists (HTML + PDF) + AI rule + visual test document + fixed never-passing M7 synonyms check + suggestions/to-do/arch sync` (locally committed, **not pushed** — push only after Sukhjot confirms).
- Standing notes: (1) the ACTIVE instructions (`data/instructions/active.md`) are a stale copy of `docs/html_instructions.md` — after any instructions change the user must click **"Reset to repo file" once on /instructions** (token cache invalidates automatically); (2) practice answers (`userAnswer`) are private — never in prompts/AI/copy/preview/PDF; (3) commit locally only, push after user confirms; (4) future ideas live in `suggestions.md`.

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

## ✅ 2. Analysis = the breakdown; bullets render as lists — **DONE (M7 round 10, 2026-08-13)**

**Decided (user):** no new field — the existing **analysis** is the breakdown; free-text bullet points (`- ` lines) render as real lists. The structured `analysisPoints` field alternative is documented in suggestions.md (full pipeline, ~10 files) — build only if per-point editing is ever asked for.

**What was built (all verified — tsc, build, smoke M7 37/37):**
- `lib/html-template.ts` — `renderInlineMarkdown` now splits on `\n`; lines starting with `- ` become `<li>` items grouped into `<ul class="point-list">` (consecutive bullets = one list; prose lines stay outside; inline markdown still applies inside points). CSS: `.point-list { margin: 2px 0 0 18px; padding: 0; } .point-list li { margin: 1px 0; }`.
- `lib/pdf.tsx` — new private `bulletText(text)` (lines starting with `- ` get a `•  ` prefix) applied to the qa, paragraph and essay analysis Texts (the 3 sites; react-pdf has no list element).
- `docs/html_instructions.md` — new rule in ENRICHMENT: "ANALYSIS POINTS: when an analysis has multiple distinct points, write each point on its own line starting with `- ` — the app renders them as bullets. Mix prose and points freely; never force points onto a single-sentence analysis." (active.md is stale — user reseed note applies.)
- `tests/smoke-m7.ts` — +3 checks: bullets render as `<ul class="point-list">` with inline markdown inside a point; consecutive lines group into ONE list with prose outside; the hidden-analyses toggle still removes the bulleted analysis. (Also fixed the never-passing round-9 synonyms-marker check — see the handoff note.)
- **Visual test document (local, NOT committed — `data/` is gitignored):** `data/documents/points-test-8c31f0/document.json` — title "Test — Rendu des points" with bullet analyses on a paragraph, an essay and 2 qa blocks (prose+bullets mix, bold/italic inside points, and a single-line no-bullet qa for comparison). Validated against `documentSchema` and rendered through the real template (3 lists / 9 items). Open the app → it's at the top of Home. Delete it anytime (or keep it — deleting it only removes the local folder).
- Remaining (tiny, optional): paragraph/essay analyses also get bullets automatically (shared renderer) — no extra work needed.

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
