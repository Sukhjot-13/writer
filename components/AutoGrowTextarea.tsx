// components/AutoGrowTextarea.tsx — textarea that grows with its content
// (2026-08-10). Wrapper around lib/auto-grow.ts adding `resize-none
// overflow-hidden` (without overflow-hidden the scrollbar makes scrollHeight
// jitter) and a no-deps effect that re-measures on EVERY render — typing,
// mount, AND programmatic value changes (AI convert, suggestion Apply) that
// fire no onInput event.

"use client";

import { useEffect, useRef } from "react";
import { autoGrow } from "@/lib/auto-grow";

export default function AutoGrowTextarea({
  className,
  onInput,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    autoGrow(ref.current);
  });

  return (
    <textarea
      ref={ref}
      {...props}
      onInput={(e) => {
        autoGrow(e.currentTarget);
        onInput?.(e);
      }}
      className={`resize-none overflow-hidden ${className ?? ""}`}
    />
  );
}
