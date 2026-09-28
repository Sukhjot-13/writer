// /api/folders/[id] — rename (PATCH) and delete (DELETE) a library folder
// (2026-08-10 M7 round 6). DELETE unfiles the folder's documents — it never
// deletes the documents themselves (enforced inside the storage backends).

import { NextResponse } from "next/server";

import { getStorage } from "@/lib/storage";
import { authorize, isAuthorized } from "@/lib/api-auth";
import { renameFolderPayloadSchema } from "@/lib/schemas";
import { isValidDocumentId } from "@/lib/ids";

type RouteParams = { params: Promise<{ id: string }> };

// Owner scope (2026-09-28): `findOneAndUpdate({_id: id})` with no owner filter
// let ANY caller rename any folder in the deployment. It is now filtered and
// answers 404 for a folder that is not the caller's. DELETE also reports a miss.
export async function PATCH(request: Request, { params }: RouteParams) {
  const auth = await authorize();
  if (!isAuthorized(auth)) return auth;
  const { id } = await params;
  if (!isValidDocumentId(id)) {
    return NextResponse.json({ error: "Invalid folder id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = renameFolderPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid folder payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const folder = await getStorage().renameFolder(id, parsed.data.name.trim(), auth.ownerId);
  if (!folder) return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  return NextResponse.json({ folder });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const auth = await authorize();
  if (!isAuthorized(auth)) return auth;
  const { id } = await params;
  if (!isValidDocumentId(id)) {
    return NextResponse.json({ error: "Invalid folder id" }, { status: 400 });
  }
  const deleted = await getStorage().deleteFolder(id, auth.ownerId);
  if (!deleted) return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
