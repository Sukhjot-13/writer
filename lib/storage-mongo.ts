// lib/storage-mongo.ts — MongoDB + Vercel Blob storage backend (M5, FR-44).
//
// ResumeBuilder stack: documents + instructions live in MongoDB. The html/pdf/
// snapshot attachment files live in Vercel Blob — 2026-08-13 rework: the app
// no longer WRITES them (html/pdf render on demand, the snapshot + imported
// html ride on the document as plain fields), so Vercel Blob is only touched
// on read (legacy-file fallbacks) and delete (old artifacts). BLOB_READ_WRITE_TOKEN
// is therefore unnecessary for normal operation. Activated by MONGODB_URI via
// the factory in lib/storage.ts — app code never talks to either directly.
//
// Layout (2026-09-28 — every collection is owner-scoped):
//   collection documents     — { _id: docId, ownerId, ...Document }
//   collection docversions   — { _id, ownerId, docId, version, savedAt, doc }
//   collection files         — { _id: "<docId>/<filename>", ownerId, url, contentType }
//   collection instructions  — { _id: "active" | "history:<version>", content, savedAt }  (app-wide)
//   collection folders       — { _id: folderId, ownerId, name, createdAt, updatedAt }
//
// Two invariants this file is responsible for:
//   1. OWNER SCOPE — every document/folder/version/file filter carries the
//      caller's ownerId, so a stolen id resolves to "not found" (404) rather
//      than somebody else's data.
//   2. NO REGEX FROM USER INPUT — the file index is keyed "<docId>/<filename>",
//      so a prefix scan uses a RANGE query ($gte "<id>/" … $lt "<id>0"), never
//      `$regex` built from the id. The old `$regex: "^${id}/"` meant
//      `DELETE /api/documents/%2A` matched every row in the store.
//
// The connection + index bootstrap live in lib/db.ts (shared with lib/auth.ts).

import { put, del } from "@vercel/blob";
import { promises as fs } from "node:fs";

import type { Document, Folder } from "./types";
import type { StorageBackend } from "./storage";
import { getDb } from "./db";
import { REPO_INSTRUCTIONS_PATH } from "./tokens";
import { syncActiveFromRepo } from "./instructions";

const DOCS = "documents";
const FILES = "files";
const INSTR = "instructions";
const FOLDERS = "folders";
const DOCVERSIONS = "docversions";
const ACTIVE_KEY = "active";
// Cap pre-save document snapshots (oldest pruned).
const MAX_DOC_VERSIONS = 20;

interface DocRow {
  _id: string;
  [key: string]: unknown;
}
interface FileRow {
  _id: string;
  ownerId?: string;
  url: string;
  contentType?: string;
}
interface DocVersionRow {
  _id: string;
  ownerId?: string;
  docId: string;
  version: string;
  savedAt: string;
  doc: unknown;
}
interface InstrRow {
  _id: string;
  content: string;
  savedAt: string | Date;
}

function stripId(raw: DocRow): Document {
  const { _id, ...rest } = raw;
  void _id;
  return rest as unknown as Document;
}

/**
 * Exact "everything under this document" prefix range for the file index.
 * `_id` is "<docId>/<filename>", so every sibling key sits in
 * ["<docId>/", "<docId>0") — the next character after "/" is 0x30, so "<docId>0"
 * is a strict upper bound. No regex, so no metacharacter can widen the match.
 */
export function filePrefixRange(docId: string): { $gte: string; $lt: string } {
  return { $gte: `${docId}/`, $lt: `${docId}0` };
}

