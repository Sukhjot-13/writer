// components/PreviewSheet.tsx — full-screen on-demand preview (M6 redesign).
//
// "Preview" opens this sheet instead of an always-on pane. The sheet renders
// styled HTML produced from the CURRENT document (POST /api/preview — stateless,
// unsaved edits included, no convert-first gating). Toggling re-renders
// immediately (no Refresh button — 2026-08-10: it was redundant).
// The iframe is fully sandboxed (sandbox="" → no scripts, no same-origin)
// so generated HTML can never execute (see docs/suggestions.md).
//
// 2026-08-10: field toggles — per-field + overall ("All extras") checkboxes
// hide translations/analyses/vocab/model answers for qa + paragraph/essay
// blocks. Headings, questions and paragraph text are the main content and are
// never hidden. 2026-08-10 #6 (user feedback): the per-field checkboxes were
// INVERTED (checked meant HIDDEN), so the display never matched the selection
// ("the thing that is selected it should show that") — checked now means the
// field IS SHOWN, and "All extras" checked = every extra is visible; clicking
// it selects all four at once. Added the "Empty lines" toggle (blank ruled
// writing areas where the model answer is hidden — the old "questions" sheet).
//
// 2026-08-10 #6 (downloads moved into the preview): the sheet owns the
// downloads — "Download PDF" and "Download HTML" produce EXACTLY the currently
// displayed document (same hidden + emptyLines options). The toolbar's variant
// dropdown is gone; the PDF route renders the current display.

"use client";

import type { PreviewHidden, PreviewOptions } from "@/lib/types";

interface PreviewSheetProps {
  html: string | null;
  busy: boolean;
  options: PreviewOptions;
  onOptionsChange: (next: PreviewOptions) => void;
  onDownloadPdf: () => void;
  onDownloadHtml: () => void;
  onDownloadJson: () => void; // 2026-08-13 (to-do item 7): full-JSON download
  onClose: () => void;
}

const FIELD_LABELS: { key: keyof PreviewHidden; label: string }[] = [
  { key: "translations", label: "Translations" },
  { key: "analyses", label: "Analyses" },
  { key: "vocab", label: "Vocab & expressions" },
  { key: "modelAnswers", label: "Model answers" },
];

export default function PreviewSheet({
  html,
  busy,
  options,
  onOptionsChange,
  onDownloadPdf,
  onDownloadHtml,
  onDownloadJson,
  onClose,
}: PreviewSheetProps) {
  const hidden = options.hidden;
  const anyHidden = FIELD_LABELS.some((f) => hidden[f.key]);
  // 2026-08-10 #6: the master checkbox is checked when NOTHING is hidden, i.e.
  // every extra is VISIBLE (was inverted: checked meant everything hidden —
  // user: "nothing is showing even though all extras is clicked").

  function toggle(key: keyof PreviewHidden) {
    onOptionsChange({ ...options, hidden: { ...hidden, [key]: !hidden[key] } });
  }

  // "All extras": checked = every extra shown. Clicking it from any state where
  // something is hidden SELECTS all four fields (shows everything); clicking it
  // when everything is already shown clears them all.
  function toggleAll() {
    const nextHidden = anyHidden
      ? { translations: false, analyses: false, vocab: false, modelAnswers: false }
      : { translations: true, analyses: true, vocab: true, modelAnswers: true };
    onOptionsChange({ ...options, hidden: nextHidden });
  }

  function toggleEmptyLines() {
    onOptionsChange({ ...options, emptyLines: !options.emptyLines });
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-100">
      <header className="flex flex-wrap items-center gap-3 border-b border-zinc-200 bg-white px-4 py-2.5">
        <h2 className="text-sm font-semibold text-zinc-800">Preview</h2>

        {/* Field toggles: individual + overall ("All extras") + "Empty lines".
            Checked = SHOWN (2026-08-10 #6). Headings, questions and paragraph
            text are never hidden. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs text-zinc-600">
          <span className="font-medium text-zinc-500">Show:</span>
          <label
            className="flex cursor-pointer items-center gap-1"
            title="Select or clear every extra field at once"
          >
            <input
              type="checkbox"
              checked={!anyHidden}
              onChange={toggleAll}
              className="h-3 w-3 accent-blue-600"
            />
            All extras
          </label>
          {FIELD_LABELS.map(({ key, label }) => (
            <label key={key} className="flex cursor-pointer items-center gap-1" title={`Show or hide ${label.toLowerCase()}`}>
              <input
                type="checkbox"
                checked={!hidden[key]}
                onChange={() => toggle(key)}
                className="h-3 w-3 accent-blue-600"
              />
              {label}
            </label>
          ))}
          <label
            className="flex cursor-pointer items-center gap-1 border-l border-zinc-200 pl-3"
            title="Blank ruled writing lines where the model answer is hidden — like the Questions-only sheet"
          >
            <input
              type="checkbox"
              checked={options.emptyLines}
              onChange={toggleEmptyLines}
              className="h-3 w-3 accent-blue-600"
            />
            Empty lines
          </label>
          {anyHidden && (
            <span className="hidden text-[11px] text-zinc-400 lg:inline">
              Headings, questions &amp; paragraph text stay
            </span>
          )}
        </div>

        <span className="hidden text-xs text-zinc-400 sm:inline">
          Rendered from your current document — no saving needed
        </span>

        {/* Downloads live HERE (2026-08-10 #6, user request): the user sees the
            exact document before downloading, so PDF + HTML download what is
            currently displayed. */}
        <span className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onDownloadPdf}
            disabled={busy || !html}
            title="Download the PDF of exactly what is shown"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:bg-zinc-50 disabled:opacity-40"
          >
            Download PDF
          </button>
          <button
            type="button"
            onClick={onDownloadHtml}
            disabled={busy || !html}
            title="Download the HTML of exactly what is shown"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:bg-zinc-50 disabled:opacity-40"
          >
            Download HTML
          </button>
          {/* 2026-08-13 (to-do item 7): the ONLY artifact with every field —
              incl. practice answers — the full-JSON backup of this document. */}
          <button
            type="button"
            onClick={onDownloadJson}
            disabled={busy}
            title="Download this document with ALL its fields (incl. practice answers) as JSON"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:bg-zinc-50 disabled:opacity-40"
          >
            Download JSON
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600"
            title="Close preview"
          >
            ✕
          </button>
        </span>
      </header>

      <div className="flex-1 overflow-auto p-6">
        {html ? (
          // The template renders in printMode (A4 sheet with its own shadow) —
          // the iframe stays transparent so the sheet backdrop shows around it.
          <iframe
            title="Document preview"
            srcDoc={html}
            sandbox=""
            className="mx-auto block min-h-[600px] w-full max-w-[210mm]"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-zinc-400">
            {busy ? "Rendering…" : "No preview yet."}
          </div>
        )}
      </div>
    </div>
  );
}
