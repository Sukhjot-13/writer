// components/Toolbar.tsx — primary actions (M6 redesign, FR-29/30/35/37/38/39/46/50).
//
// Layout: a title row (brand · title · tags) and an actions row —
// Convert with AI ▾ (primary split) · Save · Preview · Autosave (M7 round 7) ·
// Practice + Detailed + Check/Hide answers · Copy… · Paste ▾.
//
// M6 changes: single AI convert (template mode dropped); on-demand Preview;
// Practice as the master key with a Check/Hide-answers button.
// 2026-08-10: the Download dropdown is GONE — downloads moved into the preview
// sheet (the user sees the exact document before downloading; "Download PDF" /
// "Download HTML" render the current display). The three PDF variants and the
// HTML export were covered by the preview toggles + empty-lines toggle.
// 2026-08-10 M7 round 4 (user feedback): the View ▾ dropdown is GONE too — the
// preview sheet covers everything ("for the preview everything is in there").
// "Reset practice answers" stays reachable as a small link next to the
// Check/Hide answers button while practice is on. The old "Focus" checkbox is
// now "Detailed", UNCHECKED by default (focus mode IS the default) — it
// reveals translations/analysis/vocab when checked (user: "it should show the
// other way around like the detailed or something that fits the theme").
// Instructions moved to the home screen; the Library link was removed (the
// Writer brand links home) but came back in the title row 2026-08-10 M7
// round 6b (user: "add library on navbar too").

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { parseTags } from "@/lib/tags";

interface ToolbarProps {
  title: string;
  onTitleChange: (value: string) => void;
  docTags: string[]; // M5: document tags shown in the library (FR-18)
  onTagsChange: (tags: string[]) => void;
  busy: string | null;
  error: string | null;
  onConvert: (goal: string | null) => void;
  onSave: () => void;
  onPreview: () => void; // M6: open the full-screen preview sheet
  practiceMode: boolean;
  onTogglePractice: () => void;
  // 2026-08-10 M7 round 4: "Detailed" — unchecked = focus mode (the default):
  // only the main content (question+answer, paragraph text, essay paragraphs);
  // checked = translations/analysis/vocab revealed.
  detailed: boolean;
  onToggleDetailed: () => void;
  // M7 round 7: the Autosave toggle — ON by default (quiet debounced save
  // ~1.2s after edits); off = only Save (button / Cmd+S) persists.
  autosave: boolean;
  onToggleAutosave: () => void;
  checked: boolean; // M6: practice "Check" — reveals model answers
  onToggleChecked: () => void;
  onResetPractice: () => void;
  onOpenCopyDialog: () => void; // 2026-08-10 #5: the ONLY copy action (FR-50 dialog)
  onPasteQuestions: () => void;
  onPasteBlocks: () => void; // M6: paste the JSON block array from Copy for AI
  onPasteHtml: () => void;
  snapshotInfo: { version: string; differs: boolean } | null; // FR-23
  useSnapshot: boolean;
  onToggleSnapshot: () => void;
}

function ActionButton({
  onClick,
  disabled,
  primary,
  children,
  title,
}: {
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  children: React.ReactNode;
  title?: string;
}) {
  const base =
    "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40";
  const styles = primary
    ? "bg-blue-600 text-white shadow-sm hover:bg-blue-700"
    : "border border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50";
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title} className={`${base} ${styles}`}>
      {children}
    </button>
  );
}

