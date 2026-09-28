// /api/documents/[id]/versions — list (GET) version history, newest first.
//
// Owner-scoped (2026-09-28): both the parent document and the version rows are
// filtered by the session's ownerId, so another account's edit history is not
// merely hidden — it is unreachable.
import { NextResponse } from "next/server";

import { getStorage } from "@/lib/storage";
import { authorize, isAuthorized } from "@/lib/api-auth";
import { isValidDocumentId } from "@/lib/ids";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const auth = await authorize();
  if (!isAuthorized(auth)) return auth;
  const { id } = await params;
  if (!isValidDocumentId(id)) {
    return NextResponse.json({ error: "Invalid document id" }, { status: 400 });
  }

  const storage = getStorage(); // one handle per request
  const doc = await storage.getDocument(id, auth.ownerId);
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });
  const versions = await storage.listDocumentVersions(id, auth.ownerId);
  return NextResponse.json({ versions });
}
