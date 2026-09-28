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
import { authorize, isAuthorized } from "@/lib/api-auth";
import { isValidDocumentId } from "@/lib/ids";
import {
  getInstructionsState,
  hashVersion,
  resolveConversionInstructions,
  saveInstructions,
  InstructionsError,
} from "@/lib/instructions";

// 200 KB ceiling (2026-09-28): the content is written verbatim as the global
// system prompt AND its TOKENS block is interpolated into the CSS served as
// text/html, so an unbounded body was both a storage and a rendering hazard.
const MAX_INSTRUCTIONS_CHARS = 200_000;
const payloadSchema = z.object({ content: z.string().min(1).max(MAX_INSTRUCTIONS_CHARS) });

// Session required (2026-09-28). Instructions stay APP-WIDE (one design system,
// not per account) but they are no longer world-readable/writable: the tokens
// they carry reach the HTML renderer, so an anonymous PUT was a CSS-injection
// and prompt-poisoning vector.
export async function GET(request: Request) {
  const auth = await authorize();
  if (!isAuthorized(auth)) return auth;
  // 2026-08-10: Copy → "For AI" resolves instructions the SAME way a
  // conversion does (?docId + ?useSnapshot=true, FR-23) so the copied payload
  // and Rethink with AI can never disagree on which rules apply. Without
  // params this is the plain instructions-editor state (content + history).
  const { searchParams } = new URL(request.url);
  const docIdParam = searchParams.get("docId") || undefined;
  // A docId that is not a valid id can never own a document — reject it rather
  // than passing junk into a query filter.
  if (docIdParam && !isValidDocumentId(docIdParam)) {
    return NextResponse.json({ error: "Invalid document id" }, { status: 400 });
  }
  const docId = docIdParam;
  const useSnapshot = searchParams.get("useSnapshot") === "true";
  const storage = getStorage();
  if (docId || useSnapshot) {
    const content = await resolveConversionInstructions(storage, docId, useSnapshot, auth.ownerId);
    return NextResponse.json({ content, version: hashVersion(content) });
  }
  const state = await getInstructionsState(storage);
  return NextResponse.json(state);
}

export async function PUT(request: Request) {
  const auth = await authorize();
  if (!isAuthorized(auth)) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Instructions cannot be empty and must be at most 200000 characters." },
      { status: 400 },
    );
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
