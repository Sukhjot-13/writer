// components/Toolbar.tsx — primary actions (M6 redesign, FR-29/30/35/37/38/39/46/50).
//
// Layout: a title row (brand · title · tags · nav links) and an actions row —
// Convert with AI ▾ (primary split) · Save · Preview · Practice + Check · Download ▾ ·
// View ▾ · Copy ▾ · Paste ▾. Stateful toggles live inside the dropdowns as
// checkmarked items so the row stays uncluttered.
//
// M6 changes: single AI convert (template mode dropped); on-demand Preview;
// Practice as the master key with a Check/Hide-answers button; three PDF
// variants (full · questions · questions + my answers).

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import type { PDFVariant } from "@/lib/pdf";
import { parseTags } from "@/lib/tags";

export interface VisibilityCounts {
  translationsHidden: number;
  translationsTotal: number;
  answersHidden: number;
  answersTotal: number;
}

interface ToolbarProps {
  title: string;
  onTitleChange: (value: string) => void;
  docTags: string[]; // M5: document tags shown in the library (FR-18)
  onTagsChange: (tags: string[]) => void;
  busy: string | null;
  error: string | null;
  onConvert: (goal: string | null) => void;
  onSave: () => void;
  onPreview: () => void; // M6: open the full-screen preview sheet
  practiceMode: boolean;
  onTogglePractice: () => void;
  checked: boolean; // M6: practice "Check" — reveals model answers
  onToggleChecked: () => void;
  onResetPractice: () => void;
  onDownloadPdf: (variant: PDFVariant) => void;
  onDownloadHtml: () => void;
  counts: VisibilityCounts;
  onHideAllTranslations: () => void;
  onShowAllTranslations: () => void;
  onHideAllAnswers: () => void;
  onShowAllAnswers: () => void;
  onCopyPrompt: (part: "user" | "system" | "plainText") => void;
  onOpenCopyDialog: () => void;
  onPasteQuestions: () => void;
  onPasteBlocks: () => void; // M6: paste the JSON block array from Copy for AI
  onPasteHtml: () => void;
  snapshotInfo: { version: string; differs: boolean } | null; // FR-23
  useSnapshot: boolean;
  onToggleSnapshot: () => void;
}

function ActionButton({
  onClick,
  disabled,
  primary,
  children,
  title,
}: {
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  children: React.ReactNode;
  title?: string;
}) {
  const base =
    "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40";
  const styles = primary
    ? "bg-blue-600 text-white shadow-sm hover:bg-blue-700"
    : "border border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50";
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title} className={`${base} ${styles}`}>
      {children}
    </button>
  );
}

