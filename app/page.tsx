// app/page.tsx — home dashboard (M6 redesign).
// Server component: offers "new document" and the 10 most recent saved ones.
// The full archive (every document + folders) lives at /library (2026-08-10
// M7 round 6, user: "only show 10 there and a link to library… make a
// library page"). The editor moved to /doc/[id] — "/" no longer throws you
// straight into an editor.

import type { Metadata } from "next";
import Link from "next/link";

import { getStorage } from "@/lib/storage";
import NewDocumentButton from "@/components/NewDocumentButton";
import ThemeToggle from "@/components/ThemeToggle";
import LibraryList from "@/components/LibraryList";

export const metadata: Metadata = {
  title: "Home — Writer App",
};

// Reads the documents folder at request time — never prerender the dashboard
// at build time (Next would freeze it to an empty build-time snapshot).
export const dynamic = "force-dynamic";

// M7 round 6: how many recent documents the home page shows before pointing
// at the full library.
const RECENT_LIMIT = 10;

export default async function HomePage() {
  // listDocuments already sorts by updatedAt desc. LibraryList takes the FULL
  // list plus limit — the card grid shows the first 10, while the folder
  // chips and their counts describe everything (2026-08-10 M7 round 6b).
  const [documents, folders] = await Promise.all([
    getStorage().listDocuments(null),
    getStorage().listFolders(), // folder bar + card folder names on home too
  ]);

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-lg text-[#fff]">
            ✎
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Writer</h1>
            <p className="mt-0.5 text-sm text-zinc-500">
              {documents.length === 0
                ? "Write paragraphs and Q&A practice content, or start a new document."
                : `${documents.length} saved document${documents.length === 1 ? "" : "s"} — pick one or start fresh.`}
            </p>
          </div>
        </div>
        {/* 2026-08-10 M7 round 4 (user: "instructions tab is in the document
            why… put it on home screen"): Instructions moved from the editor
            toolbar to the home screen. */}
        <div className="flex items-center gap-2">
          <Link
            href="/instructions"
            title="Edit the AI instructions and design rules"
            className="rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:bg-zinc-50"
          >
            Instructions
          </Link>
          {/* M7 round 7: dark-mode toggle (🌙/☀️) — app-wide preference. */}
          <ThemeToggle />
          <NewDocumentButton className="rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-[#fff] shadow-sm transition-colors hover:bg-blue-700" />
        </div>
      </header>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
          Recent documents
        </h2>
        <LibraryList
          documents={documents}
          folders={folders}
          recent
          limit={RECENT_LIMIT}
          total={documents.length}
        />
      </section>
    </div>
  );
}