/** Small dropdown menu — closes on outside click via a fixed overlay. */
function Dropdown({
  label,
  disabled,
  items,
  title,
  align = "right",
}: {
  label: string;
  disabled?: boolean;
  items: { label: string; onClick: () => void; check?: boolean; hint?: string; disabled?: boolean }[];
  title?: string;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <ActionButton onClick={() => setOpen((o) => !o)} disabled={disabled} title={title}>
        {label} <span className="ml-0.5 text-xs opacity-60">▾</span>
      </ActionButton>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className={`absolute z-20 mt-1 min-w-56 rounded-lg border border-zinc-200 bg-white py-1 shadow-xl ${
              align === "right" ? "right-0" : "left-0"
            }`}
          >
            {items.map((item, i) =>
              item.label === "—" ? (
                <div key={i} className="my-1 border-t border-zinc-100" />
              ) : (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    item.onClick();
                  }}
                  disabled={item.disabled}
                  title={item.hint}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  <span className="w-4 shrink-0 text-emerald-600">{item.check ? "✓" : ""}</span>
                  {item.label}
                </button>
              ),
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** 2026-08-10 M7 round 4: the shared checkbox pill (Practice / Detailed).
 *  Exported 2026-08-10 (M7 round 7) so the floating Detailed toggle
 *  (FloatingDetailedToggle) reuses the exact same pill styling. */
export function TogglePill({
  label,
  checked,
  onChange,
  title,
  activeCls = "border-zinc-400 bg-zinc-100",
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  activeCls?: string;
}) {
  return (
    <label
      className={`flex cursor-pointer select-none items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-sm transition-colors hover:border-zinc-400 hover:bg-zinc-50 ${
        checked ? activeCls : "border-zinc-300 text-zinc-700"
      }`}
      title={title}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-3.5 w-3.5 accent-blue-600"
      />
      {label}
    </label>
  );
}

export default function Toolbar({
  title,
  onTitleChange,
  docTags,
  onTagsChange,
  busy,
  error,
  onConvert,
  onSave,
  onPreview,
  practiceMode,
  onTogglePractice,
  detailed,
  onToggleDetailed,
  autosave,
  onToggleAutosave,
  checked,
  onToggleChecked,
  onResetPractice,
  onOpenCopyDialog,
  onPasteQuestions,
  onPasteBlocks,
  onPasteHtml,
  snapshotInfo,
  useSnapshot,
  onToggleSnapshot,
}: ToolbarProps) {
  const [convertOpen, setConvertOpen] = useState(false);
  const [goal, setGoal] = useState("");
  const [tagsDraft, setTagsDraft] = useState(docTags.join(", "));
  useEffect(() => setTagsDraft(docTags.join(", ")), [docTags]);

  return (
    <div className="border-b border-zinc-200 bg-white">
      {/* Title row: brand · Library · title · tags. The brand links home
          (2026-08-10 M7 round 6b, user: "add library on navbar too"): the
          Library link is back in the navbar — the real /library page with
          folders needs a doorway from the editor (the brand only goes home). */}
      <div className="flex flex-wrap items-center gap-2 px-4 pt-2.5">
        <Link
          href="/"
          title="Writer — go to the home page"
          className="flex shrink-0 items-center gap-2 rounded-lg transition-colors hover:bg-zinc-100"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-sm text-white">
            ✎
          </span>
          <span className="hidden text-sm font-semibold text-zinc-800 sm:inline">Writer</span>
        </Link>

        {/* M7 round 6b (user: "add library on navbar too"): the Library is a
            real page with folders now — link it from the editor's navbar. */}
        <Link
          href="/library"
          title="Library — every document and folder"
          className="flex shrink-0 items-center rounded-lg px-2.5 py-1.5 text-sm font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800"
        >
          Library
        </Link>

        <input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Untitled document"
          className="min-w-40 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-lg font-semibold text-zinc-900 outline-none placeholder:font-normal placeholder:text-zinc-300 focus:border-zinc-200 focus:bg-white"
        />
        <input
          value={tagsDraft}
          onChange={(e) => setTagsDraft(e.target.value)}
          onBlur={() => onTagsChange(parseTags(tagsDraft))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
          }}
          placeholder="add tags…"
          title="Document tags, comma-separated — used for filtering in the library"
          className="w-36 rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-xs text-zinc-500 outline-none placeholder:text-zinc-300 focus:border-zinc-200 focus:bg-white focus:text-zinc-700"
        />
      </div>

      {/* Actions row: three visual groups separated by soft dividers —
          document actions · practice · copy/paste. */}
      <div className="flex flex-wrap items-center gap-2 px-4 pb-2.5 pt-1.5">
        {/* Convert with AI split button: primary converts, caret opens the
            goal input + snapshot-rules toggle (M6: AI only — template dropped) */}
        <div className="relative">
          <div className="flex overflow-hidden rounded-lg shadow-sm">
            <button
              type="button"
              onClick={() => onConvert(goal || null)}
              disabled={busy !== null}
              className="bg-blue-600 px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy === "converting" ? "Converting…" : "Convert with AI"}
            </button>
            <button
              type="button"
              onClick={() => setConvertOpen((o) => !o)}
              disabled={busy !== null}
              title="Optional goal and conversion options"
              className="border-l border-blue-700/60 bg-blue-600 px-2 text-xs text-white transition-colors hover:bg-blue-700 disabled:opacity-40"
            >
              ▾
            </button>
          </div>
          {convertOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setConvertOpen(false)} />
              <div className="absolute left-0 z-20 mt-1 w-80 rounded-lg border border-zinc-200 bg-white py-1 shadow-xl">
                <div className="px-3 py-1.5">
                  <label className="text-xs font-medium text-zinc-500" htmlFor="convert-goal">
                    Goal (optional)
                  </label>
                  <input
                    id="convert-goal"
                    value={goal}
                    onChange={(e) => setGoal(e.target.value)}
                    placeholder="e.g. Make it about holidays in Paris"
                    className="mt-1 w-full rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-sm text-zinc-700 outline-none placeholder:text-zinc-300 focus:border-blue-400 focus:bg-white"
                  />
                </div>
                {snapshotInfo && (
                  <>
                    <div className="my-1 border-t border-zinc-100" />
                    <label className="flex cursor-pointer items-start gap-2 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50">
                      <input
                        type="checkbox"
                        checked={useSnapshot}
                        onChange={onToggleSnapshot}
                        className="mt-0.5 h-3.5 w-3.5 accent-blue-600"
                      />
                      <span>
                        Convert with this document&apos;s snapshot rules (v{snapshotInfo.version})
                        {snapshotInfo.differs ? " — differs from active" : ""}
                        <span className="block text-xs text-zinc-400">
                          Uses the instructions this document was made with
                        </span>
                      </span>
                    </label>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        <ActionButton onClick={onSave} disabled={busy !== null} title="Cmd/Ctrl+S">
          {busy === "saving" ? "Saving…" : "Save"}
        </ActionButton>

        <ActionButton onClick={onPreview} disabled={busy !== null} title="Preview the current document — unsaved edits included">
          {busy === "preview" ? "Rendering…" : "Preview"}
        </ActionButton>

        {/* M7 round 7: Autosave toggle — checked = the quiet debounced save
            (default, M6 behavior); unchecked = only Save / Cmd+S persists. */}
        <TogglePill
          label="Autosave"
          checked={autosave}
          onChange={onToggleAutosave}
          title="Autosave: save silently ~1s after each edit. Off = save manually with Save or ⌘S"
        />

        {/* Practice group — separated from the document actions. */}
        <div className="flex flex-wrap items-center gap-2 border-l border-zinc-200 pl-2.5">
          {/* Practice master key: every question + paragraph gets a "My answer"
              box. Check reveals the model answers for qa. */}
          <TogglePill
            label="Practice"
            checked={practiceMode}
            onChange={onTogglePractice}
            title="Practice mode: write 'My answer' under every question and paragraph"
            activeCls="border-emerald-400 bg-emerald-50 text-emerald-800"
          />

          {/* 2026-08-10 M7 round 4: "Detailed" — unchecked by default. Focus
              mode (only the main content) is the default state, so the checked
              "Focus" box was confusing — the toggle now says what checking it
              does: reveal the details (user: "it should show the other way
              around like the detailed or something that fits the theme"). */}
          <TogglePill
            label="Detailed"
            checked={detailed}
            onChange={onToggleDetailed}
            title="Detailed mode: show translations, analysis and vocabulary. Off = focus on the main content only (the default)"
          />

          {practiceMode && (
            <>
              <button
                type="button"
                onClick={onToggleChecked}
                disabled={busy !== null}
                title={checked ? "Hide the reference answers again" : "Reveal the reference answer for every question"}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  checked
                    ? "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
                    : "border border-emerald-300 bg-emerald-50 text-emerald-700 hover:border-emerald-400 hover:bg-emerald-100"
                }`}
              >
                {checked ? "Hide answers" : "Check answers"}
              </button>
              {/* 2026-08-10 M7 round 4: the View dropdown is gone — its only
                  practice-only action stays as this quiet link. */}
              <button
                type="button"
                onClick={onResetPractice}
                disabled={busy !== null}
                title="Clears every 'My answer' so you can practice again"
                className="rounded-lg px-1.5 py-1 text-xs text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-40"
              >
                Reset practice
              </button>
            </>
          )}
        </div>

        {/* Copy / Paste group */}
        <div className="flex flex-wrap items-center gap-2 border-l border-zinc-200 pl-2.5">
          {/* Copy (2026-08-10 #5, user request): exactly ONE option — the copy
              dialog. The AI-instruction copies moved into the paste sections
              ("Copy for AI" lives in Paste ▾ → Paste blocks (AI); the other AI
              gets its instructions from the paste-box copy buttons), so the old
              three FR-39 items were removed. */}
          <ActionButton onClick={onOpenCopyDialog} disabled={busy !== null} title="Copy parts of this document as clean text">
            Copy…
          </ActionButton>
          <Dropdown
            label="Paste"
            disabled={busy !== null}
            title="Paste blocks, questions, or HTML from any external AI"
            items={[
              { label: "Paste blocks (AI)…", onClick: onPasteBlocks, hint: "JSON block array copied via Copy for AI" },
              { label: "Paste questions…", onClick: onPasteQuestions, hint: "Structure with AI or parse locally" },
              { label: "Paste HTML…", onClick: onPasteHtml, hint: "Import HTML from any external AI" },
            ]}
          />
        </div>
      </div>

      {error && (
        <div className="border-t border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      )}
    </div>
  );
}
