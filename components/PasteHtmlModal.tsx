// components/PasteHtmlModal.tsx — import HTML from any external AI (FR-40).
//
// Validates/wraps the HTML (FR-10), creates a new document (source:
// "external-html", title from <title>/first <h1>), and hands it to the editor
// which previews immediately and continues the normal pipeline. Best-effort
// "Parse to blocks" (FR-41) is added in M5.

"use client";

import { useState } from "react";
import type { Document } from "@/lib/types";

interface PasteHtmlModalProps {
  onClose: () => void;
  onImported: (doc: Document, html: string) => void;
}

export default function PasteHtmlModal({ onClose, onImported }: PasteHtmlModalProps) {
  const [html, setHtml] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function importHtml() {
    if (busy || !html.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/documents/import-html", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        doc?: Document;
        html?: string;
        error?: string;
      };
      if (!res.ok || !body.doc || !body.html) throw new Error(body.error ?? "Import failed");
      onImported(body.doc, body.html);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="w-full max-w-xl rounded-xl border border-zinc-200 bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-zinc-900">Paste HTML back</h2>
        <p className="mt-1 text-sm text-zinc-500">
          HTML from any external AI (e.g. one you copied via “Copy for AI”). Title is taken from the
          HTML, and the document opens in preview immediately.
        </p>

        <textarea
          value={html}
          onChange={(e) => setHtml(e.target.value)}
          rows={10}
          autoFocus
          spellCheck={false}
          placeholder={"<!DOCTYPE html>\n<html>\n  <head>…"}
          className="mt-3 w-full rounded-md border border-zinc-200 bg-zinc-50 p-3 font-mono text-[12px] leading-relaxed text-zinc-800 outline-none placeholder:text-zinc-300 focus:border-blue-400 focus:bg-white"
        />

        {error && (
          <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void importHtml()}
            disabled={busy || !html.trim()}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
          >
            {busy ? "Importing…" : "Import document"}
          </button>
        </div>
      </div>
    </div>
  );
}
