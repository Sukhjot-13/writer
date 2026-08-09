# Online Writer + Practice App — Requirements Document

> **Purpose of this file:** This is the single input document for an AI planner. Feed this file (plus `html_instructions.md`, which it references) to any AI to produce an implementation plan. All requirements are numbered (`FR-x`) so the plan can trace to them.
>
> **Date:** 2026-08-09 (v1.4 — added **blank answer boxes in practice PDFs** FR-49 and **selective plain-text copy for sharing** FR-50) · **Status:** Ready for planning · **Owner:** Sukhjot

---

## 1. Background & Existing Assets

Sukhjot already has a working HTML→PDF pipeline built on Puppeteer:

| Asset | Path | What it does |
|---|---|---|
| Style instructions | `html_instructions.md` (same folder) | A detailed design system for **print-ready A4 HTML**: fonts (Georgia/Times), colors, `.qa-block` Q&A components (numbered question badges, grammar notes, answer boxes, translations, analysis, vocabulary grids), cards, tables, tags, highlight boxes, `@page` print rules (`break-inside: avoid` for Q&A blocks). **This file is the "rules" the AI must follow when converting text → HTML.** |
| CLI script | `html2pdf_script/html2pdf.js` | `node html2pdf.js input.html output.pdf` — loads a local HTML file in headless Chrome, prints to A4 PDF. |
| Web app | `html2pdf/server.js` + `public/index.html` | Express app: paste HTML in a textarea → live preview → `POST /api/generate-pdf` renders PDF with Puppeteer → download. |
| Sample output | `a.html`, `all pdf/` | Example styled HTML and generated PDFs. |

**Key insight from existing work:** the user writes/practices **language learning material** (French-focused: Q&A with question + translation + grammar note + "RÉPONSE" label + answer + translation + "Analyse" + vocabulary/expressions grids). The Q&A block components in `html_instructions.md` are exactly the structure needed for a practice app.

## 2. Product Vision (one sentence)

> A **smart online writer** where Sukhjot writes paragraphs and question-answer practice content as easy blocks — or **pastes a raw list of questions to get an instant structured practice sheet** — converts them to beautifully styled HTML (via **DeepSeek** following `html_instructions.md`, or via a built-in local template), previews, and downloads/keeps **both the PDF and the editable HTML + source** — so nothing ever needs the painful PDF→text→HTML round-trip again.

## 3. Goals & Non-Goals

