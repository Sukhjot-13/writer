// POST /api/documents/[id]/regenerate — FR-20 legacy endpoint, kept for API
// compatibility. Its original job — re-render document.html + document.pdf
// files from block data — is obsolete since 2026-08-13: html/pdf render ON
// DEMAND from current blocks, so there are no files to keep in sync. The
// route now re-saves the document (bumps updatedAt); callers wanting a fresh
// render just fetch GET /html or the PDF route.

import { NextResponse } from "next/server";

import { getStorage } from "@/lib/storage";
import { authorize, isAuthorized } from "@/lib/api-auth";
import { persistDocument } from "@/lib/save";
import { isValidDocumentId } from "@/lib/ids";

type RouteParams = { params: Promise<{ id: string }> };

// Owner scope (2026-09-28): the re-save rewrites the document row, so it is
// owner-filtered and the route id is shape-validated.
export async function POST(_request: Request, { params }: RouteParams) {
  const auth = await authorize();
  if (!isAuthorized(auth)) return auth;
  const { id } = await params;
  if (!isValidDocumentId(id)) {
    return NextResponse.json({ error: "Invalid document id" }, { status: 400 });
  }
  const storage = getStorage();
  const doc = await storage.getDocument(id, auth.ownerId);
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  await persistDocument(storage, doc);

  return NextResponse.json({ ok: true });
}
