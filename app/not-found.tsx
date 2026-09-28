// app/not-found.tsx — 404 screen (2026-09-28).
//
// Reachable in two ways: a mistyped URL, and — because owner-scoped lookups
// answer 404 rather than 403 on purpose — a document id that exists but belongs
// to another account. The copy stays neutral about which, so a 404 never
// confirms that somebody else's document exists.

import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center px-6 py-20 text-center">
      <p className="font-mono text-sm text-zinc-400">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">Page not found</h1>
      <p className="mt-2 text-sm leading-relaxed text-zinc-500">
        That page or document does not exist — or it is not yours to open.
      </p>
      <div className="mt-6 flex gap-2">
        <Link
          href="/library"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-[#fff] transition-colors hover:bg-blue-700"
        >
          Open the library
        </Link>
        <Link
          href="/"
          className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
        >
          Home
        </Link>
      </div>
    </main>
  );
}
