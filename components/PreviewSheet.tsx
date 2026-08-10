// components/PreviewSheet.tsx — full-screen on-demand preview (M6 redesign).
//
// "Preview" opens this sheet instead of an always-on pane. The sheet renders
// styled HTML produced from the CURRENT document (POST /api/preview — stateless,
// unsaved edits included, no convert-first gating). Refresh re-renders.
// The iframe is fully sandboxed (sandbox="" → no scripts, no same-origin)
// so generated HTML can never execute (see suggestions.md).
//
// 2026-08-10: field toggles — per-field + overall ("All extras") checkboxes
// hide translations/analyses/vocab/model answers for qa + paragraph/essay
// blocks. Headings, questions and paragraph text are the main content and are
// never hidden. Toggling re-renders immediately.

"use client";

export type PreviewHidden = {
  translations: boolean;
  analyses: boolean;
  vocab: boolean;
  modelAnswers: boolean;
};

export const EMPTY_PREVIEW_HIDDEN: PreviewHidden = {
  translations: false,
  analyses: false,
  vocab: false,
  modelAnswers: false,
};

interface PreviewSheetProps {
  html: string | null;
  busy: boolean;
  hidden: PreviewHidden;
  onHiddenChange: (next: PreviewHidden) => void;
  onRefresh: () => void;
  onClose: () => void;
}

const FIELD_LABELS: { key: keyof PreviewHidden; label: string }[] = [
  { key: "translations", label: "Translations" },
  { key: "analyses", label: "Analyses" },
  { key: "vocab", label: "Vocab & expressions" },
  { key: "modelAnswers", label: "Model answers" },
];

export default function PreviewSheet({ html, busy, hidden, onHiddenChange, onRefresh, onClose }: PreviewSheetProps) {
  const anyHidden = FIELD_LABELS.some((f) => hidden[f.key]);
  const allHidden = FIELD_LABELS.every((f) => hidden[f.key]);
  // 2026-08-10 #5 (user-reported): "All extras" was checked when EVERYTHING
  // was hidden (inverted semantics — checked meant nothing showed). Now the
  // checkbox is checked when NOTHING is hidden, i.e. all extras are VISIBLE.

  function toggle(key: keyof PreviewHidden) {
    onHiddenChange({ ...hidden, [key]: !hidden[key] });
  }

  function toggleAll() {
    onHiddenChange(
      Object.fromEntries(FIELD_LABELS.map((f) => [f.key, !allHidden])) as PreviewHidden,
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-100">
      <header className="flex flex-wrap items-center gap-3 border-b border-zinc-200 bg-white px-4 py-2.5">
        <h2 className="text-sm font-semibold text-zinc-800">Preview</h2>
        <button
          type="button"
          onClick={onRefresh}
          disabled={busy}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-40"
        >
          {busy ? "Rendering…" : "Refresh"}
        </button>

        {/* 2026-08-10 field toggles: individual + overall ("All extras") —
            headings, questions and paragraph text are never hidden. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs text-zinc-600">
          <span className="font-medium text-zinc-500">Show:</span>
          <label className="flex cursor-pointer items-center gap-1" title="Hide or show every extra field at once">
            <input type="checkbox" checked={!anyHidden} onChange={toggleAll} className="h-3 w-3 accent-blue-600" />
            All extras
          </label>
          {FIELD_LABELS.map(({ key, label }) => (
            <label key={key} className="flex cursor-pointer items-center gap-1">
              <input
                type="checkbox"
                checked={hidden[key]}
                onChange={() => toggle(key)}
                className="h-3 w-3 accent-blue-600"
              />
              {label}
            </label>
          ))}
          {anyHidden && (
            <span className="hidden text-[11px] text-zinc-400 lg:inline">
              Headings, questions &amp; paragraph text stay
            </span>
          )}
        </div>

        <span className="hidden text-xs text-zinc-400 sm:inline">
          Rendered from your current document — no saving needed
        </span>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600"
          title="Close preview"
        >
          ✕
        </button>
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
            {busy ? "Rendering…" : "No preview yet — click Refresh."}
          </div>
        )}
      </div>
    </div>
  );
}
