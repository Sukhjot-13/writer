// /api/documents — list (GET) and create (POST) documents.
// Auth-ready (FR-45): GET accepts an optional ?owner= filter (ignored in v1).

import { NextResponse } from "next/server";

import { getStorage } from "@/lib/storage";
import { saveDocumentPayloadSchema } from "@/lib/schemas";
import { persistDocument } from "@/lib/save";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const owner = searchParams.get("owner");
  const documents = await getStorage().listDocuments(owner);
  return NextResponse.json({ documents });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = saveDocumentPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid document payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { doc, html } = parsed.data;
  await persistDocument(getStorage(), doc, html);
  return NextResponse.json({ doc }, { status: 201 });
}