/** Small dropdown menu — closes on outside click via a fixed overlay. */
function Dropdown({
  label,
  disabled,
  items,
  title,
  align = "right",
}: {
  label: string;
  disabled?: boolean;
  items: { label: string; onClick: () => void; check?: boolean; hint?: string; disabled?: boolean }[];
  title?: string;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <ActionButton onClick={() => setOpen((o) => !o)} disabled={disabled} title={title}>
        {label} <span className="ml-0.5 text-xs opacity-60">▾</span>
      </ActionButton>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className={`absolute z-20 mt-1 min-w-56 rounded-lg border border-zinc-200 bg-white py-1 shadow-xl ${
              align === "right" ? "right-0" : "left-0"
            }`}
          >
            {items.map((item, i) =>
              item.label === "—" ? (
                <div key={i} className="my-1 border-t border-zinc-100" />
              ) : (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    item.onClick();
                  }}
                  disabled={item.disabled}
                  title={item.hint}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  <span className="w-4 shrink-0 text-emerald-600">{item.check ? "✓" : ""}</span>
                  {item.label}
                </button>
              ),
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function Toolbar({
  title,
  onTitleChange,
  docTags,
  onTagsChange,
  busy,
  error,
  onConvert,
  onSave,
  onPreview,
  practiceMode,
  onTogglePractice,
  checked,
  onToggleChecked,
  onResetPractice,
  onDownloadPdf,
  onDownloadHtml,
  counts,
  onHideAllTranslations,
  onShowAllTranslations,
  onHideAllAnswers,
  onShowAllAnswers,
  onCopyPrompt,
  onOpenCopyDialog,
  onPasteQuestions,
  onPasteBlocks,
  onPasteHtml,
  snapshotInfo,
  useSnapshot,
  onToggleSnapshot,
}: ToolbarProps) {
  const [convertOpen, setConvertOpen] = useState(false);
  const [goal, setGoal] = useState("");
  const [tagsDraft, setTagsDraft] = useState(docTags.join(", "));
  useEffect(() => setTagsDraft(docTags.join(", ")), [docTags]);

  const noQa = counts.translationsTotal === 0;
  const allTranslationsHidden = counts.translationsTotal > 0 && counts.translationsHidden === counts.translationsTotal;
  const allAnswersHidden = counts.answersTotal > 0 && counts.answersHidden === counts.answersTotal;

  return (
    <div className="border-b border-zinc-200 bg-white">
      {/* Title row: brand · title · tags · nav */}
      <div className="flex flex-wrap items-center gap-2 px-4 pt-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-sm text-white">
          ✎
        </span>
        <span className="hidden text-sm font-semibold text-zinc-800 sm:inline">Writer</span>

        <input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Untitled document"
          className="min-w-40 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-lg font-semibold text-zinc-900 outline-none placeholder:font-normal placeholder:text-zinc-300 focus:border-zinc-200 focus:bg-white"
        />
        <input
          value={tagsDraft}
          onChange={(e) => setTagsDraft(e.target.value)}
          onBlur={() => onTagsChange(parseTags(tagsDraft))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
          }}
          placeholder="add tags…"
          title="Document tags, comma-separated — used for filtering in the library"
          className="w-36 rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-xs text-zinc-500 outline-none placeholder:text-zinc-300 focus:border-zinc-200 focus:bg-white focus:text-zinc-700"
        />

        <nav className="flex items-center gap-1">
          <Link href="/instructions" className="rounded-lg px-2.5 py-1.5 text-sm text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900">
            Instructions
          </Link>
          <Link href="/library" className="rounded-lg px-2.5 py-1.5 text-sm text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900">
            Library
          </Link>
          <Link href="/" className="rounded-lg px-2.5 py-1.5 text-sm text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900">
            Home
          </Link>
        </nav>
      </div>

      {/* Actions row: grouped controls */}
      <div className="flex flex-wrap items-center gap-2 px-4 pb-2.5 pt-1.5">
        {/* Convert with AI split button: primary converts, caret opens the
            goal input + snapshot-rules toggle (M6: AI only — template dropped) */}
        <div className="relative">
          <div className="flex overflow-hidden rounded-lg shadow-sm">
            <button
              type="button"
              onClick={() => onConvert(goal || null)}
              disabled={busy !== null}
              className="bg-blue-600 px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy === "converting" ? "Converting…" : "Convert with AI"}
            </button>
            <button
              type="button"
              onClick={() => setConvertOpen((o) => !o)}
              disabled={busy !== null}
              title="Optional goal and conversion options"
              className="border-l border-blue-700/60 bg-blue-600 px-2 text-xs text-white transition-colors hover:bg-blue-700 disabled:opacity-40"
            >
              ▾
            </button>
          </div>
          {convertOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setConvertOpen(false)} />
              <div className="absolute left-0 z-20 mt-1 w-80 rounded-lg border border-zinc-200 bg-white py-1 shadow-xl">
                <div className="px-3 py-1.5">
                  <label className="text-xs font-medium text-zinc-500" htmlFor="convert-goal">
                    Goal (optional)
                  </label>
                  <input
                    id="convert-goal"
                    value={goal}
                    onChange={(e) => setGoal(e.target.value)}
                    placeholder="e.g. Make it about holidays in Paris"
                    className="mt-1 w-full rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-sm text-zinc-700 outline-none placeholder:text-zinc-300 focus:border-blue-400 focus:bg-white"
                  />
                </div>
                {snapshotInfo && (
                  <>
                    <div className="my-1 border-t border-zinc-100" />
                    <label className="flex cursor-pointer items-start gap-2 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50">
                      <input
                        type="checkbox"
                        checked={useSnapshot}
                        onChange={onToggleSnapshot}
                        className="mt-0.5 h-3.5 w-3.5 accent-blue-600"
                      />
                      <span>
                        Convert with this document&apos;s snapshot rules (v{snapshotInfo.version})
                        {snapshotInfo.differs ? " — differs from active" : ""}
                        <span className="block text-xs text-zinc-400">
                          Uses the instructions this document was made with
                        </span>
                      </span>
                    </label>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        <ActionButton onClick={onSave} disabled={busy !== null} title="Cmd/Ctrl+S">
          {busy === "saving" ? "Saving…" : "Save"}
        </ActionButton>

        <ActionButton onClick={onPreview} disabled={busy !== null} title="Preview the current document — unsaved edits included">
          {busy === "preview" ? "Rendering…" : "Preview"}
        </ActionButton>

        {/* Practice master key: every question + paragraph gets a "My answer"
            box. Check reveals the reference answers side-by-side (M6:
            Answer → check → save). */}
        <label
          className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 transition-colors hover:border-zinc-400 hover:bg-zinc-50"
          title="Practice mode: write 'My answer' under every question and paragraph"
        >
          <input
            type="checkbox"
            checked={practiceMode}
            onChange={onTogglePractice}
            className="h-3.5 w-3.5 accent-blue-600"
          />
          Practice
        </label>

        {practiceMode && (
          <button
            type="button"
            onClick={onToggleChecked}
            disabled={busy !== null}
            title={checked ? "Hide the reference answers again" : "Reveal the reference answer for every question and paragraph"}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              checked
                ? "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
                : "border border-emerald-300 bg-emerald-50 text-emerald-700 hover:border-emerald-400 hover:bg-emerald-100"
            }`}
          >
            {checked ? "Hide answers" : "Check answers"}
          </button>
        )}

        <Dropdown
          label="Download"
          disabled={busy !== null}
          title="PDF variants or HTML of the document — rendered instantly from the current content"
          items={[
            {
              label: "Download PDF",
              onClick: () => onDownloadPdf("full"),
              hint: "Full document — questions, answers and enrichment",
            },
            {
              label: "Questions only (share)",
              onClick: () => onDownloadPdf("questions"),
              hint: "Shareable practice sheet — questions + blank lines",
            },
            {
              label: "Questions + my answers",
              onClick: () => onDownloadPdf("my-answers"),
              hint: "After practice — send your answers for checking",
            },
            { label: "—", onClick: () => {}, check: false },
            { label: "Download HTML", onClick: onDownloadHtml, hint: "Legacy styled-HTML export" },
          ]}
        />
        <Dropdown
          label="View"
          disabled={busy !== null}
          title="Visibility of translations, answers, and practice data"
          items={[
            {
              label: allTranslationsHidden ? "Show all translations" : "Hide all translations",
              onClick: allTranslationsHidden ? onShowAllTranslations : onHideAllTranslations,
              disabled: noQa,
              hint: noQa ? "No questions in this document" : "Hide or show every question translation in one click",
            },
            {
              label: allAnswersHidden ? "Show all answers" : "Hide all answers",
              onClick: allAnswersHidden ? onShowAllAnswers : onHideAllAnswers,
              disabled: noQa,
              hint: noQa ? "No questions in this document" : "Hide or show every model answer in one click",
            },
            ...(practiceMode
              ? [
                  { label: "—", onClick: () => {}, check: false },
                  {
                    label: "Reset practice answers…",
                    onClick: onResetPractice,
                    hint: "Clears every 'My answer' so you can practice again",
                  },
                ]
              : []),
          ]}
        />
        <Dropdown
          label={busy === "copy" ? "Copying…" : "Copy"}
          disabled={busy !== null}
          title="Copy for an external AI or for sharing"
          items={[
            { label: "Copy for AI (type markers)", onClick: () => onCopyPrompt("user"), hint: "The document as type-marked text, ready for any external AI" },
            { label: "Copy instructions (system prompt)", onClick: () => onCopyPrompt("system"), hint: "The active instructions as a ready-made system prompt" },
            { label: "Copy plain text", onClick: () => onCopyPrompt("plainText"), hint: "Paragraphs and Q&A flattened to plain text" },
            { label: "Copy for sharing…", onClick: onOpenCopyDialog, hint: "Select exactly what to copy as clean text" },
          ]}
        />
        <Dropdown
          label="Paste"
          disabled={busy !== null}
          title="Paste blocks, questions, or HTML from any external AI"
          items={[
            { label: "Paste blocks (AI)…", onClick: onPasteBlocks, hint: "JSON block array copied via Copy for AI" },
            { label: "Paste questions…", onClick: onPasteQuestions, hint: "Structure with AI or parse locally" },
            { label: "Paste HTML…", onClick: onPasteHtml, hint: "Import HTML from any external AI" },
          ]}
        />
      </div>

      {error && (
        <div className="border-t border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      )}
    </div>
  );
}
