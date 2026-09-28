// /api/folders — list (GET) and create (POST) library folders (2026-08-10
// M7 round 6, user: "make a library page… option for making folder too").

import { NextResponse } from "next/server";

import { getStorage } from "@/lib/storage";
import { authorize, isAuthorized } from "@/lib/api-auth";
import { createFolderPayloadSchema } from "@/lib/schemas";

// Owner scope (2026-09-28): folders are per-account, so the listing and the
// create both carry the session's ownerId. Folders used to be a single global
// list that anybody could rename or delete.
export async function GET() {
  const auth = await authorize();
  if (!isAuthorized(auth)) return auth;
  const folders = await getStorage().listFolders(auth.ownerId);
  return NextResponse.json({ folders });
}

export async function POST(request: Request) {
  const auth = await authorize();
  if (!isAuthorized(auth)) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createFolderPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid folder payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const folder = await getStorage().createFolder(parsed.data.name.trim(), auth.ownerId);
  return NextResponse.json({ folder }, { status: 201 });
}
