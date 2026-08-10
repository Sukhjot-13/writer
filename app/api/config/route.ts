// GET /api/config — runtime configuration for the UI (FR-28).
// Returns the configured AI model name, whether an API key is present, and
// the active instructions version — so the toolbar/status bar can show
// accurate state without leaking the key itself.

import { NextResponse } from "next/server";

import { getAIConfig, hasAIKey } from "@/lib/ai";
import { getStorage } from "@/lib/storage";
import { hashVersion } from "@/lib/instructions";

export async function GET() {
  const { model } = getAIConfig();
  const storage = getStorage();
  const instructions = await storage.readInstructions(); // seeds active.md on first run (FR-21)
  return NextResponse.json({
    model,
    hasAIKey: hasAIKey(),
    instructionsVersion: hashVersion(instructions),
  });
}
