// components/LibraryList.tsx — document cards: title, date, block count, tags;
// open (→ editor at /doc/<id>, M6), download-all-fields ⬇ (2026-08-10 M7
// round 6b), delete (FR-19), a client-side sort control (updated / created /
// title), and the folder bar.
//
// 2026-08-10 M7 round 6 (user feedback): no more browser popups — deleting a
// document is a two-step IN-APP confirm inside the card (Delete → red confirm
// banner → Delete/Cancel), and failures surface as an inline error banner
// instead of alert(). The library page also gains folders: a folder chip bar
// with create / rename / delete (deleting a folder only unfiles its
// documents), a per-card "move to folder" select, and a folder filter.
//
// 2026-08-10 M7 round 6b (user: "folder shows as a tag… when I click on it
// and make a document in there it doesn't automatically move it there…
// Document card should be the same on the home and the library page"):
//   - the folder bar renders on HOME too (not just the library);
//   - every card carries the same "move to folder" select on both pages;
//   - with a folder selected, "+ New document in 'folder'" files the new
//     document into it from the very first save;
//   - ↻ Regenerate left the card (the editor still offers it) and the card
//     gained ⬇, which downloads the document with ALL its fields as JSON.
//
// Props:
//   documents — the documents to show. Home passes the FULL list (counts and
//               folder chips are then accurate) plus limit/total; the library
//               page passes everything.
//   folders   — library folders.
//   recent    — home mode: hides the sort/tags/backup toolbar, shows a
//               "view all in the Library" link when there are more documents.
//               The folder bar and the per-card move control DO render here
//               (2026-08-10 M7 round 6b — cards identical on home and library).
//   limit     — when `recent`, only the first `limit` documents become cards
//               (they arrive sorted by updatedAt desc); counts still use all.
//   total     — full document count when `recent` (the list is a slice).

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import type { Document, Folder } from "@/lib/types";
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

