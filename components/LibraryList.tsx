// components/LibraryList.tsx — document cards: title, date, block count, tags;
// open (→ editor at /doc/<id>, M6), Regenerate (FR-20), delete (FR-19), and a
// client-side sort control (updated / created / title).

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import type { Document } from "@/lib/types";
import NewDocumentButton from "./NewDocumentButton"; // M6: fresh doc + navigate

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
  const [filterTag, setFilterTag] = useState<string | null>(null); // M5: tag filter
  const [downloadingBackup, setDownloadingBackup] = useState(false); // M5: backup zip

  // M5: every distinct tag across the library, most-used first — clickable filter chips.
  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const doc of documents) {
      for (const tag of doc.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([tag]) => tag);
  }, [documents]);

  const filtered = useMemo(
    () => (filterTag ? documents.filter((d) => d.tags.includes(filterTag)) : documents),
    [documents, filterTag],
  );

  const sorted = useMemo(() => {
    const docs = [...filtered];
    if (sort === "updated") docs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    if (sort === "created") docs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (sort === "title") docs.sort((a, b) => a.title.localeCompare(b.title));
    return docs;
  }, [filtered, sort]);

  // M5: one-click backup of the whole library (zip of every document folder).
  async function downloadBackup() {
    if (downloadingBackup) return;
    setDownloadingBackup(true);
    try {
      const res = await fetch("/api/documents/backup");
      if (!res.ok) {
        alert("Backup failed — see server logs.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const match = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "");
      a.download = match?.[1] ?? "writer-app-backup.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloadingBackup(false);
    }
  }

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
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-zinc-300 bg-white p-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-dashed border-zinc-300 text-2xl">
          📚
        </div>
        <p className="max-w-sm text-sm leading-relaxed text-zinc-500">
          Documents you save appear here. Open the editor, write some blocks, convert, and save.
        </p>
        <NewDocumentButton className="mt-1 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        >
          <option value="updated">Sort: last updated</option>
          <option value="created">Sort: date created</option>
          <option value="title">Sort: title</option>
        </select>
        <div className="flex flex-wrap items-center gap-1.5">
          {allTags.length === 0 && <span className="text-xs text-zinc-400">no tags yet</span>}
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setFilterTag(filterTag === tag ? null : tag)}
              title="Filter the library by this tag"
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                filterTag === tag
                  ? "bg-blue-600 text-white"
                  : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-100 hover:ring-zinc-300"
              }`}
            >
              #{tag}
            </button>
          ))}
          {filterTag && (
            <button
              type="button"
              onClick={() => setFilterTag(null)}
              className="rounded-full px-2 py-1 text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
            >
              clear filter
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => void downloadBackup()}
          disabled={downloadingBackup}
          title="Download a zip of every document folder (JSON + HTML + PDF + snapshot)"
          className="ml-auto rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:bg-zinc-50 disabled:opacity-50"
        >
          {downloadingBackup ? "Packaging…" : "⬇ Backup zip"}
        </button>
      </div>

      {filterTag && (
        <p className="mb-3 text-xs text-zinc-500">
          Showing {sorted.length} document{sorted.length === 1 ? "" : "s"} tagged{" "}
          <strong className="font-semibold text-zinc-700">#{filterTag}</strong>
        </p>
      )}

      <ul className="grid gap-4 sm:grid-cols-2">
        {sorted.map((doc) => (
          <li
            key={doc.id}
            className="group rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-px hover:border-zinc-300 hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-2">
              <Link href={`/doc/${doc.id}`} className="min-w-0">
                <h2 className="truncate text-[15px] font-semibold text-zinc-900 group-hover:text-blue-700">
                  {doc.title || "Untitled"}
                </h2>
              </Link>
              <button
                type="button"
                onClick={() => void remove(doc)}
                className="rounded-lg px-2 py-1 text-xs text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-50 hover:text-red-600"
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
                        className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium uppercase text-zinc-600"
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
                title="Re-convert from JSON and re-render the PDF"
                className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:bg-zinc-50 disabled:opacity-50"
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
