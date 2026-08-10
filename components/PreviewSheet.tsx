// components/PreviewSheet.tsx — full-screen on-demand preview (M6 redesign).
//
// "Preview" opens this sheet instead of an always-on pane. The sheet renders
// styled HTML produced from the CURRENT document (POST /api/preview — stateless,
// unsaved edits included, no convert-first gating). Refresh re-renders.
// The iframe is fully sandboxed (sandbox="" → no scripts, no same-origin)
// so generated HTML can never execute (see suggestions.md).

"use client";

interface PreviewSheetProps {
  html: string | null;
  busy: boolean;
  onRefresh: () => void;
  onClose: () => void;
}

export default function PreviewSheet({ html, busy, onRefresh, onClose }: PreviewSheetProps) {
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
          <iframe
            title="Document preview"
            srcDoc={html}
            sandbox=""
            className="mx-auto block min-h-[600px] w-full max-w-[210mm] bg-white shadow-[0_2px_6px_rgba(0,0,0,0.08),0_12px_32px_rgba(0,0,0,0.14)]"
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