export default function LibraryList({
  documents,
  folders = [],
  recent = false,
  limit,
  total,
}: {
  documents: Document[];
  folders?: Folder[];
  recent?: boolean;
  limit?: number;
  total?: number;
}) {
  const router = useRouter();
  const [sort, setSort] = useState<SortKey>("updated");
  const [filterTag, setFilterTag] = useState<string | null>(null); // M5: tag filter
  const [filterFolder, setFilterFolder] = useState<string | "none" | null>(null); // M7 r6: folder filter
  const [downloadingBackup, setDownloadingBackup] = useState(false); // M5: backup zip

  // M7 round 6: in-app confirms + inline errors (no browser popups).
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [confirmingFolderDelete, setConfirmingFolderDelete] = useState<string | null>(null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renamingName, setRenamingName] = useState("");
  const [pendingMove, setPendingMove] = useState<string | null>(null);
  const [busyFolder, setBusyFolder] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // M5: every distinct tag across the library, most-used first — clickable filter chips.
  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const doc of documents) {
      for (const tag of doc.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([tag]) => tag);
  }, [documents]);

  // M7 round 6: documents per folder (and unfiled) for the chip counts.
  const folderCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const doc of documents) {
      const key = doc.folderId ?? "none";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [documents]);

  // M7 round 6b: on home (`recent`) the CARD GRID is the first `limit` docs
  // (they arrive sorted by updatedAt desc) — but the folder/tag chips and
  // counts above it always describe the FULL list, so home can show both
  // "All · 9" and a folder's true count even when a recent isn't a card.
  const gridSource = useMemo(
    () => (recent && limit ? documents.slice(0, limit) : documents),
    [documents, recent, limit],
  );

  const filtered = useMemo(() => {
    let docs = gridSource;
    if (filterTag) docs = docs.filter((d) => d.tags.includes(filterTag));
    if (filterFolder === "none") docs = docs.filter((d) => !d.folderId);
    else if (filterFolder) docs = docs.filter((d) => d.folderId === filterFolder);
    return docs;
  }, [gridSource, filterTag, filterFolder]);

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
    setError(null);
    try {
      const res = await fetch("/api/documents/backup");
      if (!res.ok) {
        setError("Backup failed — see server logs.");
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

  /** Called from the in-card confirm banner — the actual delete. */
  async function remove(doc: Document) {
    setError(null);
    const res = await fetch(`/api/documents/${doc.id}`, { method: "DELETE" });
    if (!res.ok) {
      setError(`Could not delete "${doc.title || "Untitled"}" — see server logs.`);
      return;
    }
    setConfirmingDelete(null);
    router.refresh();
  }

  /** 2026-08-13 (to-do item 7): ⬇ on the card downloads the FULL PDF
   *  (everything — variant=full). The full-JSON download (all fields incl.
   *  practice answers) moved into the preview sheet's "Download JSON". */
  async function downloadDoc(doc: Document) {
    setError(null);
    const res = await fetch(`/api/documents/${doc.id}/pdf?variant=full`);
    if (!res.ok) {
      setError("Could not download the PDF — see server logs.");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const clean = (doc.title || "document")
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    a.download = `${clean || "document"}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // ---- M7 round 6: folders ----

  async function createFolder() {
    const name = newFolderName.trim();
    if (!name || busyFolder) return;
    setBusyFolder(true);
    setError(null);
    try {
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        setError("Could not create the folder — see server logs.");
        return;
      }
      setNewFolderOpen(false);
      setNewFolderName("");
      router.refresh();
    } finally {
      setBusyFolder(false);
    }
  }

  async function renameFolder(id: string) {
    const name = renamingName.trim();
    if (!name || busyFolder) return;
    setBusyFolder(true);
    setError(null);
    try {
      const res = await fetch(`/api/folders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        setError("Could not rename the folder — see server logs.");
        return;
      }
      setRenamingId(null);
      router.refresh();
    } finally {
      setBusyFolder(false);
    }
  }

  async function deleteFolder(id: string) {
    if (busyFolder) return;
    setBusyFolder(true);
    setError(null);
    try {
      const res = await fetch(`/api/folders/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setError("Could not delete the folder — see server logs.");
        return;
      }
      setConfirmingFolderDelete(null);
      if (filterFolder === id) setFilterFolder(null);
      router.refresh();
    } finally {
      setBusyFolder(false);
    }
  }

  /** Move a document into/out of a folder (PATCH — content untouched). */
  async function moveDoc(doc: Document, folderId: string) {
    if (pendingMove) return;
    setPendingMove(doc.id);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${doc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId: folderId || null }),
      });
      if (!res.ok) {
        setError("Could not move the document — see server logs.");
        return;
      }
      router.refresh();
    } finally {
      setPendingMove(null);
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
        <NewDocumentButton className="mt-1 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-[#fff] transition-colors hover:bg-blue-700" />
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Sort / tags / backup — library page only (home shows the 10 most
          recent without controls, M7 round 6). */}
      {!recent && (
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
                    ? "bg-blue-600 text-[#fff]"
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
      )}

      {/* Folder bar (M7 round 6): All + per-folder chips (create / rename /
          delete) + unfiled count. Deleting a folder only unfiles documents.
          Renders on home too (M7 round 6b: "folder shows as a tag… click on
          it" — the chips are the same clickable folder UI everywhere). */}
      {(folders.length > 0 || (folderCounts.get("none") ?? 0) > 0 || newFolderOpen) && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFilterFolder(null)}
            title="Show every document"
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              filterFolder === null
                ? "bg-zinc-900 text-[#fff]"
                : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-100 hover:ring-zinc-300"
            }`}
          >
            All · {documents.length}
          </button>

          {folders.map((folder) => {
            const count = folderCounts.get(folder.id) ?? 0;
            if (renamingId === folder.id) {
              return (
                <span key={folder.id} className="flex items-center gap-1">
                  <input
                    autoFocus
                    value={renamingName}
                    onChange={(e) => setRenamingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void renameFolder(folder.id);
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    onBlur={() => {
                      if (renamingName.trim() && renamingName !== folder.name) void renameFolder(folder.id);
                      else setRenamingId(null);
                    }}
                    placeholder="Folder name…"
                    className="w-36 rounded-full border border-zinc-300 bg-white px-3 py-1 text-xs text-zinc-700 outline-none focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setRenamingId(null)}
                    className="rounded-full px-1.5 py-1 text-[11px] font-medium text-zinc-500 hover:text-zinc-800"
                  >
                    Cancel
                  </button>
                </span>
              );
            }
            if (confirmingFolderDelete === folder.id) {
              return (
                <span
                  key={folder.id}
                  className="flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs text-red-700"
                >
                  <span>
                    Delete “{folder.name}”? Documents stay in All.
                  </span>
                  <button
                    type="button"
                    onClick={() => void deleteFolder(folder.id)}
                    className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-semibold text-[#fff] hover:bg-red-700"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingFolderDelete(null)}
                    className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-red-600 hover:bg-red-100"
                  >
                    Keep
                  </button>
                </span>
              );
            }
            return (
              <span
                key={folder.id}
                className={`flex items-center gap-0.5 rounded-full pr-1.5 transition-colors ${
                  filterFolder === folder.id
                    ? "bg-blue-600 text-[#fff]"
                    : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:ring-zinc-300"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setFilterFolder(filterFolder === folder.id ? null : folder.id)}
                  className={`rounded-full py-1 pl-3 text-xs font-medium ${
                    filterFolder === folder.id ? "text-[#fff]" : "text-zinc-600"
                  }`}
                  title={`Show only documents in "${folder.name}"`}
                >
                  📁 {folder.name} · {count}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRenamingId(folder.id);
                    setRenamingName(folder.name);
                  }}
                  title="Rename folder"
                  className={`rounded-full px-1 text-[10px] ${
                    filterFolder === folder.id ? "text-blue-200 hover:text-[#fff]" : "text-zinc-300 hover:text-zinc-700"
                  }`}
                >
                  ✎
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingFolderDelete(folder.id)}
                  title="Delete folder (documents stay)"
                  className={`rounded-full px-1 text-[10px] ${
                    filterFolder === folder.id ? "text-blue-200 hover:text-[#fff]" : "text-zinc-300 hover:text-red-500"
                  }`}
                >
                  🗑
                </button>
              </span>
            );
          })}

          {(folderCounts.get("none") ?? 0) > 0 && (
            <button
              type="button"
              onClick={() => setFilterFolder(filterFolder === "none" ? null : "none")}
              title="Show documents that aren't in any folder"
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                filterFolder === "none"
                  ? "bg-zinc-900 text-[#fff]"
                  : "border border-dashed border-zinc-300 bg-white text-zinc-500 hover:bg-zinc-100"
              }`}
            >
              No folder · {folderCounts.get("none") ?? 0}
            </button>
          )}

          {newFolderOpen ? (
            <span className="flex items-center gap-1">
              <input
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void createFolder();
                  if (e.key === "Escape") {
                    setNewFolderOpen(false);
                    setNewFolderName("");
                  }
                }}
                placeholder="New folder name…"
                className="w-36 rounded-full border border-zinc-300 bg-white px-3 py-1 text-xs text-zinc-700 outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={() => void createFolder()}
                className="rounded-full bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-[#fff] transition-colors hover:bg-blue-700"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => {
                  setNewFolderOpen(false);
                  setNewFolderName("");
                }}
                className="rounded-full px-1.5 py-1 text-[11px] font-medium text-zinc-500 hover:text-zinc-800"
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setNewFolderOpen(true)}
              title="Create a folder"
              className="rounded-full border border-dashed border-zinc-300 bg-white px-3 py-1 text-xs font-medium text-zinc-500 transition-colors hover:border-emerald-300 hover:text-emerald-600"
            >
              + New folder
            </button>
          )}

          {/* M7 round 6b: with a folder selected, "make a document in there"
              — the new document is filed into that folder from the first save
              (no "go to the library and move it" step afterwards). */}
          {filterFolder && filterFolder !== "none" && (
            <NewDocumentButton
              folderId={filterFolder}
              label={`+ New document in “${folders.find((f) => f.id === filterFolder)?.name ?? "folder"}”`}
              className="ml-1 rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-[#fff] transition-colors hover:bg-emerald-700"
            />
          )}
        </div>
      )}

      {filterTag && (
        <p className="mb-3 text-xs text-zinc-500">
          Showing {sorted.length} document{sorted.length === 1 ? "" : "s"} tagged{" "}
          <strong className="font-semibold text-zinc-700">#{filterTag}</strong>
        </p>
      )}
      {filterFolder && filterFolder !== "none" && (
        <p className="mb-3 text-xs text-zinc-500">
          Showing {sorted.length} document{sorted.length === 1 ? "" : "s"} in folder{" "}
          <strong className="font-semibold text-zinc-700">
            {folders.find((f) => f.id === filterFolder)?.name ?? "…"}
          </strong>
        </p>
      )}

      {sorted.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-12 text-center">
          <p className="text-sm text-zinc-500">No documents match this filter.</p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {sorted.map((doc) => (
            <li
              key={doc.id}
              className={`group rounded-xl border bg-white p-4 shadow-sm transition-all hover:-translate-y-px hover:shadow-md ${
                confirmingDelete === doc.id
                  ? "border-red-300 ring-1 ring-red-200"
                  : "border-zinc-200 hover:border-zinc-300"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <Link href={`/doc/${doc.id}`} className="min-w-0">
                  <h2 className="truncate text-[15px] font-semibold text-zinc-900 group-hover:text-blue-700">
                    {doc.title || "Untitled"}
                  </h2>
                </Link>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(doc.id)}
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
              {doc.folderId && (
                <p className="mt-1.5 text-[11px] text-zinc-400">
                  📁 {folders.find((f) => f.id === doc.folderId)?.name ?? "folder"}
                </p>
              )}
              <div className="mt-3">
                {confirmingDelete === doc.id ? (
                  <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-700">
                    <span className="min-w-0 flex-1">
                      Delete “{doc.title || "Untitled"}”? This removes the document permanently (JSON, HTML, PDF).
                    </span>
                    <button
                      type="button"
                      onClick={() => void remove(doc)}
                      className="shrink-0 rounded-md bg-red-600 px-2 py-1 font-semibold text-[#fff] transition-colors hover:bg-red-700"
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(null)}
                      className="shrink-0 rounded-md border border-red-200 bg-white px-2 py-1 font-medium text-red-600 transition-colors hover:bg-red-100"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    {/* M7 round 6b: ⬇ replaced ↻ Regenerate — the card
                        downloads the document (all fields) instead of
                        re-rendering it; the editor still has Regenerate. */}
                    <button
                      type="button"
                      onClick={() => void downloadDoc(doc)}
                      title={`Download "${doc.title || "document"}" with all fields (JSON)`}
                      className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:bg-zinc-50"
                    >
                      ⬇
                    </button>
                    {/* Same move control on home and library cards (M7 round 6b). */}
                    <select
                      value={doc.folderId ?? ""}
                      disabled={pendingMove === doc.id}
                      onChange={(e) => void moveDoc(doc, e.target.value)}
                      title="Move to folder"
                      className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-600 outline-none transition-colors focus:border-blue-500 disabled:opacity-50"
                    >
                      <option value="">Move to… (no folder)</option>
                      {folders.map((folder) => (
                        <option key={folder.id} value={folder.id}>
                          📁 {folder.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Home mode: the list is a slice — point at the full library (folders
          and everything live there; with few documents it's still the way in). */}
      {recent && typeof total === "number" && total > 0 && (
        <p className="mt-8 text-center">
          <Link
            href="/library"
            className="text-sm font-medium text-blue-600 transition-colors hover:text-blue-700 hover:underline"
          >
            View all {total} documents in the Library →
          </Link>
        </p>
      )}
    </div>
  );
}
