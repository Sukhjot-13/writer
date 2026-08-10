// /api/folders/[id] — rename (PATCH) and delete (DELETE) a library folder
// (2026-08-10 M7 round 6). DELETE unfiles the folder's documents — it never
// deletes the documents themselves (enforced inside the storage backends).

import { NextResponse } from "next/server";

import { getStorage } from "@/lib/storage";
import { renameFolderPayloadSchema } from "@/lib/schemas";

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteParams) {
  const { id } = await params;

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

  const folder = await getStorage().renameFolder(id, parsed.data.name.trim());
  if (!folder) return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  return NextResponse.json({ folder });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  await getStorage().deleteFolder(id);
  return new NextResponse(null, { status: 204 });
}
