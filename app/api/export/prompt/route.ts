// GET /api/export/prompt?docId=… — copy-ready AI prompt (FR-39).
//
// Returns { system, user }: system = the active instructions (ready-made
// system prompt for any external AI), user = the document serialized with
// type markers exactly as the in-app prompt (§9 of the requirements, lib/
// prompt.ts) — so an external AI fed these two strings returns HTML that can
// be pasted straight back (FR-42 round-trip).

import { NextResponse } from "next/server";

import { getStorage } from "@/lib/storage";
import { buildAIPrompt, serializeBlocksForAI, serializePlainText } from "@/lib/prompt";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const docId = searchParams.get("docId");

  if (!docId) {
    return NextResponse.json({ error: "Missing ?docId=" }, { status: 400 });
  }

  const storage = getStorage();
  const doc = await storage.getDocument(docId);
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  const instructions = await storage.readInstructions();
  const { system, user } = buildAIPrompt(doc, instructions);

  return NextResponse.json({
    system,
    user,
    plainText: serializePlainText(doc),
    markerText: serializeBlocksForAI(doc),
  });
}
