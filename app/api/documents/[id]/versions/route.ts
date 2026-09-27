// /api/documents/[id]/versions — list (GET) version history, newest first.
import { NextResponse } from "next/server";

import { getStorage } from "@/lib/storage";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const doc = await getStorage().getDocument(id);
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });
  const versions = await getStorage().listDocumentVersions(id);
  return NextResponse.json({ versions });
}
