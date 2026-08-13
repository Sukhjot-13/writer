// GET /api/documents/backup — one-click zip of the whole library (M5).
// Packages every document into a dated .zip via the dependency-free writer in
// lib/zip.ts. 2026-08-13 (to-do item 7): each doc lives in a folder named
// "sanitized title + short random code" (replaces the old doc.id/ folders —
// any OS can unzip) and always ships document.json + document.pdf (the PDF is
// generated on demand when the saved artifact is missing). html + snapshot
// ship when present — 2026-08-13 rework: they prefer the on-document fields
// (`sourceHtml` / `instructionsSnapshot`, plain data, no Blob) with the
// legacy document.html / instructions.snapshot.md files as fallback.

import { NextResponse } from "next/server";

import { getStorage } from "@/lib/storage";
import { createZip } from "@/lib/zip";
import { sanitizeBackupFolder, shortCode } from "@/lib/backup";
import { getTokens } from "@/lib/design-tokens";
import { generatePDFBuffer } from "@/lib/pdf";

export async function GET() {
  const storage = getStorage();
  const docs = await storage.listDocuments();

  const entries: { name: string; data: Buffer }[] = [];
  for (const doc of docs) {
    const dir = `${sanitizeBackupFolder(doc.title || "document")}_${shortCode()}/`;
    entries.push({ name: dir, data: Buffer.alloc(0) });
    entries.push({
      name: `${dir}document.json`,
      data: Buffer.from(JSON.stringify(doc, null, 2), "utf8"),
    });
    // document.pdf always ships — render on demand when the saved artifact is
    // missing (the PDF is the printable rendering of the current document).
    let pdf = await storage.readFile(doc.id, "document.pdf");
    if (!pdf) {
      try {
        const tokens = await getTokens();
        pdf = await generatePDFBuffer(doc, tokens, {});
      } catch {
        pdf = null; // generation failed — ship the zip without this doc's PDF
      }
    }
    if (pdf) entries.push({ name: `${dir}document.pdf`, data: pdf });
    const htmlContent = doc.sourceHtml
      ? Buffer.from(doc.sourceHtml, "utf8")
      : await storage.readFile(doc.id, "document.html");
    if (htmlContent) entries.push({ name: `${dir}document.html`, data: htmlContent });
    const snapshotContent = doc.instructionsSnapshot
      ? Buffer.from(doc.instructionsSnapshot, "utf8")
      : await storage.readFile(doc.id, "instructions.snapshot.md");
    if (snapshotContent) entries.push({ name: `${dir}instructions.snapshot.md`, data: snapshotContent });
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
