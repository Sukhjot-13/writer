// GET /api/config — runtime configuration for the UI (FR-28).
// Returns the configured AI model name (for the status bar) and whether an
// API key is present, so the toolbar can show accurate state without leaking
// the key itself.

import { NextResponse } from "next/server";

import { getAIConfig, hasAIKey } from "@/lib/ai";

export async function GET() {
  const { model } = getAIConfig();
  return NextResponse.json({ model, hasAIKey: hasAIKey() });
}
