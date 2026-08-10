// /api/folders — list (GET) and create (POST) library folders (2026-08-10
// M7 round 6, user: "make a library page… option for making folder too").

import { NextResponse } from "next/server";

import { getStorage } from "@/lib/storage";
import { createFolderPayloadSchema } from "@/lib/schemas";

export async function GET() {
  const folders = await getStorage().listFolders();
  return NextResponse.json({ folders });
}

export async function POST(request: Request) {
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

  const folder = await getStorage().createFolder(parsed.data.name.trim());
  return NextResponse.json({ folder }, { status: 201 });
}