export function createMongoBlobStorage(): StorageBackend {
  const backend: StorageBackend = {
    async listDocuments(ownerId) {
      const db = await getDb();
      const docs = await db
        .collection<DocRow>(DOCS)
        .find({ ownerId })
        .sort({ updatedAt: -1 })
        .toArray();
      return docs.map(stripId);
    },

    async getDocument(id, ownerId) {
      const db = await getDb();
      const doc = await db.collection<DocRow>(DOCS).findOne({ _id: id, ownerId });
      return doc ? stripId(doc) : null;
    },

    async saveDocument(doc) {
      const db = await getDb();
      const ownerId = String(doc.ownerId ?? "");
      if (!ownerId) {
        throw new Error("saveDocument requires doc.ownerId — it is assigned from the session, never from the client.");
      }
      // Snapshot the pre-save content first so every save stays undoable.
      const current = await db.collection<DocRow>(DOCS).findOne({ _id: doc.id, ownerId });
      if (current) {
        const stamp = new Date().toISOString();
        await db.collection<DocVersionRow>(DOCVERSIONS).insertOne({
          _id: `${doc.id}:${stamp}`,
          ownerId,
          docId: doc.id,
          version: stamp,
          savedAt: stamp,
          doc: stripId(current),
        });
        // Prune oldest beyond the cap.
        const excess = await db
          .collection<DocVersionRow>(DOCVERSIONS)
          .find({ docId: doc.id, ownerId })
          .sort({ savedAt: -1 })
          .skip(MAX_DOC_VERSIONS)
          .project({ _id: 1 })
          .toArray();
        if (excess.length > 0) {
          await db.collection<DocVersionRow>(DOCVERSIONS).deleteMany({ _id: { $in: excess.map((e) => e._id) } });
        }
      }
      // ownerId is written from the (already session-derived) doc, so a client
      // can never re-point a document at another account.
      await db
        .collection<DocRow>(DOCS)
        .replaceOne({ _id: doc.id, ownerId }, { _id: doc.id, ...doc, ownerId }, { upsert: true });
    },

    async snapshotDocument(id, ownerId) {
      const db = await getDb();
      const current = await db.collection<DocRow>(DOCS).findOne({ _id: id, ownerId });
      if (!current) return;
      const stamp = new Date().toISOString();
      await db.collection<DocVersionRow>(DOCVERSIONS).insertOne({
        _id: `${id}:${stamp}`,
        ownerId,
        docId: id,
        version: stamp,
        savedAt: stamp,
        doc: stripId(current),
      });
    },

    async listDocumentVersions(id, ownerId) {
      const db = await getDb();
      const rows = await db
        .collection<DocVersionRow>(DOCVERSIONS)
        .find({ docId: id, ownerId })
        .sort({ savedAt: -1 })
        .toArray();
      return rows.map((r) => ({ version: String(r.version), savedAt: String(r.savedAt) }));
    },

    async readDocumentVersion(id, version, ownerId) {
      const db = await getDb();
      const row = await db
        .collection<DocVersionRow>(DOCVERSIONS)
        .findOne({ _id: `${id}:${version}`, docId: id, ownerId });
      if (!row || typeof row.doc !== "object" || row.doc === null) return null;
      return row.doc as Document;
    },

    async deleteDocument(id, ownerId) {
      const db = await getDb();
      const docs = db.collection<DocRow>(DOCS);
      const result = await docs.deleteOne({ _id: id, ownerId });
      if (result.deletedCount === 0) return false; // never existed, or not yours
      // Remove blob files first (need their URLs), then the rows. The prefix is
      // a RANGE query — see filePrefixRange for why this is not a regex.
      const files = await db
        .collection<FileRow>(FILES)
        .find({ _id: filePrefixRange(id), ownerId })
        .toArray();
      const urls = files.map((f) => f.url);
      if (urls.length) {
        await del(urls).catch(() => {
          // Blob removal is best-effort on document delete — orphaned files
          // would only linger in the store, never in the app.
        });
      }
      await db.collection<FileRow>(FILES).deleteMany({ _id: filePrefixRange(id), ownerId });
      await db.collection<DocVersionRow>(DOCVERSIONS).deleteMany({ docId: id, ownerId });
      return true;
    },

    // ---- library folders (2026-08-10 M7 round 6) — mirror of the FS backend.
    // Deleting a folder UNFILES its documents (unset folderId) — never deletes them.
    async listFolders(ownerId) {
      const db = await getDb();
      const rows = await db.collection<DocRow>(FOLDERS).find({ ownerId }).toArray();
      return rows
        .map((r) => stripId(r) as unknown as Folder)
        .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
    },

    async getFolder(id, ownerId) {
      const db = await getDb();
      const row = await db.collection<DocRow>(FOLDERS).findOne({ _id: id, ownerId });
      return row ? (stripId(row) as unknown as Folder) : null;
    },

    async createFolder(name, ownerId) {
      const db = await getDb();
      const now = new Date().toISOString();
      const folder: Folder = { id: crypto.randomUUID(), name, createdAt: now, updatedAt: now };
      await db.collection<DocRow>(FOLDERS).insertOne({ _id: folder.id, ownerId, ...folder });
      return folder;
    },

    async renameFolder(id, name, ownerId) {
      const db = await getDb();
      const res = await db
        .collection<DocRow>(FOLDERS)
        .findOneAndUpdate({ _id: id, ownerId }, { $set: { name, updatedAt: new Date().toISOString() } });
      if (!res) return null;
      return stripId(res) as unknown as Folder;
    },

    async deleteFolder(id, ownerId) {
      const db = await getDb();
      const result = await db.collection<DocRow>(FOLDERS).deleteOne({ _id: id, ownerId });
      if (result.deletedCount === 0) return false;
      // Unfile the folder's documents — the documents themselves are kept, and
      // only the ones owned by this caller are touched.
      await db.collection<DocRow>(DOCS).updateMany({ folderId: id, ownerId }, { $unset: { folderId: "" } });
      return true;
    },

    async readFile(docId, filename, ownerId) {
      const db = await getDb();
      const key = `${docId}/${filename}`;
      const file = await db.collection<FileRow>(FILES).findOne({ _id: key, ownerId });
      if (!file) return null;
      const res = await fetch(file.url);
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    },

    // 2026-08-13: the app never WRITES attachment files anymore (html/pdf on
    // demand, snapshot/source on the document). Kept on the interface for
    // tests/compat — requires BLOB_READ_WRITE_TOKEN if actually called.
    async writeFile(docId, filename, data, ownerId) {
      const db = await getDb();
      const key = `${docId}/${filename}`;
      const blob = await put(key, data, { access: "public" });
      await db
        .collection<FileRow>(FILES)
        .updateOne(
          { _id: key },
          { $set: { ownerId, url: blob.url, contentType: blob.contentType, updatedAt: new Date().toISOString() } },
          { upsert: true },
        );
    },

    async deleteFile(docId, filename, ownerId) {
      const db = await getDb();
      const key = `${docId}/${filename}`;
      const file = await db.collection<FileRow>(FILES).findOne({ _id: key, ownerId });
      if (file?.url) await del([file.url]).catch(() => undefined);
      await db.collection<FileRow>(FILES).deleteOne({ _id: key, ownerId });
    },

    /**
     * Active instructions: upsert the repo copy on first run (idempotent —
     * mirrors FS seeding, FR-21) and auto-sync whenever the repo copy is the
     * newer writer (to-do item 10 — no manual "Reset to repo file").
     */
    async readInstructions() {
      await syncActiveFromRepo(backend);
      const db = await getDb();
      const active = await db.collection<InstrRow>(INSTR).findOne({ _id: ACTIVE_KEY });
      if (active) return active.content;
      const repo = await fs.readFile(REPO_INSTRUCTIONS_PATH, "utf8");
      await db
        .collection<InstrRow>(INSTR)
        .updateOne({ _id: ACTIVE_KEY }, { $set: { content: repo, savedAt: new Date().toISOString() } }, { upsert: true });
      return repo;
    },

    async writeInstructions(content) {
      const db = await getDb();
      await db
        .collection<InstrRow>(INSTR)
        .updateOne({ _id: ACTIVE_KEY }, { $set: { content, savedAt: new Date().toISOString() } }, { upsert: true });
    },

    async snapshotInstructions(version) {
      const db = await getDb();
      const active = await db.collection<InstrRow>(INSTR).findOne({ _id: ACTIVE_KEY });
      const content = active?.content ?? (await fs.readFile(REPO_INSTRUCTIONS_PATH, "utf8"));
      await db
        .collection<InstrRow>(INSTR)
        .updateOne(
          { _id: `history:${version}` },
          { $set: { content, savedAt: new Date().toISOString() } },
          { upsert: true },
        );
    },

    async listInstructionsHistory() {
      const db = await getDb();
      const entries = await db
        .collection<InstrRow>(INSTR)
        .find({ _id: { $regex: /^history:/ } })
        .sort({ savedAt: -1 })
        .toArray();
      // 2026-09-28: the CONTENT rides along. The editor's Preview/Restore read
      // `entry.content` directly; returning {version, savedAt} only made every
      // row read "0 chars", wiped the textarea on Preview, and sent
      // `{content: ""}` on Restore, which zod rejected with a 400.
      return entries.map((e) => ({
        version: String(e._id).slice("history:".length),
        savedAt: typeof e.savedAt === "string" ? e.savedAt : new Date(e.savedAt).toISOString(),
        content: e.content,
      }));
    },

    async readInstructionsVersion(version) {
      const db = await getDb();
      const entry = await db.collection<InstrRow>(INSTR).findOne({ _id: `history:${version}` });
      return entry?.content ?? null;
    },

    async getInstructionsEditedAt() {
      const db = await getDb();
      const active = await db.collection<InstrRow>(INSTR).findOne({ _id: ACTIVE_KEY });
      if (!active) return 0; // no active row yet — the first read seeds (and syncs)
      return typeof active.savedAt === "string"
        ? Date.parse(active.savedAt)
        : active.savedAt.getTime();
    },
  };
  return backend;
}
