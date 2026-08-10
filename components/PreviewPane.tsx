// components/PreviewPane.tsx — live A4 preview of the generated HTML in a
// sandboxed iframe (FR-13/27). Enforces FR-46 gating visually: no preview →
// placeholder; stale after edits → "Stale" badge until a fresh conversion.
//
// The iframe is fully sandboxed (sandbox="" → no scripts, no same-origin)
// so generated/pasted HTML can never execute (see suggestions.md).

"use client";

interface PreviewPaneProps {
  html: string | null;
  stale: boolean;
  convertedAt: number | null;
}

export default function PreviewPane({ html, stale, convertedAt }: PreviewPaneProps) {
  if (!html) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-zinc-50 p-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-dashed border-zinc-300 text-2xl">
          📄
        </div>
        <p className="max-w-xs text-sm leading-relaxed text-zinc-500">
          No preview yet. Click <strong className="font-semibold text-zinc-700">Convert with AI</strong> or{" "}
          <strong className="font-semibold text-zinc-700">Convert (template)</strong> in the toolbar to
          generate styled HTML from your blocks.
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-full bg-zinc-200/50">
      {stale && (
        <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2 whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 shadow-sm">
          Edits since preview — convert again to refresh
        </div>
      )}
      {convertedAt && !stale && (
        <div className="absolute right-3 top-3 z-10 rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-medium text-emerald-700 shadow-sm">
          Preview · {new Date(convertedAt).toLocaleTimeString()}
        </div>
      )}
      <div className="h-full overflow-auto p-6">
        <iframe
          title="Document preview"
          srcDoc={html}
          sandbox=""
          className="mx-auto block h-full min-h-[600px] w-full max-w-[210mm] bg-white shadow-[0_2px_6px_rgba(0,0,0,0.08),0_12px_32px_rgba(0,0,0,0.14)]"
        />
      </div>
    </div>
  );
}
