// POST /api/instructions/reset — "reset to repo file" (FR-22).
// Snapshots the current active instructions to history, then restores the
// repo copy (docs/html_instructions.md) as the active file. Token cache is
// invalidated so new conversions immediately use the repo design.

import { NextResponse } from "next/server";

import { getStorage } from "@/lib/storage";
import { resetInstructions } from "@/lib/instructions";

export async function POST() {
  try {
    const storage = getStorage();
    const version = await resetInstructions(storage);
    return NextResponse.json({ ok: true, version });
  } catch (e) {
    console.error("[instructions/reset]", e);
    return NextResponse.json({ error: "Could not reset instructions." }, { status: 500 });
  }
}
