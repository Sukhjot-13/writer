// components/PasteHtmlModal.tsx — import HTML from any external AI (FR-40).
//
// Validates/wraps the HTML (FR-10), creates a new document (source:
// "external-html", title from <title>/first <h1>), and hands it to the editor
// which previews immediately and continues the normal pipeline. Best-effort
// "Parse to blocks" (FR-41) is added in M5.

"use client";

import { useState } from "react";
import type { Document } from "@/lib/types";
import AutoGrowTextarea from "./AutoGrowTextarea"; // 2026-08-10: auto-grow paste box

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
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-zinc-900/40 p-4 backdrop-blur-[2px]" onClick={onClose}>
      <div
        className="w-full max-w-xl rounded-2xl border border-zinc-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-zinc-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Paste HTML back</h2>
            <p className="mt-0.5 text-sm text-zinc-500">
              HTML from any external AI (e.g. one you copied via “Copy for AI”). Title is taken from the
              HTML, and the document opens in preview immediately.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600"
            title="Close"
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-4">
          <AutoGrowTextarea
            value={html}
            onChange={(e) => setHtml(e.target.value)}
            rows={10}
            autoFocus
            spellCheck={false}
            placeholder={"<!DOCTYPE html>\n<html>\n  <head>…"}
            className="w-full rounded-lg border border-zinc-200 bg-zinc-50 p-3 font-mono text-[12px] leading-relaxed text-zinc-800 outline-none placeholder:text-zinc-300 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
          />

          {error && (
            <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-zinc-100 px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void importHtml()}
            disabled={busy || !html.trim()}
            className="rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-40"
          >
            {busy ? "Importing…" : "Import document"}
          </button>
        </div>
      </div>
    </div>
  );
}
