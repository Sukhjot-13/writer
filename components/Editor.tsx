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

import Toolbar, { type ConvertMode } from "./Toolbar";
import BlockList from "./BlockList";
import PreviewPane from "./PreviewPane";
import PasteQuestionsModal from "./PasteQuestionsModal";
import PasteHtmlModal from "./PasteHtmlModal";
import CopyDialog from "./CopyDialog";
import { parseHtmlToBlocks } from "@/lib/html-to-blocks"; // FR-41 (M5)

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

/** Copy text to the clipboard, falling back to a hidden textarea (non-secure contexts). */
async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
}

/** True when a block carries any real content (used by paste-questions import). */
function blockHasContent(b: BlockModel): boolean {
  const c = b.content as Record<string, unknown>;
  return Object.entries(c).some(([key, value]) => {
    if (key === "hideTranslation" || key === "hideModelAnswer") return false;
    if (Array.isArray(value)) return (value as { term?: string; def?: string }[]).some((x) => x.term || x.def);
    return typeof value === "string" && value.trim().length > 0;
  });
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
  const [practiceMode, setPracticeMode] = useState(false); // FR-16: practice-mode PDF
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);
  const [convertMode, setConvertMode] = useState<ConvertMode>("ai"); // FR-29: AI primary, template offline
  const [aiModel, setAiModel] = useState<string | null>(null); // FR-28: model name in status bar
  const [instructionsVersion, setInstructionsVersion] = useState<string | null>(null); // FR-28
  const [snapshotInfo, setSnapshotInfo] = useState<{ version: string; differs: boolean } | null>(null); // FR-23
  const [useSnapshot, setUseSnapshot] = useState(false); // FR-23: convert with the doc's own rules
  const [showPasteQuestions, setShowPasteQuestions] = useState(false); // FR-38
  const [showPasteHtml, setShowPasteHtml] = useState(false); // FR-40
  const [showCopyDialog, setShowCopyDialog] = useState(false); // FR-50

  const docRef = useRef(doc);
  docRef.current = doc;
  const persistedRef = useRef(persisted);
  persistedRef.current = persisted;
  const convertModeRef = useRef(convertMode);
  convertModeRef.current = convertMode;
  const useSnapshotRef = useRef(useSnapshot);
  useSnapshotRef.current = useSnapshot;

  // ---- init: load by id, else restore draft, else a fresh document ----
  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (docId) {
        try {
          const res = await fetch(`/api/documents/${docId}`);
          if (res.ok) {
            const body = (await res.json()) as { doc: Document; snapshotInfo?: { version: string; differs: boolean } | null };
            if (cancelled) return;
            setDoc(body.doc);
            setSnapshotInfo(body.snapshotInfo ?? null); // FR-23: drive the snapshot toggle
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

  // ---- runtime config: AI model + instructions version for the status bar (FR-28) ----
  useEffect(() => {
    fetch("/api/config")
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (body: { model?: string; instructionsVersion?: string } | null) => {
          setAiModel(body?.model ?? null);
          setInstructionsVersion(body?.instructionsVersion ?? null);
        },
      )
      .catch(() => {
        setAiModel(null);
        setInstructionsVersion(null);
      });
  }, []);

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
        void convert(convertModeRef.current, null);
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

  // M5: drag-and-drop reorder — drop `fromId` onto `toId` (insert at its index).
  const reorderBlock = useCallback((fromId: string, toId: string) => {
    mutateDoc((d) => {
      const from = d.blocks.findIndex((b) => b.id === fromId);
      const to = d.blocks.findIndex((b) => b.id === toId);
      if (from < 0 || to < 0 || from === to) return d;
      const blocks = [...d.blocks];
      const [moved] = blocks.splice(from, 1);
      // After removal the target index shifts by one when the source was above it.
      blocks.splice(from < to ? to - 1 : to, 0, moved);
      return { ...d, blocks };
    });
  }, []);

  // M5 (FR-3): Enter in the middle of a text block splits it in two.
  const splitBlock = useCallback((id: string, rest: string) => {
    const fresh = createBlock("paragraph") as Extract<BlockModel, { type: "paragraph" }>;
    fresh.content = { text: rest, format: "plain" };
    mutateDoc((d) => ({
      ...d,
      blocks: d.blocks.flatMap((b) => (b.id === id ? [b, fresh] : [b])),
    }));
    setPendingFocusId(fresh.id);
  }, []);

  // M5 (FR-3): Backspace on an empty block merges it up — remove + refocus the
  // previous block so typing continues where it stopped.
  const removeBlockFocusUp = useCallback((id: string) => {
    const prev = docRef.current;
    const idx = prev ? prev.blocks.findIndex((b) => b.id === id) : -1;
    mutateDoc((d) => ({ ...d, blocks: d.blocks.filter((b) => b.id !== id) }));
    if (idx > 0 && prev) setPendingFocusId(prev.blocks[idx - 1].id);
  }, []);

  // M5 (FR-5): per-block custom tags (become CSS classes in output HTML).
  const updateBlockTags = useCallback((id: string, tags: string[]) => {
    mutateDoc((d) => ({ ...d, blocks: d.blocks.map((b) => (b.id === id ? { ...b, tags } : b)) }));
  }, []);

  // M5 (FR-18): document-level tags shown in the library.
  const setDocTags = useCallback((tags: string[]) => {
    mutateDoc((d) => ({ ...d, tags }));
  }, []);

  const setTitle = useCallback((value: string) => {
    mutateDoc((d) => ({ ...d, title: value }));
  }, []);

  // ---- global visibility (FR-35): write per-question flags + document defaults ----
  const setAllQaFlags = useCallback(
    (key: "hideTranslation" | "hideModelAnswer", value: boolean) => {
      mutateDoc((d) => ({
        ...d,
        practice:
          key === "hideTranslation"
            ? { hideTranslations: value, hideModelAnswers: d.practice?.hideModelAnswers ?? false }
            : { hideTranslations: d.practice?.hideTranslations ?? false, hideModelAnswers: value },
        blocks: d.blocks.map((b) =>
          b.type === "qa" ? setBlockContent(b, { ...b.content, [key]: value }) : b,
        ),
      }));
    },
    [],
  );

  // ---- visibility counts for the status bar / toolbar labels (FR-37) ----
  const qaBlocks = doc ? doc.blocks.filter((b) => b.type === "qa") : [];
  const counts = {
    translationsTotal: qaBlocks.length,
    translationsHidden: qaBlocks.filter((b) => b.content.hideTranslation || doc?.practice?.hideTranslations).length,
    answersTotal: qaBlocks.length,
    answersHidden: qaBlocks.filter((b) => b.content.hideModelAnswer || doc?.practice?.hideModelAnswers).length,
  };

  // ---- conversion (FR-8/9/23/29): AI via DeepSeek, or local template ----
  async function convert(mode: ConvertMode, goal: string | null) {
    const current = docRef.current;
    if (!current || busy) return;
    setBusy("converting");
    setError(null);
    try {
      const url = mode === "ai" ? "/api/convert/ai" : "/api/convert/template";
      const useSnap = useSnapshotRef.current;
      const body =
        mode === "ai"
          ? { doc: current, goal, useSnapshot: useSnap }
          : { doc: current, useSnapshot: useSnap };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        // FR-30: inline, actionable server errors (e.g. missing API key) pass through
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Conversion failed (${res.status})`);
      }
      const { html: generated } = await res.json();
      setHtml(generated);
      setPreviewStale(false);
      setConvertedAt(Date.now());
      setStatus(
        `${mode === "ai" ? "AI" : "template"} mode${useSnap ? " · snapshot rules v" + snapshotInfo?.version : ""} — preview generated`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Conversion failed");
    } finally {
      setBusy(null);
    }
  }

  // ---- copy for external AI (FR-39): user markers / system / plain text ----
  async function copyPrompt(part: "user" | "system" | "plainText") {
    if (busy) return;
    setBusy("copy");
    setError(null);
    try {
      if (!(await ensureSaved())) return;
      const current = docRef.current;
      if (!current) return;
      const res = await fetch(`/api/export/prompt?docId=${encodeURIComponent(current.id)}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Could not build prompt (${res.status})`);
      }
      const body = (await res.json()) as { user?: string; system?: string; plainText?: string };
      const text = body[part];
      if (!text) throw new Error("Prompt is empty");
      await copyToClipboard(text);
      const label =
        part === "user" ? "AI prompt (type markers)" : part === "system" ? "system instructions" : "plain text";
      setStatus(`Copied ${label} to clipboard`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Copy failed");
    } finally {
      setBusy(null);
    }
  }

  // ---- paste questions (FR-38): replace an empty document, else append ----
  function applyImportedBlocks(blocks: BlockModel[]) {
    const current = docRef.current;
    if (!current || blocks.length === 0) return;
    const isEmpty = !current.blocks.some(blockHasContent);
    mutateDoc((d) => ({ ...d, blocks: isEmpty ? blocks : [...d.blocks, ...blocks] }));
    setShowPasteQuestions(false);
    setStatus(`Imported ${blocks.length} question${blocks.length === 1 ? "" : "s"}`);
  }

  // ---- paste HTML back (FR-40): new document previews immediately ----
  function applyImportedHtml(doc: Document, html: string) {
    setDoc(doc);
    setHtml(html);
    setPreviewStale(false);
    setPersisted(true);
    setIsDirty(false);
    setConvertedAt(Date.now());
    setShowPreview(true);
    setShowPasteHtml(false);
    setSnapshotInfo(null); // fresh import has no recorded rules (FR-23)
    setUseSnapshot(false);
    setStatus("Imported HTML document — preview ready (FR-40)");
  }

  // ---- parse to blocks (FR-41, M5): imported HTML → editable blocks ----
  async function parseToBlocks() {
    const current = docRef.current;
    if (!current || busy) return;
    setBusy("parse");
    setError(null);
    try {
      let source = html;
      if (!source || previewStale) {
        const res = await fetch(`/api/documents/${current.id}/html`);
        if (!res.ok) throw new Error("Could not load the saved HTML");
        source = await res.text();
      }
      const { blocks: parsed, unparsedCount } = parseHtmlToBlocks(source);
      if (parsed.length === 0) throw new Error("No recognizable blocks found in the HTML");
      // Replace blocks + flip the source; the existing preview stays valid
      // until the user edits (mutateDoc would mark it stale, FR-46).
      setDoc((prev) =>
        prev ? { ...prev, blocks: parsed, source: "editor", updatedAt: new Date().toISOString() } : prev,
      );
      setIsDirty(true);
      setStatus(
        `Parsed to ${parsed.length} editable block${parsed.length === 1 ? "" : "s"}${
          unparsedCount ? ` — ${unparsedCount} kept as raw HTML` : ""
        } (FR-41)`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Parse failed");
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
      // ?practice=true → blank answer areas, answers/translations omitted (FR-16/49)
      const qs = practiceMode ? "?practice=true" : "";
      const res = await fetch(`/api/documents/${current.id}/pdf${qs}`);
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
        docTags={doc.tags}
        onTagsChange={setDocTags}
        busy={busy}
        error={error}
        convertMode={convertMode}
        onConvertModeChange={setConvertMode}
        onConvert={(mode, goal) => void convert(mode, goal)}
        onSave={() => void save()}
        canDownloadPdf={canDownloadPdf}
        practiceMode={practiceMode}
        onTogglePractice={() => setPracticeMode((v) => !v)}
        onDownloadPdf={() => void downloadPdf()}
        onDownloadHtml={() => void downloadHtml()}
        counts={counts}
        onHideAllTranslations={() => setAllQaFlags("hideTranslation", true)}
        onShowAllTranslations={() => setAllQaFlags("hideTranslation", false)}
        onHideAllAnswers={() => setAllQaFlags("hideModelAnswer", true)}
        onShowAllAnswers={() => setAllQaFlags("hideModelAnswer", false)}
        onCopyPrompt={(part) => void copyPrompt(part)}
        onOpenCopyDialog={() => setShowCopyDialog(true)}
        onPasteQuestions={() => setShowPasteQuestions(true)}
        onPasteHtml={() => setShowPasteHtml(true)}
        snapshotInfo={snapshotInfo}
        useSnapshot={useSnapshot}
        onToggleSnapshot={() => setUseSnapshot((v) => !v)}
        showPreview={showPreview}
        onTogglePreview={() => setShowPreview((v) => !v)}
      />

      {/* FR-41 (M5): imported HTML is editable only after a best-effort parse */}
      {doc.source === "external-html" && (
        <div className="flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          <span>Imported HTML — blocks aren&apos;t editable yet.</span>
          <button
            type="button"
            onClick={() => void parseToBlocks()}
            disabled={busy !== null}
            className="rounded-md bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {busy === "parse" ? "Parsing…" : "Parse to blocks (best-effort)"}
          </button>
          <span className="text-xs text-amber-600">FR-41</span>
        </div>
      )}

      {showPasteQuestions && (
        <PasteQuestionsModal
          onClose={() => setShowPasteQuestions(false)}
          onResult={applyImportedBlocks}
        />
      )}
      {showPasteHtml && (
        <PasteHtmlModal onClose={() => setShowPasteHtml(false)} onImported={applyImportedHtml} />
      )}
      {showCopyDialog && <CopyDialog doc={doc} onClose={() => setShowCopyDialog(false)} />}

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
              onReorder={reorderBlock}
              onSplitBelow={splitBlock}
              onRemoveFocusUp={removeBlockFocusUp}
              onUpdateTags={updateBlockTags}
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
          Mode:{" "}
          <strong>
            {convertMode === "ai" ? `AI (${aiModel ?? "DeepSeek"})` : "Template (offline)"}
          </strong>
        </span>
        {convertedAt && (
          <span>Last converted: {new Date(convertedAt).toLocaleTimeString()}</span>
        )}
        {counts.translationsTotal > 0 && (
          <span className="rounded bg-zinc-100 px-1.5 py-0.5">
            {counts.translationsHidden}/{counts.translationsTotal} translations hidden ·{" "}
            {counts.answersHidden}/{counts.answersTotal} answers hidden
          </span>
        )}
        {practiceMode && (
          <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">Practice PDF on</span>
        )}
        {status && <span className="text-zinc-400">{status}</span>}
        {useSnapshot && snapshotInfo && (
          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">
            Snapshot rules v{snapshotInfo.version}
          </span>
        )}
        <span className="ml-auto">
          {instructionsVersion ? <>Instructions v{instructionsVersion} · </> : ""}
          Design tokens: instructions file (TOKENS block)
        </span>
      </div>
    </div>
  );
}
