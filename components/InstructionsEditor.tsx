// components/InstructionsEditor.tsx — instructions edit UI (FR-22/47).
// Textarea + Save (PUT /api/instructions), "Reset to repo file"
// (POST /api/instructions/reset), and version history (each entry can be
// previewed into the textarea and restored). Saving validates that the
// TOKENS block survives (FR-47) and the server invalidates the design-token
// cache, so design changes apply to new conversions immediately.

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface HistoryEntry {
  version: string;
  savedAt: string;
  content: string;
}

interface InstructionsState {
  content: string;
  version: string;
  source: "active";
  history: HistoryEntry[];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default function InstructionsEditor() {
  const [state, setState] = useState<InstructionsState | null>(null);
  const [draft, setDraft] = useState<string | null>(null); // null until loaded
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/instructions");
      if (!res.ok) throw new Error("Could not load instructions");
      const data = (await res.json()) as InstructionsState;
      setState(data);
      setDraft(data.content);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load instructions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const text = draft ?? state?.content ?? "";
  const dirty = state !== null && text !== state.content;

  async function save() {
    if (busy || !dirty) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/instructions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      const body = (await res.json().catch(() => ({}))) as { version?: string; error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not save instructions");
      setStatus(
        `Saved v${body.version} — design changes apply to new conversions (FR-47). Old documents keep their snapshot rules (FR-23).`,
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save instructions");
    } finally {
      setBusy(false);
    }
  }

  async function resetToRepo() {
    if (busy) return;
    if (!confirm("Reset the active instructions to the repo copy (docs/html_instructions.md)?")) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/instructions/reset", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { version?: string; error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not reset instructions");
      setStatus(`Reset to repo copy (v${body.version}).`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reset instructions");
    } finally {
      setBusy(false);
    }
  }

  function previewHistory(entry: HistoryEntry) {
    setDraft(entry.content ?? "");
    setStatus(`Previewing v${entry.version} from ${formatDate(entry.savedAt)} — Save to make it active.`);
  }

  async function restoreVersion(entry: HistoryEntry) {
    if (busy) return;
    if (!confirm(`Make v${entry.version} (${formatDate(entry.savedAt)}) the active instructions?`)) return;
    setDraft(entry.content ?? "");
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/instructions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: entry.content ?? "" }),
      });
      const body = (await res.json().catch(() => ({}))) as { version?: string; error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not restore version");
      setStatus(`Restored v${body.version}.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not restore version");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-6 py-8">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/" className="rounded-lg px-2.5 py-1.5 text-sm text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900">
          ← Editor
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Instructions</h1>
        {state && (
          <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
            active v{state.version}
          </span>
        )}
      </div>

      <p className="mb-4 text-sm leading-relaxed text-zinc-500">
        This file is the <strong className="font-semibold text-zinc-700">single source of the design system</strong>: the
        human-readable style rules go into every AI prompt, and the <code>TOKENS</code> block drives both the
        HTML preview and the PDF. Every conversion also records a copy with the document — old documents
        keep the rules they were made with.
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {status && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {status}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || loading || !dirty}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-40"
        >
          {busy ? "Saving…" : dirty ? "Save instructions" : "Saved ✓"}
        </button>
        <button
          type="button"
          onClick={() => void resetToRepo()}
          disabled={busy || loading}
          className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-40"
        >
          Reset to repo file
        </button>
        {dirty && <span className="text-sm font-medium text-amber-600">Unsaved changes</span>}
      </div>

      {loading && !state ? (
        <div className="p-8 text-sm text-zinc-500">Loading instructions…</div>
      ) : (
        <textarea
          value={text}
          onChange={(e) => setDraft(e.target.value)}
          rows={40}
          spellCheck={false}
          className="w-full rounded-xl border border-zinc-200 bg-white p-4 font-mono text-[13px] leading-relaxed text-zinc-800 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
      )}

      {state && state.history.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-2 text-sm font-semibold text-zinc-800">Version history</h2>
          <div className="overflow-hidden rounded-lg border border-zinc-200">
            {state.history.map((entry) => (
              <div
                key={entry.version}
                className="flex flex-wrap items-center gap-3 border-b border-zinc-100 bg-white px-4 py-2.5 text-sm last:border-b-0 hover:bg-zinc-50"
              >
                <span className="font-mono text-xs text-zinc-500">v{entry.version}</span>
                <span className="text-zinc-600">{formatDate(entry.savedAt)}</span>
                <span className="text-zinc-400">{(entry.content ?? "").length} chars</span>
                <div className="ml-auto flex gap-2">
                  <button
                    type="button"
                    onClick={() => previewHistory(entry)}
                    disabled={busy}
                    className="rounded border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
                  >
                    Preview
                  </button>
                  <button
                    type="button"
                    onClick={() => void restoreVersion(entry)}
                    disabled={busy || entry.version === state.version}
                    className="rounded border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
                  >
                    {entry.version === state.version ? "Active" : "Restore"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
