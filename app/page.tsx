// app/page.tsx — home dashboard (M6 redesign).
// Server component: offers "new document" and the list of saved ones. The
// editor moved to /doc/[id] — "/" no longer throws you straight into an editor.

import type { Metadata } from "next";

import { getStorage } from "@/lib/storage";
import NewDocumentButton from "@/components/NewDocumentButton";
import LibraryList from "@/components/LibraryList";

export const metadata: Metadata = {
  title: "Home — Writer App",
};

// Reads the documents folder at request time — never prerender the dashboard
// at build time (Next would freeze it to an empty build-time snapshot).
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const documents = await getStorage().listDocuments(null);

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-lg text-white">
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
        <NewDocumentButton className="rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700" />
      </header>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">Documents</h2>
        <LibraryList documents={documents} />
      </section>
    </div>
  );
}
