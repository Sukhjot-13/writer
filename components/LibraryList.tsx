// components/LibraryList.tsx — document cards: title, date, block count, tags;
// open (→ editor with ?id=), Regenerate (FR-20), delete (FR-19), and a
// client-side sort control (updated / created / title).

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import type { Document } from "@/lib/types";

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

type SortKey = "updated" | "created" | "title";

export default function LibraryList({ documents }: { documents: Document[] }) {
  const router = useRouter();
  const [sort, setSort] = useState<SortKey>("updated");
  const [regenerating, setRegenerating] = useState<string | null>(null);

  const sorted = useMemo(() => {
    const docs = [...documents];
    if (sort === "updated") docs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    if (sort === "created") docs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (sort === "title") docs.sort((a, b) => a.title.localeCompare(b.title));
    return docs;
  }, [documents, sort]);

  async function remove(doc: Document) {
    if (!window.confirm(`Delete "${doc.title || "Untitled"}"? This removes the whole folder (JSON, HTML, PDF).`)) {
      return;
    }
    const res = await fetch(`/api/documents/${doc.id}`, { method: "DELETE" });
    if (!res.ok) {
      alert("Delete failed — see server logs.");
      return;
    }
    router.refresh();
  }

  async function regenerate(doc: Document) {
    if (regenerating) return;
    setRegenerating(doc.id);
    try {
      const res = await fetch(`/api/documents/${doc.id}/regenerate`, { method: "POST" });
      if (!res.ok) {
        alert("Regenerate failed — see server logs.");
        return;
      }
      router.refresh();
    } finally {
      setRegenerating(null);
    }
  }

  if (documents.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-300 p-12 text-center text-sm text-zinc-400">
        Documents you save appear here — open the editor, write, convert, and save.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-2 text-sm text-zinc-500">
        <span>Sort:</span>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="rounded border border-zinc-200 bg-white px-2 py-1 text-sm text-zinc-700"
        >
          <option value="updated">Last updated</option>
          <option value="created">Date created</option>
          <option value="title">Title</option>
        </select>
      </div>

      <ul className="grid gap-4 sm:grid-cols-2">
        {sorted.map((doc) => (
          <li key={doc.id} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <Link href={`/?id=${doc.id}`} className="min-w-0">
                <h2 className="truncate font-medium text-zinc-900 hover:text-blue-700">
                  {doc.title || "Untitled"}
                </h2>
              </Link>
              <button
                type="button"
                onClick={() => void remove(doc)}
                className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50"
                title="Delete document"
              >
                Delete
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
              <span>{formatDate(doc.updatedAt)}</span>
              <span className="text-zinc-300">·</span>
              <span>
                {doc.blocks.length} block{doc.blocks.length === 1 ? "" : "s"}
              </span>
              {doc.tags.length > 0 && (
                <>
                  <span className="text-zinc-300">·</span>
                  <span className="flex flex-wrap gap-1">
                    {doc.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] uppercase text-zinc-600"
                      >
                        {tag}
                      </span>
                    ))}
                  </span>
                </>
              )}
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => void regenerate(doc)}
                disabled={regenerating === doc.id}
                title="Re-convert from JSON and re-render the PDF (FR-20)"
                className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                {regenerating === doc.id ? "Regenerating…" : "↻ Regenerate"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
