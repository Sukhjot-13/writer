// /api/documents/[id]/versions/[version] — read one snapshot (GET),
// restore it as the live document (POST). Restoring snapshots the current
// content first (via saveDocument), so a restore is itself undoable.
//
// Owner scope + id validation (2026-09-28): the version string used to be
// interpolated straight into the snapshot `_id`, and the document was read with
// no owner filter — so anybody could read another account's snapshots and POST a
// restore over their live document. Both parameters are now shape-validated (400)
// and every lookup is owner-scoped (404).
import { NextResponse } from "next/server";

import { getStorage } from "@/lib/storage";
import { authorize, isAuthorized } from "@/lib/api-auth";
import { isValidDocumentId, isValidVersion } from "@/lib/ids";

type RouteParams = { params: Promise<{ id: string; version: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const auth = await authorize();
  if (!isAuthorized(auth)) return auth;
  const { id, version } = await params;
  if (!isValidDocumentId(id) || !isValidVersion(decodeURIComponent(version))) {
    return NextResponse.json({ error: "Invalid document id or version" }, { status: 400 });
  }

  const doc = await getStorage().readDocumentVersion(id, decodeURIComponent(version), auth.ownerId);
  if (!doc) return NextResponse.json({ error: "Version not found" }, { status: 404 });
  return NextResponse.json({ doc });
}

export async function POST(_request: Request, { params }: RouteParams) {
  const auth = await authorize();
  if (!isAuthorized(auth)) return auth;
  const { id, version } = await params;
  if (!isValidDocumentId(id) || !isValidVersion(decodeURIComponent(version))) {
    return NextResponse.json({ error: "Invalid document id or version" }, { status: 400 });
  }

  const storage = getStorage(); // one handle per request
  const snapshot = await storage.readDocumentVersion(id, decodeURIComponent(version), auth.ownerId);
  if (!snapshot) return NextResponse.json({ error: "Version not found" }, { status: 404 });
  const current = await storage.getDocument(id, auth.ownerId);
  if (!current) return NextResponse.json({ error: "Document not found" }, { status: 404 });
  // Keep identity + folder placement + ownership of the live document; restore
  // content only. ownerId comes from the SESSION, not from the snapshot row.
  const restored = {
    ...snapshot,
    id: current.id,
    ownerId: auth.ownerId,
    folderId: current.folderId,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
  };
  await storage.saveDocument(restored);
  return NextResponse.json({ doc: restored });
}
