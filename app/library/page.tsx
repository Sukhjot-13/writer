// app/library/page.tsx — document library (FR-18).
// Server component: lists saved documents straight from storage (filesystem
// read at request time — no client hop needed).

import Link from "next/link";
import type { Metadata } from "next";

import { getStorage } from "@/lib/storage";
import LibraryList from "@/components/LibraryList";

export const metadata: Metadata = {
  title: "Library — Writer App",
};

// Reads the documents folder at request time — never prerender the library
// at build time (Next would freeze it to an empty build-time snapshot).
export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const documents = await getStorage().listDocuments(null);

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Document Library</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {documents.length === 0
              ? "No saved documents yet."
              : `${documents.length} saved document${documents.length === 1 ? "" : "s"}.`}
          </p>
        </div>
        <Link
          href="/"
          className="rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
        >
          + New document
        </Link>
      </header>
      <LibraryList documents={documents} />
    </div>
  );
}
