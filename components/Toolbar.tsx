// components/Toolbar.tsx — primary actions (FR-29/30/35/37/38/39/46/50):
// Convert (AI) with a "Template (offline)" dropdown option + optional goal,
// Save, Download PDF (gated by FR-46, with practice-mode checkbox FR-16),
// Download HTML, global visibility buttons (FR-35), Copy for AI / sharing
// (FR-39/50), Paste questions / HTML (FR-38/40), preview toggle, title input.

"use client";

import { useState } from "react";
import Link from "next/link";

export type ConvertMode = "ai" | "template";

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
  convertMode: ConvertMode;
  onConvertModeChange: (mode: ConvertMode) => void;
  onConvert: (mode: ConvertMode, goal: string | null) => void;
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
  onCopyPrompt: (part: "user" | "system" | "plainText") => void;
  onOpenCopyDialog: () => void;
  onPasteQuestions: () => void;
  onPasteHtml: () => void;
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

/** Small dropdown menu — closes on outside click via a fixed overlay. */
function Dropdown({
  label,
  disabled,
  items,
  title,
}: {
  label: string;
  disabled?: boolean;
  items: { label: string; onClick: () => void; check?: boolean; hint?: string }[];
  title?: string;
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
          <div className="absolute right-0 z-20 mt-1 min-w-56 rounded-md border border-zinc-200 bg-white py-1 shadow-lg">
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  setOpen(false);
                  item.onClick();
                }}
                title={item.hint}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-50"
              >
                <span className="w-4 text-emerald-600">{item.check ? "✓" : ""}</span>
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function Toolbar({
  title,
  onTitleChange,
  busy,
  error,
  convertMode,
  onConvertModeChange,
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
  onCopyPrompt,
  onOpenCopyDialog,
  onPasteQuestions,
  onPasteHtml,
  showPreview,
  onTogglePreview,
}: ToolbarProps) {
  const [convertOpen, setConvertOpen] = useState(false);
  const [goal, setGoal] = useState("");

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
          {/* Convert split button: primary converts in the current mode, caret
              opens the mode menu (FR-29: "Convert" (AI) + "Template (offline)") */}
          <div className="relative">
            <div className="flex">
              <ActionButton primary onClick={() => onConvert(convertMode, goal || null)} disabled={busy !== null}>
                {busy === "converting"
                  ? "Converting…"
                  : convertMode === "ai"
                    ? "Convert (AI)"
                    : "Convert (Template)"}
              </ActionButton>
              <button
                type="button"
                onClick={() => setConvertOpen((o) => !o)}
                disabled={busy !== null}
                title="Choose conversion mode and optional goal (FR-29)"
                className="rounded-r-md border-l border-blue-700 bg-blue-600 px-2 text-xs text-white hover:bg-blue-700 disabled:opacity-40"
              >
                ▾
              </button>
            </div>
            {convertOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setConvertOpen(false)} />
                <div className="absolute right-0 z-20 mt-1 w-80 rounded-md border border-zinc-200 bg-white py-1 shadow-lg">
                  <button
                    type="button"
                    onClick={() => {
                      setConvertOpen(false);
                      onConvertModeChange("ai");
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                  >
                    <span className="w-4 text-emerald-600">{convertMode === "ai" ? "✓" : ""}</span>
                    Convert (AI) — DeepSeek
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConvertOpen(false);
                      onConvertModeChange("template");
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                  >
                    <span className="w-4 text-emerald-600">{convertMode === "template" ? "✓" : ""}</span>
                    Convert (Template, offline)
                  </button>
                  <div className="my-1 border-t border-zinc-100" />
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
                </div>
              </>
            )}
          </div>

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
          <Dropdown
            label={busy === "copy" ? "Copying…" : "Copy"}
            disabled={busy !== null}
            title="Copy for external AI or for sharing"
            items={[
              { label: "Copy for AI (type markers)", onClick: () => onCopyPrompt("user"), hint: "FR-39 — the §9 prompt's user section, ready for any external AI" },
              { label: "Copy instructions (system prompt)", onClick: () => onCopyPrompt("system"), hint: "FR-39 — the active instructions as a ready-made system prompt" },
              { label: "Copy plain text", onClick: () => onCopyPrompt("plainText"), hint: "FR-39 — paragraphs + Q&A flattened" },
              { label: "Copy for sharing…", onClick: onOpenCopyDialog, hint: "FR-50 — selective clean plain text with checkboxes" },
            ]}
          />
          <Dropdown
            label="Paste"
            disabled={busy !== null}
            title="Paste questions or HTML from any external AI"
            items={[
              { label: "Paste questions…", onClick: onPasteQuestions, hint: "FR-38/32 — structure with AI or parse locally" },
              { label: "Paste HTML…", onClick: onPasteHtml, hint: "FR-40 — import HTML from any external AI" },
            ]}
          />
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
