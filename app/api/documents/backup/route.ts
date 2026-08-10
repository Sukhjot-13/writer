// GET /api/documents/backup — one-click zip of the whole library (M5).
// Packages every document folder (document.json + html + pdf +
// instructions.snapshot.md when present) into a dated .zip via the
// dependency-free writer in lib/zip.ts.

import { NextResponse } from "next/server";

import { getStorage } from "@/lib/storage";
import { createZip } from "@/lib/zip";

export async function GET() {
  const storage = getStorage();
  const docs = await storage.listDocuments();

  const entries: { name: string; data: Buffer }[] = [];
  for (const doc of docs) {
    const dir = `${doc.id}/`;
    entries.push({ name: dir, data: Buffer.alloc(0) });
    entries.push({
      name: `${dir}document.json`,
      data: Buffer.from(JSON.stringify(doc, null, 2), "utf8"),
    });
    for (const filename of ["document.html", "document.pdf", "instructions.snapshot.md"] as const) {
      const file = await storage.readFile(doc.id, filename);
      if (file) entries.push({ name: `${dir}${filename}`, data: file });
    }
  }

  const zip = createZip(entries);
  const date = new Date().toISOString().slice(0, 10);

  return new NextResponse(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="writer-app-backup-${date}.zip"`,
    },
  });
}
