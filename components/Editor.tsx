// components/Editor.tsx — main editor (M6 redesign, FR-24/27/28/29/46).
//
// State:
//   doc          — the editable document (blocks + metadata)
//   persisted    — whether the server knows this doc id
//   isDirty      — unsaved changes indicator (status bar)
//   practiceMode — the Practice master key: every block shown, "My answer"
//                  boxes for questions and paragraphs, Check/Hide-answers cycle
//   checked      — practice: model answers revealed side-by-side
//   previewOpen  — the full-screen on-demand preview sheet (stateless render)
//
// Flow (M6): Rethink with AI → the doc's blocks are REPLACED by editable
// structured blocks (one conversion, then local edits re-render instantly).
// Preview and PDF render on demand from the CURRENT document — no convert
// gating, no stale-preview state. Save persists blocks + the instructions
// version that produced them (snapshot bookkeeping, FR-23).

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Block as BlockModel, BlockType, Document, PreviewHidden, PreviewOptions } from "@/lib/types";
import {
  createBlock,
  createDocument,
  replaceBlockType,
  setBlockContent,
  DEFAULT_PREVIEW_OPTIONS,
} from "@/lib/types";

import Toolbar from "./Toolbar";
import FloatingDetailedToggle from "./FloatingDetailedToggle";
import FloatingThemeToggle from "./FloatingThemeToggle"; // 2026-08-10: floating 🌙/☀️ top-right
import BlockList from "./BlockList";
import PreviewSheet from "./PreviewSheet";
import PasteQuestionsModal from "./PasteQuestionsModal";
import PasteBlocksModal from "./PasteBlocksModal";
import PasteHtmlModal from "./PasteHtmlModal";
import CopyDialog from "./CopyDialog";
import { parseHtmlToBlocks } from "@/lib/html-to-blocks"; // FR-41 (M5)

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

/** True when a block carries any real content (used by paste-questions import). */
function blockHasContent(b: BlockModel): boolean {
  const c = b.content as Record<string, unknown>;
  return Object.entries(c).some(([key, value]) => {
    if (key === "hideTranslation" || key === "hideModelAnswer") return false;
    if (Array.isArray(value)) {
      // vocab/expressions rows ({ term, def }) OR essay paragraphs (strings)
      return (value as unknown[]).some((x) =>
        typeof x === "string" ? x.trim().length > 0 : Boolean((x as { term?: string }).term || (x as { def?: string }).def),
      );
    }
    return typeof value === "string" && value.trim().length > 0;
  });
}

