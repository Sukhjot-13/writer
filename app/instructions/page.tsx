// app/instructions/page.tsx — instructions management page (FR-22/47).
// Server shell (dynamic — reads the active file at request time), renders the
// client InstructionsEditor (textarea + save + discard-my-edits reset + history).

import type { Metadata } from "next";

import InstructionsEditor from "@/components/InstructionsEditor";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Instructions — Writer App",
};

export default function InstructionsPage() {
  return <InstructionsEditor />;
}