**Goals**
1. Write and mix **paragraph blocks** and **Q&A blocks** in one document, distinguished by type/tag/class.
2. Convert any document (or single block) to styled HTML **and** PDF — AI-assisted (DeepSeek) or template-based (offline, free).
3. **Save HTML + PDF + editable source together** per document; reopen → edit → regenerate without conversion loss.
4. Editor must be **"smart"** — no struggling to decide where text goes (see §8).
5. The style instructions (`html_instructions.md`) must be **updatable** and versioned so old documents don't break when rules change.
6. Stack: **Next.js** (App Router, TypeScript) + **`@react-pdf/renderer`** for PDFs (Vercel-proven in Sukhjot's ResumeBuilder; no Chrome/Puppeteer; runs on Node, Edge, or client-side) + **DeepSeek** for AI conversion.
7. **Import question lists:** paste raw questions (numbered lines, blank-line separated) → AI structures them into Q&A blocks with translations, grammar notes, vocab, and model answers → answer boxes ready for practice. Same block pipeline afterwards.
8. **Auth-ready:** no auth in v1 (anonymous single user), but storage/API seams are shaped so users can be added later as a middleware + `ownerId` change, never a rewrite (FR-45).

**Non-Goals (v1)**
- No multi-user accounts/auth (local, single-user tool).
- No cloud database (filesystem storage; DB migration can come later).
- No WYSIWYG HTML editing in the editor — edits happen on the **source content**, HTML is regenerated.

## 4. User Stories

- **US-1 (Write):** As a user, I open the editor and type a paragraph without deciding anything about formatting — I just write text in a block.
- **US-2 (Practice):** I add a Q&A block with question, answer, translation, grammar note, and vocabulary — optional fields only, hidden when empty.
- **US-3 (Mix):** I create one document containing several paragraphs **and** several Q&A items in any order. Each block carries a type tag (and optional custom tags) that becomes a CSS class in the output HTML.
- **US-4 (Convert):** I click **"Convert to HTML"** (AI mode) or **"Template"** (offline mode). AI mode sends my text + the current instructions file to DeepSeek, which returns a self-contained styled HTML page. Template mode builds the same styling locally from block data (free, deterministic).
- **US-5 (PDF):** I click **"Download PDF"** — `@react-pdf/renderer` builds an A4 PDF from the block data using the same design tokens as the HTML preview (Times-Roman, the instructions' colors/spacing, Q&A cards kept intact across pages). Selectable text, works on Vercel, no Chrome needed.
- **US-6 (Save both):** Saving a document stores `document.json` (source blocks), `document.html`, `document.pdf`, and a snapshot of the instructions used.
- **US-7 (Re-edit):** From the document library, I open any saved document → the editor loads the source blocks → I edit → regenerate HTML/PDF. **No PDF-to-text conversion ever.**
- **US-8 (Update rules):** I can edit the active instructions inside the app (or in the repo). New conversions use the new rules; old documents keep their snapshot. I can also append a **"goal/focus"** line (e.g. "today: passé composé") that gets added to the AI prompt.
- **US-9 (Practice mode):** A toggle hides answers/translations so I can self-test (both on screen and in the printed PDF, if desired).
- **US-10 (Import questions):** I paste a list of questions → click "Structure with AI" → the app returns an editable practice sheet: each question becomes a Q&A block with English translation, grammar note, vocab, and a model answer — plus an empty **answer box where I type my own answer**. Everything else (convert, PDF, save, re-edit) then works exactly the same, because imported content is the same block data.
- **US-11 (Control translations):** While practicing I hide the English translation of one question I already know (👁 per question), keep others visible, or **hide/show all translations in one click** — same for model answers. My choices are saved with the document and honored in the generated HTML/PDF.
- **US-12 (Copy for AI):** One click copies my document's content in prompt-ready form (paragraphs and Q&A serialized with type markers) — optionally with the current instructions as a system prompt — so I can paste it into **any** AI (DeepSeek chat, ChatGPT, Claude, etc.) and get styled HTML back that follows the instructions.
- **US-13 (Paste HTML back):** I paste the external AI's HTML output into the app → it's validated, saved as a document, previewed, and the normal pipeline continues: download PDF, save both files, re-edit later. Best-effort "Parse to blocks" can turn it back into editable Q&A blocks.
- **US-14 (Auth later, no rework):** I will add user accounts later — v1 stays anonymous, but documents carry an `ownerId` slot and storage/API seams are user-aware from day one, so adding auth is a small middleware change, not a restructure.
- **US-15 (Share clean copy):** I copy my content as **clean plain text** to share or use elsewhere — paragraphs and Q&A with no HTML and no English translations unless I tick them. A copy dialog lets me choose exactly what goes: paragraphs, questions, user answers, model answers, translations, grammar notes, vocab.

## 5. Functional Requirements

### 5.1 Editor
- **FR-1** Block-based editor (Notion-style). At minimum block types: `title`, `heading`, `paragraph`, `qa`, `separator`.
- **FR-2** Add block via `+` button or `/` slash-command (`/para`, `/qa`, `/title`, `/h2`).
- **FR-3** Enter creates a new block below; backspace on an empty block merges up; blocks can be reordered (drag or ↑/↓ buttons).
- **FR-4** Q&A block form: question (primary language), optional question translation, optional grammar note, optional response label (default `RÉPONSE`), answer, optional answer translation, optional analysis, optional vocabulary list (term+definition rows), optional expressions list. **Empty optional fields are hidden** — never show a form field the user isn't using.
- **FR-5** Any block can have custom **tags** (e.g. `#french`, `#past-tense`) which become CSS classes in output HTML.
- **FR-6** Auto-save draft to localStorage (and/or a `data/drafts/` file) so nothing is lost on refresh.
- **FR-7** Keyboard shortcut `Cmd/Ctrl+Enter` = Convert, `Cmd/Ctrl+S` = Save.

### 5.2 Conversion
- **FR-8** **AI mode:** POST blocks/text + active instructions to DeepSeek (`deepseek-chat` by default, env-overridable — see §11) → returns **complete self-contained HTML** (whole `<html>` document, or fragment that gets wrapped). Temperature low (0.2–0.4) for fidelity to the design system.
- **FR-9** **Template mode (no AI):** local `lib/html-template.ts` generates the same styled HTML deterministically from block JSON (no API cost, always available, used as fallback when no API key).
- **FR-10** Convert output is **validated** (strip markdown code fences, sanity-check it's HTML, wrap in full document if fragment) before showing preview or saving.
- **FR-11** Conversion is per-document (or per-selected-block), **not** per-keystroke — AI calls only happen on explicit user action.
- **FR-12** The AI prompt composes: `html_instructions.md` (current version) as the system rules + the block content serialized with type markers + optional user "goal/focus" line. (Exact prompt sketch in §9.)

### 5.3 Preview & PDF
- **FR-13** Live preview pane renders the latest generated HTML in a sandboxed iframe.
- **FR-14** "Download PDF" builds the PDF with **`@react-pdf/renderer`** (the exact engine Sukhjot runs in production on Vercel in ResumeBuilder): React components per block type (`Document`/`Page`/`View`/`Text`), page size **A4**, margins ≈14mm, Times-Roman font family (matches the instructions' Georgia/Times requirement), Q&A cards use `pageBreakInside: 'avoid'` (react-pdf equivalent of the instructions' `break-inside: avoid`).
- **FR-15** The PDF is generated **from block data (`document.json`), not from the HTML** — HTML and PDF are two renderings of the same source. **No Chrome, no Puppeteer, no browser binary anywhere** → the route runs on **Node or Edge**, or even fully client-side via react-pdf's `usePDF` hook.
- **FR-16** Optional: practice-mode PDF (answers hidden) as a checkbox at export time.
- **FR-43 (Design tokens — single source):** `lib/design-tokens.ts` holds the design system's colors, fonts, sizes, radii, and spacing, and is **generated from the instructions file** (FR-47). Both the HTML template renderer (§7) and the react-pdf components consume it — the HTML preview and the PDF can never drift apart, and a style change is a one-file edit.
- **FR-44 (Pluggable storage):** `lib/storage.ts` exposes one interface (save/load/delete documents, read/write files, instruction snapshots). v1 ships a **local filesystem** implementation (`DATA_DIR`). A **MongoDB + Vercel Blob** implementation (Sukhjot's ResumeBuilder stack) is added for Vercel deployment — app code never talks to a storage backend directly.
- **FR-46 (Preview before PDF):** the flow is always **Convert → preview the HTML → then generate the PDF**. "Download PDF" stays disabled until a preview exists (from conversion or pasted HTML); editing blocks invalidates the preview (marked stale) and requires a fresh conversion, so the PDF always reflects what was previewed.
- **FR-49 (Blank answer boxes in practice PDFs):** when a practice-mode PDF (FR-16/36) hides model answers, each question renders an **empty ruled/dashed answer area** (≈3–4 lines high) so the printed sheet can be answered with a pen. The blank area never leaks the model answer or the translation.

### 5.4 Storage & Document Library
- **FR-17** Save layout per document (filesystem, `DATA_DIR`):
  ```
  data/
    documents/<id>/
      document.json            # source blocks (the single editable truth)
      document.html            # generated HTML — kept for reuse/editing
      document.pdf             # generated PDF
      instructions.snapshot.md # instructions version used at last conversion
    instructions/
      active.md                # copy of html_instructions.md used for new conversions
      history/<timestamp>.md   # versioned history
  ```
- **FR-18** Library page lists saved documents (title, date, block count, tags); open → editor reloads `document.json`.
- **FR-19** Download endpoints for `.html` and `.pdf` per document; `DELETE` removes the folder.
- **FR-20** Regenerate: re-convert from JSON and re-render PDF without manual steps.

### 5.5 Instructions Management
- **FR-21** The app reads `data/instructions/active.md` (seeded from `html_instructions.md` at first run) for all AI prompts.
- **FR-22** Edit UI for instructions (simple textarea + save + version history), plus "reset to repo file" button.
- **FR-23** Every conversion records `instructions.snapshot.md` with the document so **re-converting an old document uses the same rules it was made with** (optional toggle: "convert with latest rules").

### 5.6 Import Questions & Practice Controls
- **FR-32 (Import questions):** A "Paste questions" action takes plain text (numbered lines `1. …`, `2. …` or blank-line-separated questions). **AI mode:** sends the list to DeepSeek (same instructions file as system prompt) which returns structured Q&A blocks — per question: translation, grammar note, response label, **model answer**, answer translation, analysis, vocab/expressions. **Template mode (offline):** a local parser splits numbered/blank-line items into question-only Q&A blocks (no AI data). In both cases the result loads into the editor as normal blocks with the user's answer field empty and ready to type into (US-10).
- **FR-33 (Answer writing):** Every Q&A block has two answer concepts stored separately: `userAnswer` (what Sukhjot types during practice — editable anytime) and `modelAnswer` (the reference answer, from AI structuring or typed manually). In the editor, the user answer is the primary editable field; the model answer is shown/hidden via the controls below.
- **FR-34 (Per-question visibility):** Each Q&A block has 👁 toggles for (a) **English translation** of the question and (b) **model answer**. Per-question state persists in the block JSON (`hideTranslation`, `hideModelAnswer`).
- **FR-35 (Global visibility, 1-click):** Toolbar buttons "Hide/Show all translations" and "Hide/Show all answers" apply to every Q&A block in the document (writes the per-question flags), so state stays consistent and reloads correctly.
- **FR-36 (Output honors visibility):** Generated HTML omits elements hidden by the flags (template mode: skip the `<em>` translation, `.qa-translation`, and/or the model-answer box; AI mode: the prompt lists per-block flags). The practice-mode PDF (FR-16) prints with translations and model answers hidden, user answers retained — so the printed sheet is blank for self-testing.

## 6. Content / Block Data Model

```ts
type Block =
  | { id: string; type: "title";        tags: string[]; content: { text: string } }
  | { id: string; type: "heading";      tags: string[]; content: { text: string; level?: 2 | 3 } }
  | { id: string; type: "paragraph";    tags: string[]; content: { text: string; format?: "plain" | "markdown" } }
  | { id: string; type: "qa";           tags: string[]; content: QaContent }
  | { id: string; type: "separator";    tags: string[]; content: {} };

interface QaContent {
  question: string;              // primary language
  questionTranslation?: string;  // <em> under question (hideable, FR-34)
  grammarNote?: string;          // small italic line
  responseLabel?: string;        // default "RÉPONSE"
  userAnswer?: string;           // practice answer written by the user (FR-33)
  modelAnswer?: string;          // reference answer (AI import or manual)
  answerTranslation?: string;    // target-language translation
  analysis?: string;             // "Analyse : …" block
  vocab?:   { term: string; def: string }[];      // → vocabulary column
  expressions?: { term: string; def: string }[];  // → expressions column
  hideTranslation?: boolean;     // per-question: omit English translation in output (FR-34)
  hideModelAnswer?: boolean;     // per-question: omit model answer in output (FR-34)
}

interface Document {
  id: string;
  title: string;
  ownerId?: string;               // reserved for future auth — always empty in v1 (FR-45)
  source: "editor" | "external-html";  // how the document was created (FR-40)
  createdAt: string;
  updatedAt: string;
  tags: string[];
  blocks: Block[];              // may be empty for external-html docs — HTML is the source
  practice?: {                  // document-level practice defaults (FR-35)
    hideTranslations: boolean;  // default false — visible while editing
    hideModelAnswers: boolean;  // default false
  };
}
```

**Type separation → classes/tags:** each block's `type` becomes a wrapper class in HTML (`class="block block-qa"`, `class="section section-paragraph"`), user `tags` become additional classes (`class="tag-past-tense"`). This is the "separated by classes or tags" requirement — inside the editor (block types), in the source JSON (type + tags), and in the HTML (CSS classes).

## 7. HTML Mapping (Template Mode — what the AI should also produce)

Follows `html_instructions.md` exactly (see Appendix A). Key mapping:

| Block | HTML |
|---|---|
| `title` | `<h1>` styled per instructions (bold, `#1e3a5f`) |
| `heading` | `<h2>`/`<h3>` (bold, `#1e3a5f`, optional 3px bottom border) |
| `paragraph` | clean styled `<p>`; light markdown (bold/italic/lists/inline code) if `format: "markdown"` |
| `qa` | `<div class="qa-block">` with: `.qa-num` (auto-numbered circular `#1e3a5f` badge, 24px), `.qa-question-text` (+ `<em>` translation **omitted if `hideTranslation`**), `.qa-grammar-note`, `.qa-response-label`, user answer box `.qa-user-answer` (styled like `.qa-answer` but dashed left border — rendered only when `userAnswer` is filled), model answer `.qa-answer` (**omitted if `hideModelAnswer`**), `.qa-translation` (omitted if hidden), `.qa-analyse`, `.qa-vocab-grid` (`.two-col` when both vocab+expressions exist, else `.one-col`; headers bg `#f7f9fb` uppercase; rows `.qa-vocab-row` / `.qa-expr-row`, term bold `#2c5f2d`; column bodies `#eef2f7`) |
| tags | additional classes on the wrapper |
| whole doc | full HTML doc, `@page { size: A4; margin: 14mm }`, base font Georgia/Times 11.5px (10.5px print), colors per instructions |

Q&A numbering is sequential across the document (1, 2, 3…) in order of appearance.

**Visibility → HTML:** hidden translations and model answers are **omitted from the HTML output entirely** (not just blurred) — the print/PDF then genuinely tests memory. For screen practice inside the editor the same flags can render a blurred/placeholder state if preferred, but the saved HTML/PDF always omit (FR-36).

**PDF parity:** the react-pdf components mirror this exact structure — same section order, same elements per block, same omission rules from FR-36. Both renderers read the shared design tokens (FR-43), so the PDF visually matches the HTML preview.

## 8. Smart-Editor UX Requirements ("don't make me struggle")

- **FR-24** Zero-formatting friction: default block is a plain paragraph — typing starts immediately on load.
- **FR-25** Blocks auto-grow; the current block is visually highlighted; the "add block" affordance appears at the caret/block edge.
- **FR-26** The Q&A form is guided: tab/Enter moves question → translation (optional) → grammar note (optional) → answer → translation → analysis → vocab rows. Optional sections only become visible once the user types in them.
- **FR-27** A **two-pane layout**: editor (left) + live A4 preview (right) after first conversion; toggle to full-width editor.
- **FR-28** Status bar: unsaved changes indicator, last-converted time, active instructions version, model name.
- **FR-29** Clear primary action button: **"Convert"** (AI) with a dropdown option **"Template (offline)"**; then **"Save"** and **"Download PDF"**.
- **FR-30** Errors are inline and actionable (e.g., "DeepSeek API key missing — add DEEPSEEK_API_KEY or use Template mode").
- **FR-37** Per-Q&A-block 👁 buttons toggle translation / model answer (FR-34); toolbar "Hide/Show all translations" and "Hide/Show all answers" (FR-35). Hidden state is visually clear (muted placeholder), and there's a visible count, e.g. "3/8 translations hidden".
- **FR-38** "Paste questions" is a single-step flow: paste → preview of what will be structured (count of questions detected) → "Structure with AI" or "Parse locally (offline)" → blocks land in the editor with answer fields ready.

### 5.7 Copy for External AI & Paste Back (AI-agnostic workflow)
- **FR-39 (Copy for AI):** Toolbar action copies the document content serialized **exactly as the §9 prompt's user section** (`<TITLE>`, `<PARAGRAPH>`, `<QA>` markers per block, including per-block `HIDE_TRANSLATION`/`HIDE_MODEL_ANSWER` flags). A second button copies the **active instructions as a ready-made system prompt**. A third copies **plain text** (paragraphs + Q&A flattened). Everything goes to the clipboard with one click each — the user can then feed any AI, not just the in-app route.
- **FR-40 (Paste HTML back):** "Paste HTML" accepts HTML from any external AI → validated/wrapped per FR-10 → stored as a new document (`source: "external-html"`) → preview renders immediately → the full pipeline continues (save `document.html` + `document.pdf`, download, delete). Title is taken from the HTML `<title>` or a prompt.
- **FR-41 (Continue from pasted HTML):** Pasted documents behave like any other (FR-17–20). Additionally a **best-effort "Parse to blocks"** action reconstructs editable blocks by parsing the known classes (`.qa-block`, `.qa-question`, `.qa-answer`, `.qa-translation`, `.qa-vocab-grid`, …); on success the blocks become the editable source (`source` flips to `"editor"`). Unparseable fragments stay as a paragraph block with the raw HTML preserved.
- **FR-42 (Copy→AI→paste round-trip):** A document copied via FR-39, fed to any AI with the copied instructions, and pasted back via FR-40 must reproduce the same content structure (title, block order, Q&A fields, vocab) — the type markers make this reliable.
- **FR-50 (Selective copy for sharing):** a "Copy" dialog (toolbar) chooses exactly what goes to the clipboard as **clean plain text — no HTML, no type markers, no translations by default**: checkboxes for paragraphs, title/headings, questions, user answers, model answers, translations, grammar notes, analysis, vocab. Q&A numbering preserved (1., 2., …). Used for sharing content in chat/notes/anywhere. The last-used selection is remembered. (Distinct from FR-39, which is the prompt-format copy for AI round-trips.)

### 5.8 Architecture Principles: Auth-Ready & One-Change-One-File
- **FR-45 (Auth-ready):** v1 has **no auth** — anonymous single user. But nothing may assume that forever: documents carry a reserved optional `ownerId`, the storage interface (FR-44) is user-scoped by design, and server routes accept an optional owner filter. Adding auth later (NextAuth/Clerk or any provider) means adding middleware + setting `ownerId` from the session — **never restructuring** the app.
- **FR-47 (Instructions file = single source of the design):** the active instructions file is the **one place the design system lives**. It keeps the human-readable prose (as today) **plus a machine-readable `TOKENS` block** (structured list of colors, fonts, sizes, spacing). On app start and on every instructions save, `lib/tokens.ts` parses it and regenerates `design-tokens.ts` (file marked GENERATED). Changing a color = editing the instructions file → both HTML and PDF change. No color value exists in app code.
- **FR-48 (One change, one file):** every swappable concern has exactly **one owning file**: AI model/endpoint/prompt → `lib/ai.ts` (+ env `DEEPSEEK_MODEL`); PDF rendering → `lib/pdf.ts`; storage backend → `lib/storage.ts`; design system → the instructions file (FR-47). Changing the PDF engine or the AI model must never require touching routes, components, or the editor UI.

## 9. DeepSeek Prompt Sketch (implementation will refine)

```
SYSTEM:
  {contents of data/instructions/active.md}   // the style rules, verbatim
  + "Return a complete, valid, self-contained HTML document only.
     No markdown fences, no explanations. Output HTML only."

USER:
  {optional: "GOAL for this document: <focus line>"}
  <TITLE>…</TITLE>
  <PARAGRAPH>…</PARAGRAPH>              // one marker per block
  <QA>
    QUESTION: …
    QUESTION_TRANSLATION: …
    GRAMMAR_NOTE: …
    ANSWER: …
    ANSWER_TRANSLATION: …
    ANALYSIS: …
    VOCAB: term|def; term|def
    EXPRESSIONS: term|def; term|def
  </QA>
```

Response: full HTML (or fragment to wrap). Validate per FR-10. Log model + token usage per conversion (FR-31) so cost is visible.

> **Note:** "Copy for AI" (FR-39) exposes exactly this user-section serialization (plus the instructions as the system prompt) so the same prompt can be pasted into any external AI; its HTML output is re-imported via FR-40.

## 10. Proposed Next.js App Structure (planner may refine)

```
writer-app/                    # NEW Next.js app (App Router, TypeScript)
  app/
    page.tsx                   # editor
    library/page.tsx           # document library
    api/
      convert/ai/route.ts      # Edge-friendly: DeepSeek call
      convert/template/route.ts# local HTML generation (Node ok)
      documents/route.ts       # list, create
      documents/[id]/route.ts  # get, update, delete
      documents/[id]/pdf/route.ts   # @react-pdf renderToBuffer — Node or Edge runtime, no Chrome (FR-14/15)
      documents/[id]/html/route.ts  # download HTML
      instructions/route.ts    # get/update active instructions
      export/prompt/route.ts   # GET serialized content + instructions for copy (FR-39)
      documents/import-html/route.ts # POST external HTML → new document (FR-40)
  lib/
    ai.ts                      # DeepSeek client (env-configurable base/model)
    prompt.ts                  # block serialization + prompt assembly
    html-template.ts           # template-mode HTML generator
    tokens.ts                  # parses instructions file TOKENS block → regenerates design-tokens.ts (FR-47)
    design-tokens.ts           # GENERATED: colors/fonts/sizes/spacing → HTML + PDF (FR-43/47)
    pdf.ts                     # @react-pdf/renderer components → PDF buffer (FR-14/15)
    storage.ts                 # storage interface: FS impl now, MongoDB+Blob on Vercel (FR-44)
    validate.ts                # HTML validation/wrapping
  components/
    Editor.tsx, Block.tsx, QaBlockForm.tsx, PreviewPane.tsx, Toolbar.tsx, LibraryList.tsx
  data/                        # runtime storage (gitignored except seed files)
```

**Runtime:** no browser engine anywhere — the entire app runs on **Node or Edge** (or client-side). PDF route: server `renderToBuffer` (recommended) with client-side `usePDF` fallback; AI route: Edge-friendly single `fetch` to DeepSeek; storage is pluggable (FR-44).

## 11. Tech Stack & Decisions

| Concern | Choice |
|---|---|
| Framework | **Next.js (App Router) + TypeScript** — user's explicit requirement |
| PDF | **`@react-pdf/renderer`** — the exact engine Sukhjot already runs in production on Vercel (ResumeBuilder). No Chrome/Puppeteer anywhere; works on Node, Edge, or client-side |
| AI | **DeepSeek API** ("deepseek flash" → fast/cheap model; default `deepseek-chat`, overridable via `DEEPSEEK_MODEL`), via plain `fetch` |
| Storage | Local filesystem (`DATA_DIR`) — single user, local-first; MongoDB + Vercel Blob for Vercel deploy (FR-44) |
| Design system source | **The instructions file** — human prose + machine-readable `TOKENS` block → parsed into `design-tokens.ts` (FR-47). Editing colors/fonts = one file |
| Styling of app UI | Tailwind or plain CSS modules (planner's choice; the *generated documents* follow `html_instructions.md`, not app styling) |
| Package manager | npm (existing projects use npm) |

**Runtime note (read this, planner):** No browser engine exists anywhere in this app — PDFs come from `@react-pdf/renderer` (pure JS), storage is a pluggable interface (FR-44), and the AI route is a single `fetch` to DeepSeek. Result: **every route can run on Node or Edge**, and PDF generation can even happen fully client-side. **Vercel deployment is explicitly supported** (Sukhjot's ResumeBuilder is the proof): PDF via `renderToBuffer` on a server route, document metadata + blocks in **MongoDB**, html/pdf files in **Vercel Blob** — the same storage pattern ResumeBuilder uses. Local development uses the filesystem `DATA_DIR` implementation with zero extra services.

## 12. Environment Variables

| Var | Required | Purpose |
|---|---|---|
| `DEEPSEEK_API_KEY` | for AI mode | DeepSeek API key (AI conversion; without it, Template mode still works) |
| `DEEPSEEK_BASE_URL` | no | Default `https://api.deepseek.com` |
| `DEEPSEEK_MODEL` | no | Default `deepseek-chat` (maps to user's "flash" — fast model) |
| `DATA_DIR` | no | Default `./data` |
| `MONGODB_URI` | for Vercel deploy | MongoDB connection string for document/block storage (ResumeBuilder pattern, FR-44) |
| `BLOB_READ_WRITE_TOKEN` | for Vercel deploy | Vercel Blob token for html/pdf file storage (FR-44) |
| `PORT` | no | Default 3000 |

## 13. Open Questions (planner should pick sensible defaults and note them)

1. Exact DeepSeek model id at build time ("flash" → verify current model list; `deepseek-chat`/`deepseek-reasoner`; keep env-overridable).
2. Should `document.json` also be committed to a git repo for backup/diffing? (Recommend: yes, `data/documents` gitignored but a "export/backup all" button.)
3. Default response label text — keep `RÉPONSE` (French, per existing materials) and make it per-block overridable (already in model).
4. Single-document PDF only, or also "practice mode PDF" (answers hidden) in v1? (Recommend: yes, cheap to add in template mode; AI mode can be flagged `practice: true` in prompt.)
5. Where the app lives: new folder `writer-app/` inside this folder (recommended) vs inside `html2pdf/`.
6. Default visibility on import: **translations and model answers start visible** while editing (recommended — user hides per question or globally as they go), and the practice-mode PDF prints with everything hidden per FR-36. Planner may also suggest a per-document "practice intent" default toggle.
7. Should the AI import also infer a suggested `title` from the question list, and should user answers survive a re-conversion of a document? (Recommend: yes to both — `userAnswer` is never touched by re-conversion.)
8. Scope of the best-effort HTML→blocks parse-back (FR-41): v1 in M5 with `.qa-block`-level fidelity only, or defer? (Recommend: M5, Q&A blocks + paragraphs only; anything unrecognized stays as a paragraph with raw HTML preserved.)
9. PDF generation location: server-side `renderToBuffer` route vs client-side `usePDF` hook. (Recommend: server route with a client-side fallback — both are thin wrappers over the same `pdf.ts` components.)
10. Storage: filesystem-only in v1 (local-first) and add the MongoDB/Blob implementation at Vercel deploy time — or build both from M1? (Recommend: storage **interface** in M1, FS implementation in M1, DB/Blob implementation when the Vercel deploy actually happens.)
11. Token extraction: a structured `TOKENS` block at the end of the instructions file (recommended — deterministic, parser-friendly) vs parsing hex codes out of the prose. The TOKENS block must stay in sync with the prose — keep them adjacent in the file with a note for whoever edits it.
12. Auth provider choice (when the time comes): NextAuth vs Clerk vs custom — **not decided now**; FR-45 only requires the seams (ownerId, storage scoping, optional owner filter on routes). Planner: do NOT add auth to v1.

## 14. Suggested Milestones (for the plan)

- **M1 — Skeleton + offline loop:** scaffold Next.js app; block editor (paragraph + title + heading + separator); template-mode HTML generation per §7; **`tokens.ts` parser seeding `design-tokens.ts` from the instructions file's TOKENS block** (FR-47); preview; **react-pdf components for paragraph/title/heading blocks + PDF route** (FR-14/15); save = json+html+pdf folder layout via the `storage.ts` interface (FR-44, ownerId-aware FR-45). *No AI needed yet.*
- **M2 — Q&A blocks + library + practice controls:** QaBlockForm per FR-4; Q&A template + **react-pdf** generation with vocab grids (number badges, answer boxes, `pageBreakInside: 'avoid'`, all from shared tokens FR-43); `userAnswer` field; per-question 👁 toggles and global hide/show (FR-33–35); practice-mode PDF (FR-16/36) with **blank answer boxes** (FR-49); document library (list/open/re-edit/delete).
- **M3 — DeepSeek integration + question import + copy/paste:** `lib/ai.ts` + `/api/convert/ai`; prompt assembly from active instructions; validation (FR-10); usage logging; error UX (FR-30); **paste-questions import** — AI structuring (FR-32) + local numbered-list parser for offline mode (FR-32); import preview step (FR-38); **Copy for AI** (FR-39) + **Paste HTML back** (FR-40) so the workflow works with any external AI; **selective copy dialog** for sharing (FR-50).
- **M4 — Instructions management:** seed `data/instructions/active.md` from `html_instructions.md`; edit UI; version history; per-document snapshots (FR-21–23); **token regeneration on every save** so design changes apply to new conversions immediately (FR-47).
- **M5 — Polish:** slash commands, keyboard shortcuts, drag-reorder, tags UI, backup/export, README; best-effort **HTML→blocks parse-back** for pasted documents (FR-41); if deploying to Vercel: **MongoDB + Vercel Blob storage implementation** (FR-44).

## 15. Success Criteria

1. Write paragraph + Q&A in the editor → Convert (both AI and Template modes) → styled HTML matching `html_instructions.md` → A4 PDF (react-pdf) that visually matches the HTML preview via the shared design tokens (FR-43).
2. Save a document → reopen a week later → edit source → regenerate both files, **never** touching PDF→text.
3. Edit `html_instructions.md` → new conversions change, old documents don't.
4. Works fully offline in Template mode; AI mode only when key present.
5. Paste 10 questions → structure (AI or local) → answer a few → hide all translations with one click → PDF shows questions + user answers, no translations/model answers → reopen the document, unhide one question's translation, regenerate — everything consistent.
6. Copy a document via "Copy for AI" → paste into an external AI → paste its HTML output back → preview matches the design system, PDF downloads, and (best-effort) the blocks are editable again.
7. Change the accent color in the instructions file → save → the app shows the new color in both the HTML preview and the PDF with zero code changes (FR-47).
8. Copy a document with questions + user answers, translations off → paste into any chat → clean numbered plain text, no HTML (FR-50). Practice PDF hides model answers and shows blank answer boxes (FR-49).

## 16. Out of Scope (v1)

Cloud sync, multi-user, collaborative editing, WYSIWYG HTML editing, mobile apps. **Auth:** not in v1 — anonymous single user by design; FR-45 keeps the app auth-ready so it can be added later without restructuring.

---

## Appendix A — Current Style Instructions (source: `html_instructions.md`)

> _Planner: read `html_instructions.md` at implementation time — it is the authoritative rules file. Summary of the current version (2026-06-era content):_ A4 210×297mm, 18mm margins (14mm in print `@page`); Georgia/Times base 11.5px (10.5px print); main text `#1a1a1a`, headings `#1e3a5f`, accent green `#2c5f2d`, light backgrounds `#f7f9fb`/`#fdfcf9`, borders `#d0d5dc`, table stripes `#f0f3f6`, tags `#e8f0e9` bg / `#2c5f2d` text, number badges `#1e3a5f` bg white text; components: card, highlighted box, data table, toolbox/summary panel; Q&A block: `.qa-block` card with `.qa-question` (flex row: `.qa-num` 24px circular badge + `.qa-question-text` with `<em>` translation), `.qa-grammar-note`, `.qa-response-label`, `.qa-answer`, `.qa-translation`, `.qa-analyse` (bold "Analyse :" label), `.qa-vocab-grid` (`.two-col`/`.one-col`, headers bg `#f7f9fb` uppercase `#1e3a5f`, columns bg `#eef2f7`, term bold `#2c5f2d`, row borders `#d8dfe8`); print: `@page { size: A4; margin: 14mm }`, 10.5px, shadows removed, `.qa-block`/`.card` `break-inside: avoid`; critical rules: content-driven structure only, no auto title pages/TOC, paragraphs get clean styled pages only, never force prose into Q&A blocks.
