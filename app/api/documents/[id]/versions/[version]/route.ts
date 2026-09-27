// /api/documents/[id]/versions/[version] — read one snapshot (GET),
// restore it as the live document (POST). Restoring snapshots the current
// content first (via saveDocument), so a restore is itself undoable.
import { NextResponse } from "next/server";

import { getStorage } from "@/lib/storage";

type RouteParams = { params: Promise<{ id: string; version: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const { id, version } = await params;
  const doc = await getStorage().readDocumentVersion(id, decodeURIComponent(version));
  if (!doc) return NextResponse.json({ error: "Version not found" }, { status: 404 });
  return NextResponse.json({ doc });
}

export async function POST(_request: Request, { params }: RouteParams) {
  const { id, version } = await params;
  const storage = getStorage();
  const snapshot = await storage.readDocumentVersion(id, decodeURIComponent(version));
  if (!snapshot) return NextResponse.json({ error: "Version not found" }, { status: 404 });
  const current = await storage.getDocument(id);
  if (!current) return NextResponse.json({ error: "Document not found" }, { status: 404 });
  // Keep identity + folder placement of the live document; restore content.
  const restored = {
    ...snapshot,
    id: current.id,
    folderId: current.folderId,
    updatedAt: new Date().toISOString(),
  };
  await storage.saveDocument(restored);
  return NextResponse.json({ doc: restored });
}
