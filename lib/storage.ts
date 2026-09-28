// lib/storage.ts — pluggable storage interface (FR-44) + factory.
//
// App code NEVER talks to a storage backend directly — only through this
// interface. MongoDB (lib/storage-mongo.ts) is THE backend — local dev AND
// Vercel both require MONGODB_URI (2026-08-13: the filesystem backend was
// removed from production — serverless filesystems are read-only, so the
// old FS fallback crashed deploys with "ENOENT: mkdir '/var/task/data'").
// lib/storage-fs.ts survives ONLY as a test fixture for the smoke suites;
// production code never imports it.
//
// OWNER SCOPING (2026-09-28, the FR-45 seam is now load-bearing). Every
// document / folder / version / file operation takes the caller's `ownerId` as
// a REQUIRED argument and folds it into the query filter. It is not a hint: the
// value can only come from `requireOwner()` in lib/auth.ts, i.e. from a verified
// session row. Before this, `getDocument({_id: id})` / `deleteOne({_id: id})`
// meant any caller could read, rewrite, restore and delete anybody's data.
//
// Instructions are deliberately NOT owner-scoped: they are the app-wide system
// prompt and design system (one source of truth per the design), so they are
// gated by authentication rather than partitioned per account.

import type { Document, Folder } from "./types";
import { createMongoBlobStorage } from "./storage-mongo";

export interface StorageBackend {
  // Documents
  listDocuments(ownerId: string): Promise<Document[]>;
  getDocument(id: string, ownerId: string): Promise<Document | null>;
  saveDocument(doc: Document): Promise<void>;
  /** Resolves true when a document row was actually removed (so the route can
   *  answer 404 instead of a misleading 204). */
  deleteDocument(id: string, ownerId: string): Promise<boolean>;

  // Per-document version history (2026-09-26). Every saveDocument snapshots
  // the PRE-save content, capped at MAX_DOC_VERSIONS (oldest pruned), so any
  // save can be undone from the editor. Newest first from listDocumentVersions.
  snapshotDocument(id: string, ownerId: string): Promise<void>;
  listDocumentVersions(id: string, ownerId: string): Promise<{ version: string; savedAt: string }[]>;
  readDocumentVersion(id: string, version: string, ownerId: string): Promise<Document | null>;

  // Library folders (2026-08-10 M7 round 6, user: "option for making folder
  // too"). Deleting a folder UNFILES its documents (clears their folderId) —
  // it never deletes them. Folders are sorted by name in listFolders.
  listFolders(ownerId: string): Promise<Folder[]>;
  getFolder(id: string, ownerId: string): Promise<Folder | null>;
  createFolder(name: string, ownerId: string): Promise<Folder>;
  renameFolder(id: string, name: string, ownerId: string): Promise<Folder | null>;
  deleteFolder(id: string, ownerId: string): Promise<boolean>;

  // File attachments (html/pdf/snapshots per document folder)
  readFile(docId: string, filename: string, ownerId: string): Promise<Buffer | null>;
  writeFile(docId: string, filename: string, data: Buffer, ownerId: string): Promise<void>;
  deleteFile(docId: string, filename: string, ownerId: string): Promise<void>;

  // Instructions (FR-21/22/23) — app-wide, authenticated but not per-owner.
  readInstructions(): Promise<string>;
  writeInstructions(content: string): Promise<void>;
  snapshotInstructions(version: string): Promise<void>; // → history/<version>.md
  listInstructionsHistory(): Promise<{ version: string; savedAt: string; content: string }[]>; // newest first
  readInstructionsVersion(version: string): Promise<string | null>; // history/<version>.md
  // When the active instructions were last written, as ms epoch — 0 when no
  // active copy exists yet (so the first read seeds). Feeds the "newer writer
  // wins" auto-sync in lib/instructions.ts (to-do item 10, 2026-08-13).
  getInstructionsEditedAt(): Promise<number>;
}

let storageSingleton: StorageBackend | null = null;

/** Factory: MongoDB, always. Throws a clear error when MONGODB_URI is absent. */
export function getStorage(): StorageBackend {
  if (!storageSingleton) {
    if (!process.env.MONGODB_URI) {
      throw new Error(
        "MONGODB_URI is required — add it to .env.local for local dev and to the " +
          "Vercel project's environment variables for deploy. The filesystem " +
          "backend was removed (2026-08-13): serverless filesystems are read-only " +
          "(ENOENT mkdir /var/task/data).",
      );
    }
    storageSingleton = createMongoBlobStorage();
  }
  return storageSingleton;
}
