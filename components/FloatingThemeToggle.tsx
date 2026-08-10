// components/FloatingThemeToggle.tsx — floating dark/light button (2026-08-10).
//
// User request: "add a floating button for dark and light mode too ....top
// right" — the navbar's 🌙/☀️ scrolls away with the toolbar, so a fixed
// top-right copy follows the user down the document (the Detailed pill lives
// bottom-right; this one is top-right so the two never overlap).
//
// Behavior: appears (fade + slide-in) only once the navbar has scrolled out
// of view — at the top the navbar's own toggle is already visible, so a
// duplicate would just be clutter. It drives the SAME `.dark` class +
// `writer-app:theme` localStorage as every ThemeToggle (via ThemeToggle's
// `writer-app:theme-change` sync event, either button updates both).
// Hidden while the preview sheet is open (the sheet is a fixed inset-0 z-50
// overlay above this pill's z-40).
//
// Scroll detection listens to BOTH the window and the container (same dual
// scroller situation as FloatingDetailedToggle).

"use client";

import { useEffect, useState } from "react";

import ThemeToggle from "./ThemeToggle";

/** Scroll distance (px) past which the navbar is considered out of view. */
const SHOW_AFTER_SCROLL = 200;

interface FloatingThemeToggleProps {
  /** The editor's scroll container (the `overflow-y-auto` content div). */
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export default function FloatingThemeToggle({ containerRef }: FloatingThemeToggleProps) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    const onScroll = () =>
      setScrolled((el ? el.scrollTop > SHOW_AFTER_SCROLL : false) || window.scrollY > SHOW_AFTER_SCROLL);
    onScroll(); // initial state without waiting for the first scroll event
    window.addEventListener("scroll", onScroll, { passive: true });
    el?.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      el?.removeEventListener("scroll", onScroll);
    };
  }, [containerRef]);

  return (
    <div
      className={`fixed right-5 top-5 z-40 transition-all duration-200 ${
        scrolled ? "opacity-100" : "pointer-events-none -translate-y-2 opacity-0"
      }`}
    >
      {/* bg-white is the dominant-surface token (black in dark mode) so the
          floating button reads over any content. */}
      <div className="rounded-full bg-white p-1.5 shadow-lg ring-1 ring-zinc-900/5">
        <ThemeToggle />
      </div>
    </div>
  );
}
