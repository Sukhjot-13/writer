// components/FloatingDetailedToggle.tsx — floating "Detailed" pill (M7 round 7).
//
// User feedback: "when I scroll down, I have to go to the top again if I want
// to toggle the detailed version of the page when I don't remember the meaning
// of a question" — the toolbar's Detailed toggle scrolls away with the toolbar,
// so a fixed bottom-right copy of it follows the user down the document.
//
// Behavior: appears (fade + slide-in) only once the scroll container has been
// scrolled far enough that the toolbar is out of view; hides again when the
// user returns to the top. It drives the SAME `detailed` state as the toolbar
// toggle — no new state, no divergence. Hidden while the preview sheet is open
// (the sheet is a fixed inset-0 z-50 overlay above the pill's z-40).

"use client";

import { useEffect, useState } from "react";

import { TogglePill } from "./Toolbar";

/** Scroll distance (px) past which the toolbar is considered out of view. */
const SHOW_AFTER_SCROLL = 200;

interface FloatingDetailedToggleProps {
  detailed: boolean;
  onToggleDetailed: () => void;
  /** The editor's scroll container (the `overflow-y-auto` content div). */
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export default function FloatingDetailedToggle({
  detailed,
  onToggleDetailed,
  containerRef,
}: FloatingDetailedToggleProps) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => setScrolled(el.scrollTop > SHOW_AFTER_SCROLL);
    onScroll(); // initial state without waiting for the first scroll event
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [containerRef]);

  return (
    <div
      className={`fixed bottom-5 right-5 z-40 transition-all duration-200 ${
        scrolled ? "opacity-100" : "pointer-events-none translate-y-2 opacity-0"
      }`}
    >
      <div className="rounded-xl shadow-lg ring-1 ring-zinc-900/5">
        <TogglePill
          label="Detailed"
          checked={detailed}
          onChange={onToggleDetailed}
          title="Detailed mode: show translations, analysis and vocabulary. Off = focus on the main content only (the default)"
        />
      </div>
    </div>
  );
}
