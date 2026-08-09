// components/Editor.tsx — main two-pane editor (FR-24/27/28/29/46).
//
// State:
//   doc          — the editable document (blocks + metadata)
//   html         — latest generated preview (null until first conversion)
//   previewStale — true after any edit since the last conversion (FR-46)
//   persisted    — whether the server knows this doc id
//   isDirty      — unsaved changes indicator (status bar)
//
// Flow (FR-46): Convert → preview exists → Download PDF enabled. Editing
// marks the preview stale and re-disables PDF until a fresh conversion.
// Autosave: debounced localStorage draft (FR-6) + explicit Save (FR-7 Cmd+S).

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Block as BlockModel, BlockType, Document } from "@/lib/types";
import { createBlock, createDocument, replaceBlockType, setBlockContent } from "@/lib/types";

import Toolbar from "./Toolbar";
import BlockList from "./BlockList";
import PreviewPane from "./PreviewPane";

const DRAFT_KEY = "writer-app:draft";
const AUTOSAVE_MS = 800;

interface DraftShape {
  doc: Document;
  savedAt: number;
}

function loadDraft(): DraftShape | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DraftShape;
    if (!parsed?.doc || !Array.isArray(parsed.doc.blocks)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function safeFilename(title: string, ext: string): string {
  const clean = title.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return (clean || "document") + "." + ext;
}

export default function Editor({ docId }: { docId: string | null }) {
  const [doc, setDoc] = useState<Document | null>(null);
  const [loading, setLoading] = useState(docId !== null);
  const [html, setHtml] = useState<string | null>(null);
  const [previewStale, setPreviewStale] = useState(false);
  const [persisted, setPersisted] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [convertedAt, setConvertedAt] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(true);
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);

  const docRef = useRef(doc);
  docRef.current = doc;
  const persistedRef = useRef(persisted);
  persistedRef.current = persisted;

  // ---- init: load by id, else restore draft, else a fresh document ----
  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (docId) {
        try {
          const res = await fetch(`/api/documents/${docId}`);
          if (res.ok) {
            const { doc: saved } = await res.json();
            if (cancelled) return;
            setDoc(saved);
            setPersisted(true);
            setLoading(false);
            return;
          }
        } catch {
          // fall through to draft/new
        }
        setError("Document not found — starting fresh.");
      }

      const draft = loadDraft();
      if (draft) {
        setDoc(draft.doc);
        setStatus(`Restored draft from ${new Date(draft.savedAt).toLocaleTimeString()}`);
      } else {
        // FR-24: a fresh document starts with one empty paragraph block —
        // typing begins immediately.
        const fresh = createDocument();
        fresh.blocks = [createBlock("paragraph")];
        setDoc(fresh);
      }
      setLoading(false);
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [docId]);

  // ---- draft autosave (debounced, FR-6) ----
  useEffect(() => {
    if (!doc || loading) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ doc, savedAt: Date.now() } satisfies DraftShape));
      } catch {
        // storage full/unavailable — non-fatal
      }
    }, AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [doc, loading]);

  // ---- keyboard shortcuts (FR-7) ----
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === "Enter") {
        e.preventDefault();
        void convert();
      } else if (e.key === "s") {
        e.preventDefault();
        void save();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- generic mutate: mark dirty + invalidate preview (FR-46) ----
  function mutateDoc(mutate: (d: Document) => Document) {
    setDoc((prev) => {
      if (!prev) return prev;
      const next = mutate(prev);
      next.updatedAt = new Date().toISOString();
      return next;
    });
    setIsDirty(true);
    setHtml((h) => {
      if (h !== null) setPreviewStale(true);
      return h;
    });
  }

  // ---- block operations ----
  const updateBlock = useCallback((id: string, content: BlockModel["content"]) => {
    mutateDoc((d) => ({
      ...d,
      blocks: d.blocks.map((b) => (b.id === id ? setBlockContent(b, content) : b)),
    }));
  }, []);

  const convertBlock = useCallback((id: string, type: BlockType) => {
    mutateDoc((d) => ({
      ...d,
      blocks: d.blocks.map((b) => (b.id === id ? replaceBlockType(b, type) : b)),
    }));
  }, []);

  const removeBlock = useCallback((id: string) => {
    mutateDoc((d) => ({ ...d, blocks: d.blocks.filter((b) => b.id !== id) }));
  }, []);

  const moveBlock = useCallback((id: string, dir: -1 | 1) => {
    mutateDoc((d) => {
      const index = d.blocks.findIndex((b) => b.id === id);
      const target = index + dir;
      if (index < 0 || target < 0 || target >= d.blocks.length) return d;
      const blocks = [...d.blocks];
      [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
      return { ...d, blocks };
    });
  }, []);

  const insertAfter = useCallback((id: string, type: BlockType) => {
    const fresh = createBlock(type);
    mutateDoc((d) => {
      const index = d.blocks.findIndex((b) => b.id === id);
      const blocks = [...d.blocks];
      blocks.splice(index + 1, 0, fresh);
      return { ...d, blocks };
    });
    setPendingFocusId(fresh.id);
  }, []);

  const appendBlock = useCallback((type: BlockType) => {
    const fresh = createBlock(type);
    mutateDoc((d) => ({ ...d, blocks: [...d.blocks, fresh] }));
    setPendingFocusId(fresh.id);
  }, []);

  const setTitle = useCallback((value: string) => {
    mutateDoc((d) => ({ ...d, title: value }));
  }, []);

  // ---- conversion (template mode, FR-9) ----
  async function convert() {
    const current = docRef.current;
    if (!current || busy) return;
    setBusy("converting");
    setError(null);
    try {
      const res = await fetch("/api/convert/template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc: current }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Conversion failed (${res.status})`);
      }
      const { html: generated } = await res.json();
      setHtml(generated);
      setPreviewStale(false);
      setConvertedAt(Date.now());
      setStatus("Preview generated (template mode)");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Conversion failed");
    } finally {
      setBusy(null);
    }
  }

  // ---- save (FR-17) ----
  async function save(): Promise<boolean> {
    const current = docRef.current;
    if (!current || busy) return false;
    setBusy("saving");
    setError(null);
    try {
      const payload = {
        doc: current,
        // Only persist a preview that isn't stale (FR-46) — the server then
        // writes document.html + document.pdf alongside document.json.
        html: html && !previewStale ? html : undefined,
      };
      const isNew = !persistedRef.current;
      const url = isNew ? "/api/documents" : `/api/documents/${current.id}`;
      const res = await fetch(url, {
        method: isNew ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Save failed (${res.status})`);
      }
      setPersisted(true);
      setIsDirty(false);
      setStatus("Saved");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      return false;
    } finally {
      setBusy(null);
    }
  }

  // ---- downloads ----
  async function ensureSaved(): Promise<boolean> {
    if (persistedRef.current) return true;
    return save();
  }

  async function downloadPdf() {
    const current = docRef.current;
    if (!current || html === null || previewStale) return; // FR-46 gate
    setBusy("pdf");
    setError(null);
    try {
      if (!(await ensureSaved())) return;
      const res = await fetch(`/api/documents/${current.id}/pdf`);
      if (!res.ok) throw new Error("PDF generation failed");
      downloadBlob(await res.blob(), safeFilename(current.title, "pdf"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDF download failed");
    } finally {
      setBusy(null);
    }
  }

  async function downloadHtml() {
    const current = docRef.current;
    if (!current) return;
    setBusy("html");
    setError(null);
    try {
      if (!(await ensureSaved())) return;
      const res = await fetch(`/api/documents/${current.id}/html`);
      if (!res.ok) throw new Error("HTML download failed");
      downloadBlob(await res.blob(), safeFilename(current.title, "html"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "HTML download failed");
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return <div className="p-8 text-sm text-zinc-500">Loading document…</div>;
  }

  if (!doc) {
    return <div className="p-8 text-sm text-zinc-500">Creating document…</div>;
  }

  const canDownloadPdf = html !== null && !previewStale;

  return (
    <div className="flex h-full flex-col">
      <Toolbar
        title={doc.title}
        onTitleChange={setTitle}
        busy={busy}
        error={error}
        onConvert={() => void convert()}
        onSave={() => void save()}
        canDownloadPdf={canDownloadPdf}
        onDownloadPdf={() => void downloadPdf()}
        onDownloadHtml={() => void downloadHtml()}
        showPreview={showPreview}
        onTogglePreview={() => setShowPreview((v) => !v)}
      />

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto bg-white">
          <div className="mx-auto max-w-2xl px-6 py-8">
            <BlockList
              blocks={doc.blocks}
              pendingFocusId={pendingFocusId}
              onUpdateBlock={updateBlock}
              onConvertBlock={convertBlock}
              onRemoveBlock={removeBlock}
              onMoveBlock={moveBlock}
              onInsertAfter={insertAfter}
              onAppend={appendBlock}
            />
          </div>
        </div>

        {showPreview && (
          <div className="w-1/2 border-l border-zinc-200 bg-zinc-100">
            <PreviewPane html={html} stale={previewStale} convertedAt={convertedAt} />
          </div>
        )}
      </div>

      {/* Status bar (FR-28 partial) */}
      <div className="flex items-center gap-4 border-t border-zinc-200 bg-white px-4 py-1.5 text-xs text-zinc-500">
        {isDirty ? (
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-400" /> Unsaved changes
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400" /> Saved
          </span>
        )}
        <span>
          Mode: <strong>Template (offline)</strong>
        </span>
        {convertedAt && (
          <span>Last converted: {new Date(convertedAt).toLocaleTimeString()}</span>
        )}
        {status && <span className="text-zinc-400">{status}</span>}
        <span className="ml-auto">Design tokens: instructions file (TOKENS block)</span>
      </div>
    </div>
  );
}
