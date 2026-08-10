// components/ThemeToggle.tsx — dark-mode toggle (M7 round 7).
//
// A tiny 🌙/☀️ icon button that flips the `.dark` class on <html> — the
// palette vars in globals.css do the rest (every component switches via the
// var-indirected tokens, no dark: classes anywhere). The preference is
// persisted to `writer-app:theme` localStorage; app/layout.tsx applies it
// BEFORE first paint via a beforeInteractive script (no flash of light).
// Reused in the editor toolbar, the home header, the library header AND the
// floating top-right button (FloatingThemeToggle, 2026-08-10). Every instance
// listens for the `writer-app:theme-change` event + `storage`, so clicking
// ANY toggle keeps ALL icons in sync.
// The preview sheet is a sandboxed iframe without .dark — it always stays
// light (the print spec is light-only by design).

"use client";

import { useEffect, useState } from "react";

const THEME_KEY = "writer-app:theme";
/** Custom event: a theme toggle changed the class — other instances re-sync. */
const THEME_EVENT = "writer-app:theme-change";

function isDark() {
  return document.documentElement.classList.contains("dark");
}

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);

  // Sync with the class on first render (the beforeInteractive script may
  // have set it already — or the user navigated between pages), then follow
  // every other ThemeToggle instance + other tabs.
  useEffect(() => {
    const sync = () => setDark(isDark());
    sync();
    window.addEventListener(THEME_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(THEME_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const toggle = () => {
    const next = !isDark();
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(THEME_KEY, next ? "dark" : "light");
    } catch {
      /* storage unavailable — session-only */
    }
    window.dispatchEvent(new Event(THEME_EVENT));
  };

  return (
    <button
      type="button"
      onClick={toggle}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm transition-colors hover:bg-zinc-100"
    >
      {dark ? "☀️" : "🌙"}
    </button>
  );
}
