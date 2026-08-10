// components/Toolbar.tsx — primary actions (FR-29/30/35/37/38/39/46/50).
//
// Layout (M5 UI polish): a title row (brand · title · tags · nav links) and
// an actions row with the controls grouped — Convert ▾ (primary split) ·
// Save · Practice toggle · Download ▾ · View ▾ · Copy ▾ · Paste ▾. Stateful
// toggles (hide/show answers, preview pane, practice mode) live inside the
// dropdowns as checkmarked items so the row stays uncluttered.

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { parseTags } from "@/lib/tags";

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
  docTags: string[]; // M5: document tags shown in the library (FR-18)
  onTagsChange: (tags: string[]) => void;
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
  snapshotInfo: { version: string; differs: boolean } | null; // FR-23
  useSnapshot: boolean;
  onToggleSnapshot: () => void;
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
  snapshotInfo,
  useSnapshot,
  onToggleSnapshot,
  showPreview,
  onTogglePreview,
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
            New
          </Link>
        </nav>
      </div>

      {/* Actions row: grouped controls */}
      <div className="flex flex-wrap items-center gap-2 px-4 pb-2.5 pt-1.5">
        {/* Convert split button: primary converts in the current mode, caret
            opens the mode menu (FR-29: "Convert" (AI) + "Template (offline)") */}
        <div className="relative">
          <div className="flex overflow-hidden rounded-lg shadow-sm">
            <button
              type="button"
              onClick={() => onConvert(convertMode, goal || null)}
              disabled={busy !== null}
              className="bg-blue-600 px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy === "converting"
                ? "Converting…"
                : convertMode === "ai"
                  ? "Convert with AI"
                  : "Convert (template)"}
            </button>
            <button
              type="button"
              onClick={() => setConvertOpen((o) => !o)}
              disabled={busy !== null}
              title="Choose conversion mode and optional goal"
              className="border-l border-blue-700/60 bg-blue-600 px-2 text-xs text-white transition-colors hover:bg-blue-700 disabled:opacity-40"
            >
              ▾
            </button>
          </div>
          {convertOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setConvertOpen(false)} />
              <div className="absolute left-0 z-20 mt-1 w-80 rounded-lg border border-zinc-200 bg-white py-1 shadow-xl">
                <button
                  type="button"
                  onClick={() => {
                    setConvertOpen(false);
                    onConvertModeChange("ai");
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                >
                  <span className="w-4 text-emerald-600">{convertMode === "ai" ? "✓" : ""}</span>
                  Convert with AI — DeepSeek
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
                  Convert with template (offline)
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

        <label
          className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 transition-colors hover:border-zinc-400 hover:bg-zinc-50"
          title="Practice mode: translations and model answers are omitted and unanswered questions get blank answer areas"
        >
          <input
            type="checkbox"
            checked={practiceMode}
            onChange={onTogglePractice}
            className="h-3.5 w-3.5 accent-blue-600"
          />
          Practice
        </label>

        <Dropdown
          label="Download"
          disabled={busy !== null}
          title="PDF (needs a fresh preview) or HTML of the document"
          items={[
            {
              label: "Download PDF",
              onClick: onDownloadPdf,
              disabled: !canDownloadPdf,
              hint: canDownloadPdf ? "A4 PDF generated from your blocks" : "Convert first — the PDF reflects the preview",
            },
            { label: "Download HTML", onClick: onDownloadHtml },
          ]}
        />
        <Dropdown
          label="View"
          disabled={busy !== null}
          title="Visibility of translations, answers, and the preview pane"
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
            { label: "—", onClick: () => {}, check: false },
            { label: "Preview pane", check: showPreview, onClick: onTogglePreview },
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
          title="Paste questions or HTML from any external AI"
          items={[
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
