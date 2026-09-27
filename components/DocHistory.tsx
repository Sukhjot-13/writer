"use client";

import React, { useEffect, useState } from "react";

interface VersionEntry {
  version: string;
  savedAt: string;
}

interface DocHistoryProps {
  docId: string;
  onClose: () => void;
  onRestored: (doc: unknown) => void;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  });
}

/**
 * Per-document version history (2026-09-26): every save snapshots the
 * pre-save content (capped at 20). List + one-click restore; restoring
 * snapshots the current content first, so a restore is itself undoable.
 */
export default function DocHistory({ docId, onClose, onRestored }: DocHistoryProps) {
  const [versions, setVersions] = useState<VersionEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmVersion, setConfirmVersion] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/documents/${docId}/versions`);
        if (!res.ok) throw new Error("Could not load version history");
        const body = (await res.json()) as { versions: VersionEntry[] };
        if (!cancelled) setVersions(body.versions);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load version history");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [docId]);

  async function restore(version: string) {
    setRestoring(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/documents/${docId}/versions/${encodeURIComponent(version)}`,
        { method: "POST" }
      );
      if (!res.ok) throw new Error("Restore failed");
      const body = (await res.json()) as { doc: unknown };
      onRestored(body.doc);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Restore failed");
    } finally {
      setRestoring(false);
      setConfirmVersion(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl" role="dialog" aria-modal="true" aria-label="Document version history">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-800">Version history</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close version history"
            className="rounded-md px-2 py-1 text-zinc-500 hover:bg-zinc-100"
          >
            ✕
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-4">
          {error && (
            <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
          )}
          {versions === null && !error && (
            <p className="text-sm text-zinc-500">Loading versions…</p>
          )}
          {versions !== null && versions.length === 0 && (
            <p className="text-sm text-zinc-500">
              No earlier versions yet — the first one appears after your second save.
            </p>
          )}
          {versions !== null && versions.length > 0 && (
            <ul className="space-y-2">
              {versions.map((v) => (
                <li
                  key={v.version}
                  className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 px-3 py-2"
                >
                  <span className="text-sm text-zinc-700">{formatWhen(v.savedAt)}</span>
                  {confirmVersion === v.version ? (
                    <span className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={restoring}
                        onClick={() => void restore(v.version)}
                        className="rounded-md bg-rose-600 px-2.5 py-1 text-xs font-semibold text-[#fff] hover:bg-rose-700 disabled:opacity-50"
                      >
                        {restoring ? "Restoring…" : "Confirm restore"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmVersion(null)}
                        className="rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100"
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmVersion(v.version)}
                      className="rounded-md px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
                    >
                      Restore
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