export default function Editor({ docId }: { docId: string | null }) {
  const [doc, setDoc] = useState<Document | null>(null);
  const [loading, setLoading] = useState(docId !== null);
  const [persisted, setPersisted] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [practiceMode, setPracticeMode] = useState(false); // M6 master key
  const [checked, setChecked] = useState(false); // M6: practice "Check"
  // M7 round 6: in-app two-step confirm for "Reset practice" (no browser popup).
  const [confirmingReset, setConfirmingReset] = useState(false);
  // 2026-08-10 M7 round 4 (user: "focus… it should show the other way around
  // like the detailed"): the toolbar toggle is "Detailed", UNCHECKED by
  // default — focus mode (main content only) IS the default state, and
  // checking "Detailed" reveals translations/analysis/vocab.
  const [detailed, setDetailed] = useState(false);
  // M7 round 7: autosave toggle — ON by default (M6 behavior). Turned off, the
  // quiet debounced save stops; only Save (button / Cmd+S) persists. Preference
  // remembered in localStorage (`writer-app:autosave`) like add-type/copy-selection.
  const [autosave, setAutosave] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem("writer-app:autosave") === "off") setAutosave(false);
    } catch {
      /* storage unavailable — keep default */
    }
  }, []);
  const toggleAutosave = () => {
    setAutosave((v) => {
      const next = !v;
      try {
        localStorage.setItem("writer-app:autosave", next ? "on" : "off");
      } catch {
        /* storage unavailable — setting is session-only */
      }
      return next;
    });
  };
  // M7 round 7 (user: "when it toggle detailed on the writer page it shifts my
  // question as new data is added… then it again shift me on another part"):
  // toggling Detailed adds/removes enrichment ABOVE and INSIDE the visible
  // blocks, so the browser keeps scrollY fixed and the view shifts. Fix: before
  // flipping the state, remember the block row currently near the top of the
  // viewport (elementFromPoint at the column's horizontal center), then after
  // the re-render (rAF — React has committed by then) scroll back so that row
  // sits at the exact viewport position it had. Content added below the anchor
  // never moves it; content above changes height → delta correction. No-op
  // when the anchor is gone or nothing moved.
  const toggleDetailed = () => {
    const anchor = document
      .elementFromPoint(window.innerWidth / 2, 100)
      ?.closest("[data-block-id]") as HTMLElement | null;
    const anchorTopBefore = anchor?.getBoundingClientRect().top ?? null;
    setDetailed((v) => !v);
    requestAnimationFrame(() => {
      if (anchor && anchor.isConnected && anchorTopBefore !== null) {
        const delta = anchor.getBoundingClientRect().top - anchorTopBefore;
        if (delta !== 0) window.scrollTo(0, window.scrollY + delta);
      }
    });
  };
  const [previewOpen, setPreviewOpen] = useState(false); // M6: on-demand sheet
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  // 2026-08-10: preview display options — field toggles (omitted enrichment
  // for qa/paragraph/essay blocks; main content is never hidden) + "Empty
  // lines" (blank ruled areas where the model answer is hidden). The SAME
  // options drive the PDF/HTML downloads, so the download is always exactly
  // what the preview shows.
  const [previewOptions, setPreviewOptions] = useState<PreviewOptions>(DEFAULT_PREVIEW_OPTIONS);
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);
  const [aiModel, setAiModel] = useState<string | null>(null); // FR-28: model name in status bar
  const [instructionsVersion, setInstructionsVersion] = useState<string | null>(null); // FR-28
  const [snapshotInfo, setSnapshotInfo] = useState<{ version: string; differs: boolean } | null>(null); // FR-23
  const [useSnapshot, setUseSnapshot] = useState(false); // FR-23: convert with the doc's own rules
  const [lastConvertInstructionsVersion, setLastConvertInstructionsVersion] = useState<string | null>(null); // FR-23: sent on save
  const [showPasteQuestions, setShowPasteQuestions] = useState(false); // FR-38
  const [showPasteBlocks, setShowPasteBlocks] = useState(false); // M6: JSON block paste
  const [showPasteHtml, setShowPasteHtml] = useState(false); // FR-40
  const [showCopyDialog, setShowCopyDialog] = useState(false); // FR-50

  const docRef = useRef(doc);
  docRef.current = doc;
  const previewOptionsRef = useRef(previewOptions);
  previewOptionsRef.current = previewOptions;
  const previewSeqRef = useRef(0); // 2026-08-10 #6: latest toggle wins the render
  // M7 round 7: the editor's scroll container — the floating Detailed pill
  // listens to it to appear only when the toolbar is scrolled out of view.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const persistedRef = useRef(persisted);
  persistedRef.current = persisted;
  const useSnapshotRef = useRef(useSnapshot);
  useSnapshotRef.current = useSnapshot;
  const lastConvertRef = useRef<string | null>(null);
  const busyRef = useRef<string | null>(null);
  const savingRef = useRef(false); // M6: quiet autosave in flight — no busy state
  const convertRef = useRef<(goal: string | null) => Promise<void>>(async () => {});
  const saveRef = useRef<() => Promise<boolean>>(async () => false);

  function beginBusy(label: string) {
    busyRef.current = label;
    setBusy(label);
  }

  function endBusy() {
    busyRef.current = null;
    setBusy(null);
  }

  // ---- init: load by id, else start a fresh document with the route's id ----
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
          // fall through to a fresh document
        }
      }
      // FR-24: a fresh document starts with one empty paragraph block — typing
      // begins immediately. Keeping the route's id lets the first save create it.
      const fresh = createDocument("", docId ?? undefined);
      fresh.blocks = [createBlock("paragraph")];
      if (!cancelled) {
        setDoc(fresh);
        setLoading(false);
      }
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

  // ---- keyboard shortcuts (FR-7): Cmd+Enter converts, Cmd+S saves ----
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === "Enter") {
        e.preventDefault();
        void convertRef.current(null);
      } else if (e.key === "s") {
        e.preventDefault();
        void saveRef.current();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // ---- generic mutate: mark dirty ----
  function mutateDoc(mutate: (d: Document) => Document) {
    setDoc((prev) => {
      if (!prev) return prev;
      const next = mutate(prev);
      next.updatedAt = new Date().toISOString();
      return next;
    });
    setIsDirty(true);
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

  // (2026-08-10 M7 round 4: the FR-35 "global visibility" bulk-flag actions
  // and the View dropdown were REMOVED — the preview sheet's field toggles
  // cover hide/show at render time without mutating block data.)

  // ---- visibility counts for the status bar (FR-37) ----
  const qaBlocks = doc ? doc.blocks.filter((b) => b.type === "qa") : [];
  const counts = {
    translationsTotal: qaBlocks.length,
    translationsHidden: qaBlocks.filter((b) => b.content.hideTranslation || doc?.practice?.hideTranslations).length,
    answersTotal: qaBlocks.length,
    answersHidden: qaBlocks.filter((b) => b.content.hideModelAnswer || doc?.practice?.hideModelAnswers).length,
  };

  // ---- conversion (M6, FR-8/9/23/29): AI → editable structured blocks ----
  // One conversion replaces the document's blocks; afterwards every edit
  // re-renders locally — no repeat conversion, no HTML round-trip.
/**
 * 2026-08-10: when the AI groups previously-separate paragraph blocks into ONE
 * essay, merge their practice answers in order. Only fires when every essay
 * paragraph exactly matches a CONTIGUOUS run of the previous paragraphs' text
 * (the AI preserves wording, so this holds for regroupings of untouched prose).
 */
function essayAnswerFromParagraphs(
  prevBlocks: BlockModel[],
  essayParagraphs: string[],
): string | undefined {
  const target = essayParagraphs.map((p) => p.trim());
  const prose = prevBlocks
    .filter((b) => b.type === "paragraph")
    .map((b) => ({ text: b.content.text.trim(), answer: b.content.userAnswer?.trim() ?? "" }));
  for (let i = 0; i + target.length <= prose.length; i++) {
    let ok = true;
    for (let j = 0; j < target.length; j++) {
      if (prose[i + j].text !== target[j]) {
        ok = false;
        break;
      }
    }
    if (ok) {
      const answers = prose
        .slice(i, i + target.length)
        .map((p) => p.answer)
        .filter(Boolean);
      return answers.length > 0 ? answers.join("\n\n") : undefined;
    }
  }
  return undefined;
}

  async function convert(goal: string | null) {
    const current = docRef.current;
    if (!current || busyRef.current) return;
    beginBusy("converting");
    setError(null);
    try {
      const useSnap = useSnapshotRef.current;
      const res = await fetch("/api/convert/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc: current, goal, useSnapshot: useSnap }),
      });
      if (!res.ok) {
        // FR-30: inline, actionable server errors (e.g. missing API key) pass through
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Conversion failed (${res.status})`);
      }
      const body = (await res.json()) as { blocks: BlockModel[]; instructionsVersion?: string };
      if (!Array.isArray(body.blocks) || body.blocks.length === 0) {
        throw new Error("The AI returned no blocks — try again or check the instructions");
      }
      // M6 + 2026-08-10: practice answers + visibility choices survive
      // conversion. qa matches on question text, paragraphs on text, essays on
      // the joined paragraphs — plus a run fallback: when the AI groups
      // previously-separate paragraph blocks into ONE essay (the essay-type
      // rule), their answers merge in order (user-reported: answers were lost).
      const prev = new Map<string, { userAnswer?: string; hideTranslation?: boolean; hideModelAnswer?: boolean }>();
      for (const b of current.blocks) {
        if (b.type === "qa" && b.content.question.trim()) {
          prev.set(`q:${b.content.question.trim()}`, b.content);
        } else if (b.type === "paragraph" && b.content.text.trim()) {
          prev.set(`p:${b.content.text.trim()}`, { userAnswer: b.content.userAnswer });
        } else if (b.type === "essay") {
          const joined = b.content.paragraphs.map((p) => p.trim()).filter(Boolean).join("\n\n");
          if (joined) prev.set(`e:${joined}`, { userAnswer: b.content.userAnswer });
        }
      }
      const blocks = body.blocks.map((b) => {
        if (b.type === "qa") {
          const prevContent = prev.get(`q:${b.content.question.trim()}`);
          if (!prevContent) return b;
          return setBlockContent(b, {
            ...b.content,
            userAnswer: prevContent.userAnswer,
            hideTranslation: prevContent.hideTranslation ?? false,
            hideModelAnswer: prevContent.hideModelAnswer ?? false,
          });
        }
        if (b.type === "paragraph") {
          const prevContent = prev.get(`p:${b.content.text.trim()}`);
          if (!prevContent) return b;
          return setBlockContent(b, {
            ...b.content,
            userAnswer: prevContent.userAnswer,
          });
        }
        if (b.type === "essay") {
          const joined = b.content.paragraphs.map((p) => p.trim()).filter(Boolean).join("\n\n");
          const matched = prev.get(`e:${joined}`);
          const answer = matched?.userAnswer ?? essayAnswerFromParagraphs(current.blocks, b.content.paragraphs);
          if (answer == null) return b;
          return setBlockContent(b, { ...b.content, userAnswer: answer });
        }
        return b;
      });
      setDoc((prev) => (prev ? { ...prev, blocks, updatedAt: new Date().toISOString() } : prev));
      if (body.instructionsVersion) {
        lastConvertRef.current = body.instructionsVersion;
        setLastConvertInstructionsVersion(body.instructionsVersion);
      }
      setIsDirty(true);
      setStatus(
        `Structured into ${blocks.length} editable block${blocks.length === 1 ? "" : "s"}${
          useSnap ? ` · snapshot rules v${snapshotInfo?.version}` : ""
        } — every edit re-renders instantly`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Conversion failed");
    } finally {
      endBusy();
    }
  }

  // ---- on-demand preview (M6): POST the current doc, show the sheet ----
  // 2026-08-10 #5 (bug fix): `optionsOverride` lets a toggle re-render with the
  // NEW values in the same tick — the old code read the stale closure
  // (`previewHidden` from the last render), so the preview showed the previous
  // toggle state until a second click (user: "i have to unclick and click").
  // 2026-08-10 #6 (glitch fix): a sequence guard drops out-of-order responses —
  // rapid toggles each POST a re-render, and only the LATEST one is applied.
  async function openPreview(optionsOverride?: PreviewOptions) {
    const current = docRef.current;
    if (!current) return;
    const seq = ++previewSeqRef.current;
    busyRef.current = "preview";
    setBusy("preview");
    setError(null);
    try {
      const options = optionsOverride ?? previewOptionsRef.current;
      const res = await fetch("/api/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc: current, hidden: options.hidden, emptyLines: options.emptyLines }),
      });
      if (seq !== previewSeqRef.current) return; // a newer toggle superseded this render
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Preview failed");
      }
      const body = (await res.json()) as { html: string };
      setPreviewHtml(body.html);
      setPreviewOpen(true);
    } catch (e) {
      if (seq === previewSeqRef.current) setError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      if (seq === previewSeqRef.current) {
        busyRef.current = null;
        setBusy(null);
      }
    }
  }

  // ---- paste blocks/questions (FR-38, M6): replace an empty document, else append ----
  function applyImportedBlocks(blocks: BlockModel[]) {
    const current = docRef.current;
    if (!current || blocks.length === 0) return;
    const isEmpty = !current.blocks.some(blockHasContent);
    mutateDoc((d) => ({ ...d, blocks: isEmpty ? blocks : [...d.blocks, ...blocks] }));
    setShowPasteQuestions(false);
    setShowPasteBlocks(false);
    setStatus(`Imported ${blocks.length} block${blocks.length === 1 ? "" : "s"}`);
  }

  // ---- paste HTML back (FR-40): imported as an opaque document ----
  function applyImportedHtml(doc: Document, html: string) {
    setDoc(doc);
    setPersisted(true);
    setIsDirty(false);
    setShowPasteHtml(false);
    setSnapshotInfo(null); // fresh import has no recorded rules (FR-23)
    setUseSnapshot(false);
    setStatus("Imported HTML document — parse it to edit as blocks");
  }

  // ---- parse to blocks (FR-41, M5): imported HTML → editable blocks ----
  async function parseToBlocks() {
    const current = docRef.current;
    if (!current || busyRef.current) return;
    beginBusy("parse");
    setError(null);
    try {
      const res = await fetch(`/api/documents/${current.id}/html`);
      if (!res.ok) throw new Error("Could not load the saved HTML — save the document first");
      const source = await res.text();
      const { blocks: parsed, unparsedCount } = parseHtmlToBlocks(source);
      if (parsed.length === 0) throw new Error("No recognizable blocks found in the HTML");
      // Replace blocks + flip the source; the document becomes fully editable.
      setDoc((prev) =>
        prev ? { ...prev, blocks: parsed, source: "editor", updatedAt: new Date().toISOString() } : prev,
      );
      setIsDirty(true);
      setStatus(
        `Parsed to ${parsed.length} editable block${parsed.length === 1 ? "" : "s"}${
          unparsedCount ? ` — ${unparsedCount} kept as raw HTML` : ""
        }`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Parse failed");
    } finally {
      endBusy();
    }
  }

  // ---- save (FR-17, M6): blocks + the instructions version that structured them ----
  // The server round-trip lives in `persist()` (shared by the Save button /
  // Cmd+S and the quiet autosave); `save()` wraps it with the busy state.
  async function persist(): Promise<boolean> {
    const current = docRef.current;
    if (!current) return false;
    try {
      const payload = {
        doc: current,
        // FR-23: recorded only when this session converted the doc — the server
        // snapshots the active instructions at that version.
        instructionsVersion: lastConvertRef.current ?? undefined,
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
      // Only clear the dirty flag when no edits landed while the request was
      // in flight (mutateDoc always builds a fresh document object).
      if (docRef.current === current) setIsDirty(false);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      return false;
    }
  }

  async function save(): Promise<boolean> {
    if (busyRef.current) return false;
    beginBusy("saving");
    setError(null);
    try {
      const ok = await persist();
      if (ok && docRef.current) setStatus("Saved");
      return ok;
    } finally {
      endBusy();
    }
  }

  // ---- autosave (M6): quiet debounced save — practice answers and any edit
  // land on the server ~1.2s after typing stops, without touching the toolbar's
  // busy state or stealing focus. Guards: never during a busy operation, never
  // overlapping itself, never before the doc has loaded. M7 round 7: the
  // toolbar "Autosave" toggle disables it entirely (manual Save still works).
  useEffect(() => {
    if (loading || !doc || !isDirty || !autosave) return;
    const timer = setTimeout(() => {
      void (async () => {
        if (busyRef.current || savingRef.current) return;
        savingRef.current = true;
        try {
          if (await persist()) setStatus("Saved automatically");
        } finally {
          savingRef.current = false;
        }
      })();
    }, 1200);
    return () => clearTimeout(timer);
  }, [doc, loading, isDirty, autosave]);

  // ---- downloads (2026-08-10 #6, moved into the preview sheet): the buttons
  // in Preview download EXACTLY what is currently displayed — the same
  // hidden/emptyLines options that produced the preview HTML. No save, no
  // gating, no variant menu (the user sees the document before downloading). ----
  async function downloadPdfDisplay() {
    const current = docRef.current;
    if (!current || busyRef.current) return;
    beginBusy("pdf");
    setError(null);
    try {
      const options = previewOptionsRef.current;
      const res = await fetch(`/api/documents/${current.id}/pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc: current, hidden: options.hidden, emptyLines: options.emptyLines }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "PDF generation failed");
      }
      downloadBlob(await res.blob(), safeFilename(current.title, "pdf"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDF download failed");
    } finally {
      endBusy();
    }
  }

  // The preview HTML is already in memory (set by openPreview) — download it
  // as-is, byte for byte what the sheet shows.
  function downloadHtmlDisplay() {
    if (!previewHtml) return;
    downloadBlob(new Blob([previewHtml], { type: "text/html;charset=utf-8" }), safeFilename(docRef.current?.title ?? "", "html"));
  }

  // ---- practice (M6): clear every "My answer" (qa + paragraph + essay) so the
  // doc can be re-practiced. 2026-08-10 M7 round 6 (user: "it gives a browser
  // pop up i dont want that"): the confirm is an IN-APP banner (confirmingReset
  // state), never window.confirm. ----
  function resetPractice() {
    mutateDoc((d) => ({
      ...d,
      blocks: d.blocks.map((b) =>
        (b.content as { userAnswer?: string }).userAnswer
          ? setBlockContent(b, { ...b.content, userAnswer: undefined })
          : b,
      ),
    }));
    setChecked(false);
    setStatus("Practice answers cleared");
  }

  convertRef.current = convert;
  saveRef.current = save;

  if (loading) {
    return <div className="p-8 text-sm text-zinc-500">Loading document…</div>;
  }

  if (!doc) {
    return <div className="p-8 text-sm text-zinc-500">Creating document…</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <Toolbar
        title={doc.title}
        onTitleChange={setTitle}
        docTags={doc.tags}
        onTagsChange={setDocTags}
        busy={busy}
        error={error}
        onConvert={(goal) => void convert(goal)}
        onSave={() => void save()}
        onPreview={() => void openPreview()}
        practiceMode={practiceMode}
        onTogglePractice={() => {
          setPracticeMode((v) => !v);
          setChecked(false);
          setConfirmingReset(false);
        }}
        checked={checked}
        onToggleChecked={() => setChecked((v) => !v)}
        onResetPractice={() => setConfirmingReset(true)}
        detailed={detailed}
        onToggleDetailed={toggleDetailed}
        autosave={autosave}
        onToggleAutosave={toggleAutosave}
        onOpenCopyDialog={() => setShowCopyDialog(true)}
        onPasteQuestions={() => setShowPasteQuestions(true)}
        onPasteBlocks={() => setShowPasteBlocks(true)}
        onPasteHtml={() => setShowPasteHtml(true)}
        snapshotInfo={snapshotInfo}
        useSnapshot={useSnapshot}
        onToggleSnapshot={() => setUseSnapshot((v) => !v)}
      />

      {/* FR-41 (M5): imported HTML is editable only after a best-effort parse */}
      {doc.source === "external-html" && (
        <div className="flex flex-wrap items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          <span>This document was imported as HTML — parse it to edit the content as blocks.</span>
          <button
            type="button"
            onClick={() => void parseToBlocks()}
            disabled={busy !== null}
            className="rounded-lg bg-amber-600 px-3 py-1 text-xs font-medium text-[#fff] transition-colors hover:bg-amber-700 disabled:opacity-50"
          >
            {busy === "parse" ? "Parsing…" : "Parse to blocks"}
          </button>
        </div>
      )}

      {practiceMode && (
        <div className="border-b border-blue-100 bg-blue-50/60 px-4 py-1.5 text-xs text-blue-800">
          Practice mode — every question and paragraph has a “My answer” box. Your answers are kept
          separate from the reference answers; Check reveals them side-by-side.
        </div>
      )}

      {/* M7 round 6: in-app confirm for Reset practice (no browser popup) */}
      {confirmingReset && practiceMode && (
        <div className="flex flex-wrap items-center gap-3 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          <span className="min-w-0 flex-1">
            Clear every “My answer” so you can practice this document again? Your written answers are
            removed from every block — reference answers stay untouched.
          </span>
          <button
            type="button"
            onClick={() => {
              resetPractice();
              setConfirmingReset(false);
            }}
            className="rounded-lg bg-red-600 px-3 py-1 text-xs font-semibold text-[#fff] transition-colors hover:bg-red-700"
          >
            Clear answers
          </button>
          <button
            type="button"
            onClick={() => setConfirmingReset(false)}
            className="rounded-lg border border-red-200 bg-white px-3 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-100"
          >
            Cancel
          </button>
        </div>
      )}

      {showPasteQuestions && (
        <PasteQuestionsModal
          onClose={() => setShowPasteQuestions(false)}
          onResult={applyImportedBlocks}
        />
      )}
      {showPasteBlocks && (
        <PasteBlocksModal onClose={() => setShowPasteBlocks(false)} onResult={applyImportedBlocks} />
      )}
      {showPasteHtml && (
        <PasteHtmlModal onClose={() => setShowPasteHtml(false)} onImported={applyImportedHtml} />
      )}
      {showCopyDialog && (
        <CopyDialog doc={doc} useSnapshot={useSnapshot} onClose={() => setShowCopyDialog(false)} />
      )}

      <div className="flex flex-1 overflow-hidden">
        <div ref={scrollRef} className="flex-1 overflow-y-auto bg-white">
          {/* 2026-08-10 M7 round 4 (user: "a lot of blank space around the text
              fields on laptop… on phone it is fine"): the fixed max-w-2xl
              column left huge gutters on desktop — widened to max-w-4xl.
              2026-08-10 M7 round 6 (user: "there is still a lot of empty space
              around the paragraph and questions"): widened again to max-w-6xl.
              Phone (full-width) is untouched. */}
          <div className="mx-auto max-w-6xl px-6 py-8">
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
              practiceMode={practiceMode}
              checked={checked}
              detailed={detailed}
            />
          </div>
        </div>
      </div>

      {/* M7 round 7 (user: "I have to go to the top again if I want to toggle
          the detailed version"): the toolbar's Detailed toggle scrolls away —
          this fixed bottom-right copy appears once the toolbar is out of view
          and drives the SAME state (no divergence). */}
      <FloatingDetailedToggle
        detailed={detailed}
        onToggleDetailed={toggleDetailed}
        containerRef={scrollRef}
      />

      {/* 2026-08-10 (user: "add a floating button for dark and light mode too
          ....top right"): the navbar's theme toggle scrolls away with the
          toolbar — this fixed top-right copy appears once it is out of view
          and stays in sync with the navbar toggle (shared .dark class). */}
      <FloatingThemeToggle containerRef={scrollRef} />

      {previewOpen && (
        <PreviewSheet
          html={previewHtml}
          busy={busy !== null}
          options={previewOptions}
          onOptionsChange={(next) => {
            setPreviewOptions(next);
            void openPreview(next); // re-render with the NEW options (no stale closure)
          }}
          onDownloadPdf={() => void downloadPdfDisplay()}
          onDownloadHtml={() => downloadHtmlDisplay()}
          onClose={() => setPreviewOpen(false)}
        />
      )}

      {/* Status bar (FR-28 partial) */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-zinc-200 bg-white px-4 py-1.5 text-xs text-zinc-500">
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
          <strong className="font-medium text-zinc-600">AI · {aiModel ?? "DeepSeek"}</strong>
        </span>
        {counts.translationsTotal > 0 && (
          <span className="rounded-full bg-zinc-100 px-2 py-0.5">
            {counts.translationsHidden}/{counts.translationsTotal} translations hidden ·{" "}
            {counts.answersHidden}/{counts.answersTotal} answers hidden
          </span>
        )}
        {practiceMode && (
          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700">Practice on</span>
        )}
        {checked && (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">Checked</span>
        )}
        {status && <span className="text-zinc-400">{status}</span>}
        {!autosave && (
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-500">
            Autosave off — Save manually (⌘S)
          </span>
        )}
        {useSnapshot && snapshotInfo && (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">
            Snapshot rules v{snapshotInfo.version}
          </span>
        )}
        {instructionsVersion && <span className="ml-auto">Instructions v{instructionsVersion}</span>}
      </div>
    </div>
  );
}
