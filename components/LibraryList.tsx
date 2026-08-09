// components/LibraryList.tsx — document cards: title, date, block count,
// tags; open (→ editor with ?id=) and delete (FR-18/19).

"use client";

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

export default function LibraryList({ documents }: { documents: Document[] }) {
  const router = useRouter();

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

  if (documents.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-300 p-12 text-center text-sm text-zinc-400">
        Documents you save appear here — open the editor, write, convert, and save.
      </div>
    );
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {documents.map((doc) => (
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
        </li>
      ))}
    </ul>
  );
}
