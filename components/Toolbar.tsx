// components/Toolbar.tsx — primary actions (FR-29/30/35/37/46):
// Convert (Template), Save, Download PDF (gated by FR-46, with practice-mode
// checkbox FR-16), Download HTML, global visibility buttons (FR-35),
// preview toggle, and the document title input.

"use client";

import Link from "next/link";

export interface VisibilityCounts {
  translationsHidden: number;
  translationsTotal: number;
  answersHidden: number;
  answersTotal: number;
}

interface ToolbarProps {
  title: string;
  onTitleChange: (value: string) => void;
  busy: string | null;
  error: string | null;
  onConvert: () => void;
  onSave: () => void;
  canDownloadPdf: boolean;
  practiceMode: boolean;
  onTogglePractice: () => void;
  onDownloadPdf: () => void;
  onDownloadHtml: () => void;
  counts: VisibilityCounts;
  onHideAllTranslations: () => void;
  onShowAllTranslations: () => void;
  onHideAllAnswers: () => void;
  onShowAllAnswers: () => void;
  showPreview: boolean;
  onTogglePreview: () => void;
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
    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40";
  const styles = primary
    ? "bg-blue-600 text-white hover:bg-blue-700 disabled:hover:bg-blue-600"
    : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50";
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title} className={`${base} ${styles}`}>
      {children}
    </button>
  );
}

export default function Toolbar({
  title,
  onTitleChange,
  busy,
  error,
  onConvert,
  onSave,
  canDownloadPdf,
  practiceMode,
  onTogglePractice,
  onDownloadPdf,
  onDownloadHtml,
  counts,
  onHideAllTranslations,
  onShowAllTranslations,
  onHideAllAnswers,
  onShowAllAnswers,
  showPreview,
  onTogglePreview,
}: ToolbarProps) {
  const noQa = counts.translationsTotal === 0;
  const allTranslationsHidden = counts.translationsTotal > 0 && counts.translationsHidden === counts.translationsTotal;
  const allAnswersHidden = counts.answersTotal > 0 && counts.answersHidden === counts.answersTotal;

  return (
    <div className="border-b border-zinc-200 bg-white px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-sm font-semibold text-zinc-800">Writer</span>
        <input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Untitled document"
          className="w-56 rounded-md border border-transparent bg-zinc-50 px-2 py-1.5 text-sm text-zinc-700 outline-none placeholder:text-zinc-400 focus:border-blue-400 focus:bg-white"
        />

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <ActionButton primary onClick={onConvert} disabled={busy !== null} title="Cmd/Ctrl+Enter">
            {busy === "converting" ? "Converting…" : "Convert (Template)"}
          </ActionButton>
          <ActionButton onClick={onSave} disabled={busy !== null} title="Cmd/Ctrl+S">
            {busy === "saving" ? "Saving…" : "Save"}
          </ActionButton>
          <label
            className="flex cursor-pointer items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
            title="Practice mode: translations and model answers omitted, blank answer areas (FR-16/49)"
          >
            <input
              type="checkbox"
              checked={practiceMode}
              onChange={onTogglePractice}
              className="h-3.5 w-3.5 accent-blue-600"
            />
            Practice PDF
          </label>
          <ActionButton
            onClick={onDownloadPdf}
            disabled={!canDownloadPdf || busy !== null}
            title={canDownloadPdf ? "Download A4 PDF" : "Convert first — the PDF reflects the preview (FR-46)"}
          >
            {busy === "pdf" ? "Preparing PDF…" : "Download PDF"}
          </ActionButton>
          <ActionButton onClick={onDownloadHtml} disabled={busy !== null}>
            Download HTML
          </ActionButton>
          <ActionButton
            onClick={allTranslationsHidden ? onShowAllTranslations : onHideAllTranslations}
            disabled={noQa || busy !== null}
            title="FR-35: hide or show every question translation in one click"
          >
            {allTranslationsHidden ? "Show all translations" : "Hide all translations"}
          </ActionButton>
          <ActionButton
            onClick={allAnswersHidden ? onShowAllAnswers : onHideAllAnswers}
            disabled={noQa || busy !== null}
            title="FR-35: hide or show every model answer in one click"
          >
            {allAnswersHidden ? "Show all answers" : "Hide all answers"}
          </ActionButton>
          <ActionButton onClick={onTogglePreview}>
            {showPreview ? "Hide preview" : "Show preview"}
          </ActionButton>
          <Link
            href="/library"
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Library
          </Link>
          <Link
            href="/"
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            New
          </Link>
        </div>
      </div>
      {error && (
        <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}
