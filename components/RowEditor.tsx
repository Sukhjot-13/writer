// components/RowEditor.tsx — shared form primitives (M6 redesign).
//
// Extracted from QaBlockForm so Q&A cards and paragraph enrichment
// (ParagraphFields) share identical styling and the term/def row editor
// (vocabulary / expressions lists).

"use client";

export const inputCls =
  "w-full rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-[14px] leading-relaxed text-zinc-800 outline-none placeholder:text-zinc-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
export const labelCls = "mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500";

export function RowEditor({
  rows,
  onRows,
  placeholderTerm,
  placeholderDef,
  termCls,
}: {
  rows: { term: string; def: string }[];
  onRows: (rows: { term: string; def: string }[]) => void;
  placeholderTerm: string;
  placeholderDef: string;
  termCls: string;
}) {
  return (
    <div className="space-y-1.5">
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input
            className={`${inputCls} flex-1 ${termCls}`}
            value={row.term}
            placeholder={placeholderTerm}
            onChange={(e) => {
              const next = [...rows];
              next[i] = { ...next[i], term: e.target.value };
              onRows(next);
            }}
          />
          <input
            className={`${inputCls} flex-1`}
            value={row.def}
            placeholder={placeholderDef}
            onChange={(e) => {
              const next = [...rows];
              next[i] = { ...next[i], def: e.target.value };
              onRows(next);
            }}
          />
          <button
            type="button"
            onClick={() => onRows(rows.filter((_, j) => j !== i))}
            className="rounded px-1.5 text-xs text-zinc-300 hover:text-red-500"
            title="Remove row"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onRows([...rows, { term: "", def: "" }])}
        className="rounded border border-dashed border-zinc-300 px-2 py-1 text-xs text-zinc-400 hover:border-blue-400 hover:text-blue-500"
      >
        + Add row
      </button>
    </div>
  );
}
