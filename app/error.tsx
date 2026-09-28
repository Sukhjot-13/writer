// app/error.tsx — route-segment error boundary (2026-09-28).
//
// Before this file existed, a thrown error anywhere under a segment produced
// Next's generic production screen. That matters more than usual here: every
// page reads MongoDB through getStorage(), and getStorage() THROWS a
// configuration error when MONGODB_URI is missing — so one missing env var used
// to turn the entire app into an opaque 500 with no way forward.
//
// The digest is shown so a report can be matched to a server log line; the raw
// message is NOT rendered (it can carry connection strings).

"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center px-6 py-20 text-center">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Something went wrong</h1>
      <p className="mt-2 text-sm leading-relaxed text-zinc-500">
        The page could not be loaded. If this keeps happening, the storage or AI
        configuration may be missing — check that <code>MONGODB_URI</code> is set.
      </p>
      {error.digest ? (
        <p className="mt-3 font-mono text-xs text-zinc-400">reference: {error.digest}</p>
      ) : null}
      <div className="mt-6 flex gap-2">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-[#fff] transition-colors hover:bg-blue-700"
        >
          Try again
        </button>
        <a
          href="/library"
          className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
        >
          Go to the library
        </a>
      </div>
    </main>
  );
}
