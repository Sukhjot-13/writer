// GET/PUT /api/instructions — instructions management (FR-22/47).
// GET: active content + version + version history (each entry carries its
// full content so the editor can preview/restore without extra round-trips).
// PUT: { content } — validates the TOKENS block survives (FR-47), snapshots
// the previous version to history, writes the new active file, invalidates
// the design-token cache so design changes apply to new conversions
// immediately.

import { NextResponse } from "next/server";
import { z } from "zod";

import { getStorage } from "@/lib/storage";
import {
  getInstructionsState,
  hashVersion,
  resolveConversionInstructions,
  saveInstructions,
  InstructionsError,
} from "@/lib/instructions";

const payloadSchema = z.object({ content: z.string().min(1) });

export async function GET(request: Request) {
  // 2026-08-10: Copy → "For AI" resolves instructions the SAME way a
  // conversion does (?docId + ?useSnapshot=true, FR-23) so the copied payload
  // and Convert with AI can never disagree on which rules apply. Without
  // params this is the plain instructions-editor state (content + history).
  const { searchParams } = new URL(request.url);
  const docId = searchParams.get("docId") || undefined;
  const useSnapshot = searchParams.get("useSnapshot") === "true";
  const storage = getStorage();
  if (docId || useSnapshot) {
    const content = await resolveConversionInstructions(storage, docId, useSnapshot);
    return NextResponse.json({ content, version: hashVersion(content) });
  }
  const state = await getInstructionsState(storage);
  return NextResponse.json(state);
}

export async function PUT(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Instructions cannot be empty" }, { status: 400 });
  }

  try {
    const storage = getStorage();
    const version = await saveInstructions(storage, parsed.data.content);
    return NextResponse.json({ ok: true, version });
  } catch (e) {
    if (e instanceof InstructionsError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error("[instructions]", e);
    return NextResponse.json({ error: "Could not save instructions." }, { status: 500 });
  }
}
