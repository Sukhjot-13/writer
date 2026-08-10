// app/library/page.tsx — the full library (2026-08-10 M7 round 6, user:
// "make a library page… option for making folder too").
// Server component: fetches EVERY document + the library folders and hands
// them to LibraryList (client) which does sorting, tag/folder filtering,
// folder CRUD and per-document folder assignment. The home page shows only
// the 10 most recent — this page is the complete archive.

import type { Metadata } from "next";
import Link from "next/link";

import { getStorage } from "@/lib/storage";
import NewDocumentButton from "@/components/NewDocumentButton";
import ThemeToggle from "@/components/ThemeToggle";
import LibraryList from "@/components/LibraryList";

export const metadata: Metadata = {
  title: "Library — Writer App",
};

// Reads storage at request time — never prerender at build time.
export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const [documents, folders] = await Promise.all([
    getStorage().listDocuments(null),
    getStorage().listFolders(),
  ]);

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            title="Back to the recent documents"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white text-lg text-zinc-600 transition-colors hover:border-zinc-300 hover:text-blue-700"
          >
            ←
          </Link>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Library</h1>
            <p className="mt-0.5 text-sm text-zinc-500">
              {documents.length === 0
                ? "Every document you save lives here — folders keep them organized."
                : `${documents.length} saved document${documents.length === 1 ? "" : "s"} · ${folders.length} folder${folders.length === 1 ? "" : "s"}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/instructions"
            title="Edit the AI instructions and design rules"
            className="rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:bg-zinc-50"
          >
            Instructions
          </Link>
          <NewDocumentButton className="rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-[#fff] shadow-sm transition-colors hover:bg-blue-700" />
          {/* M7 round 7: dark-mode toggle (🌙/☀️) — app-wide preference. */}
          <ThemeToggle />
        </div>
      </header>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
          All documents
        </h2>
        <LibraryList documents={documents} folders={folders} />
      </section>
    </div>
  );
}
