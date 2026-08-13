// components/TestDialog.tsx — the Test generator (to-do item 5, 2026-08-13).
//
// "Test…" button on the home + library pages. Picks documents (checkbox list)
// → Questions / Essays / Both → optional counts ("How many questions" /
// "How many essays" — each input disabled when its type isn't selected) →
// optional "Let AI pick randomly". Two paths:
//   - Random (default, no AI): buildTestDocument picks qa/essay blocks locally
//     (instant, free) → POST /api/documents → open the editor.
//   - AI: POST /api/test serializes the chosen docs (practice answers never
//     included) and the AI picks/creates the test → open the editor.
// Result: a document titled "Test — <date>" that works like any document
// (practice, preview, PDF, copy).

"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Document } from "@/lib/types";
import { buildTestDocument } from "@/lib/test-generator";

type TestType = "questions" | "essays" | "both";

interface TestDialogProps {
  documents: Document[]; // full docs (blocks included) — from listDocuments
}

/** Per-document counts shown next to each checkbox: "3 Q · 1 E". */
function blockCounts(doc: Document): { qa: number; essays: number } {
  let qa = 0;
  let essays = 0;
  for (const b of doc.blocks) {
    if (b.type === "qa" && b.content.question.trim()) qa++;
    else if (b.type === "essay") essays++;
  }
  return { qa, essays };
}

export default function TestDialog({ documents }: TestDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [type, setType] = useState<TestType>("questions");
  const [qCount, setQCount] = useState("");
  const [eCount, setECount] = useState("");
  const [useAI, setUseAI] = useState(false); // "Let AI pick randomly"
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedDocs = useMemo(() => documents.filter((d) => selected.has(d.id)), [documents, selected]);
  const includeQuestions = type !== "essays";
  const includeEssays = type !== "questions";
  const qParsed = qCount.trim() ? parseInt(qCount, 10) : null;
  const eParsed = eCount.trim() ? parseInt(eCount, 10) : null;
  // Validation as decided: at least one document; counts only apply to the
  // selected types and must be positive when filled in.
  const qInvalid = includeQuestions && qParsed !== null && !(qParsed > 0);
  const eInvalid = includeEssays && eParsed !== null && !(eParsed > 0);
  const valid = selected.size > 0 && !qInvalid && !eInvalid;

  function toggleDoc(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function createTest() {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (useAI) {
        const res = await fetch("/api/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            docIds: [...selected],
            questions: includeQuestions ? qParsed : null,
            essays: includeEssays ? eParsed : null,
          }),
        });
        const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
        if (!res.ok || !body.id) throw new Error(body.error ?? "Test generation failed");
        router.push(`/doc/${body.id}`);
      } else {
        // Random path: pick locally, instant + free.
        const doc = buildTestDocument(selectedDocs, {
          questions: includeQuestions ? qParsed : null,
          essays: includeEssays ? eParsed : null,
        });
        const res = await fetch("/api/documents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ doc }),
        });
        const body = (await res.json().catch(() => ({}))) as { doc?: Document; error?: string };
        if (!res.ok || !body.doc) throw new Error(body.error ?? "Could not save the test");
        router.push(`/doc/${body.doc.id}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Test generation failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Build a practice test from your documents"
        className="rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:bg-zinc-50"
      >
        Test…
      </button>

      {open && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]" onClick={() => setOpen(false)}>
          <div
            className="max-h-[88vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-zinc-200 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-zinc-100 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">Create a test</h2>
                <p className="mt-0.5 text-sm text-zinc-500">
                  Questions and essays are picked from your documents — the test opens as a normal
                  document.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600"
                title="Close"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 px-5 py-4">
              {/* Documents — checkbox list */}
              <div>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-zinc-400">
                  From documents
                </p>
                {documents.length === 0 ? (
                  <p className="text-sm text-zinc-400">No saved documents yet — save something first.</p>
                ) : (
                  <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border border-zinc-200 bg-zinc-50 p-2">
                    {documents.map((doc) => {
                      const { qa, essays } = blockCounts(doc);
                      const disabled = qa === 0 && essays === 0;
                      return (
                        <label
                          key={doc.id}
                          className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm text-zinc-700 hover:bg-white ${
                            disabled ? "cursor-not-allowed opacity-40" : ""
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selected.has(doc.id)}
                            onChange={() => toggleDoc(doc.id)}
                            disabled={disabled}
                            className="h-3.5 w-3.5 accent-blue-600"
                          />
                          <span className="truncate">
                            {doc.title || "(untitled)"}
                            {!disabled && (
                              <span className="ml-1.5 text-[11px] text-zinc-400">
                                {qa} Q · {essays} E
                              </span>
                            )}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Type + counts */}
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                <label className="flex cursor-pointer items-center gap-1.5 text-sm text-zinc-700">
                  <input
                    type="radio"
                    name="test-type"
                    checked={type === "questions"}
                    onChange={() => setType("questions")}
                    className="h-3.5 w-3.5 accent-blue-600"
                  />
                  Questions
                </label>
                <label className="flex cursor-pointer items-center gap-1.5 text-sm text-zinc-700">
                  <input
                    type="radio"
                    name="test-type"
                    checked={type === "essays"}
                    onChange={() => setType("essays")}
                    className="h-3.5 w-3.5 accent-blue-600"
                  />
                  Essays
                </label>
                <label className="flex cursor-pointer items-center gap-1.5 text-sm text-zinc-700">
                  <input
                    type="radio"
                    name="test-type"
                    checked={type === "both"}
                    onChange={() => setType("both")}
                    className="h-3.5 w-3.5 accent-blue-600"
                  />
                  Both
                </label>

                {/* Counts — each disabled when its type isn't selected */}
                <label className="flex items-center gap-1.5 text-sm text-zinc-500">
                  Questions
                  <input
                    type="number"
                    min={1}
                    value={qCount}
                    onChange={(e) => setQCount(e.target.value)}
                    disabled={!includeQuestions}
                    placeholder="3–5"
                    className={`w-16 rounded-md border px-2 py-1 text-sm text-zinc-800 outline-none focus:border-blue-400 ${
                      !includeQuestions ? "opacity-40" : ""
                    } ${qInvalid ? "border-red-300 bg-red-50" : "border-zinc-200 bg-zinc-50"}`}
                  />
                </label>
                <label className="flex items-center gap-1.5 text-sm text-zinc-500">
                  Essays
                  <input
                    type="number"
                    min={1}
                    value={eCount}
                    onChange={(e) => setECount(e.target.value)}
                    disabled={!includeEssays}
                    placeholder="1–2"
                    className={`w-16 rounded-md border px-2 py-1 text-sm text-zinc-800 outline-none focus:border-blue-400 ${
                      !includeEssays ? "opacity-40" : ""
                    } ${eInvalid ? "border-red-300 bg-red-50" : "border-zinc-200 bg-zinc-50"}`}
                  />
                </label>
              </div>

              {/* AI path */}
              <label className="flex cursor-pointer items-start gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={useAI}
                  onChange={(e) => setUseAI(e.target.checked)}
                  className="mt-0.5 h-3.5 w-3.5 accent-blue-600"
                />
                <span>
                  Let AI pick randomly
                  <span className="block text-xs text-zinc-400">
                    The AI builds the test from your documents (answers filled). Off = picked locally,
                    instant.
                  </span>
                </span>
              </label>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-zinc-100 px-5 py-3.5">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void createTest()}
                disabled={!valid || busy || documents.length === 0}
                className="rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-[#fff] transition-colors hover:bg-blue-700 disabled:opacity-40"
              >
                {busy ? "Creating…" : "Create test"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
