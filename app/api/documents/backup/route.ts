// GET /api/documents/backup — one-click zip of the caller's library (M5).
// Packages every document into a dated .zip via the dependency-free writer in
// lib/zip.ts. 2026-08-13 (to-do item 7): each doc lives in a folder named
// "sanitized title + short random code" (replaces the old doc.id/ folders —
// any OS can unzip) and always ships document.json + document.pdf (the PDF is
// generated on demand when the saved artifact is missing). html + snapshot
// ship when present — 2026-08-13 rework: they prefer the on-document fields
// (`sourceHtml` / `instructionsSnapshot`, plain data, no Blob) with the
// legacy document.html / instructions.snapshot.md files as fallback.
//
// 2026-09-28 hardening — this endpoint was a denial-of-service lever:
//   • it listed EVERY document in the deployment (no owner filter), so any
//     anonymous caller could exfiltrate the whole library in one request
//   • it renders a full PDF per document and buffers the entire ZIP in memory
//   • `createZip` writes the entry count as a UInt16, so >65535 entries throws
//   • there was no rate limit at all
// It is now owner-scoped, per-IP rate limited (2/10 min), capped at
// MAX_BACKUP_DOCUMENTS documents, and it pre-checks the entry count against the
// ZIP format's 65535 ceiling.

import { NextResponse } from "next/server";

import { getStorage } from "@/lib/storage";
import { authorize, isAuthorized } from "@/lib/api-auth";
import { createZip } from "@/lib/zip";
import { sanitizeBackupFolder, shortCode } from "@/lib/backup";
import { getTokens } from "@/lib/design-tokens";
import { generatePDFBuffer } from "@/lib/pdf";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/** Most documents a single backup may package (each one renders a PDF). */
const MAX_BACKUP_DOCUMENTS = 50;

/** The ZIP central directory stores entry counts as UInt16. */
const ZIP_MAX_ENTRIES = 0xffff;

/** Per-IP: two full-library renders per 10 minutes. */
const BACKUP_LIMIT = 2;
const BACKUP_WINDOW_MS = 10 * 60 * 1000;

export async function GET(request: Request) {
  const auth = await authorize();
  if (!isAuthorized(auth)) return auth;

  const limit = rateLimit(`backup:${clientIp(request)}`, BACKUP_LIMIT, BACKUP_WINDOW_MS);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many backups requested. Try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const storage = getStorage();
  const documents = (await storage.listDocuments(auth.ownerId)).slice(0, MAX_BACKUP_DOCUMENTS);

  const entries: { name: string; data: Buffer }[] = [];
  for (const doc of documents) {
    if (entries.length + 4 > ZIP_MAX_ENTRIES) {
      return NextResponse.json(
        { error: "This library is too large to back up in one archive. Narrow it down first." },
        { status: 413 },
      );
    }
    const dir = `${sanitizeBackupFolder(doc.title || "document")}_${shortCode()}/`;
    entries.push({ name: dir, data: Buffer.alloc(0) });
    entries.push({
      name: `${dir}document.json`,
      data: Buffer.from(JSON.stringify(doc, null, 2), "utf8"),
    });
    // document.pdf always ships — render on demand when the saved artifact is
    // missing (the PDF is the printable rendering of the current document).
    let pdf = await storage.readFile(doc.id, "document.pdf", auth.ownerId);
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
      : await storage.readFile(doc.id, "document.html", auth.ownerId);
    if (htmlContent) entries.push({ name: `${dir}document.html`, data: htmlContent });
    const snapshotContent = doc.instructionsSnapshot
      ? Buffer.from(doc.instructionsSnapshot, "utf8")
      : await storage.readFile(doc.id, "instructions.snapshot.md", auth.ownerId);
    if (snapshotContent) entries.push({ name: `${dir}instructions.snapshot.md`, data: snapshotContent });
  }

  const zip = createZip(entries);
  const date = new Date().toISOString().slice(0, 10);

  return new NextResponse(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="writer-app-backup-${date}.zip"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
