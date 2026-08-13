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
// Auth-ready (FR-45): every operation accepts an optional ownerId which v1
// ignores (always null). Adding auth later = middleware + setting ownerId —
// never a restructuring.

import type { Document, Folder } from "./types";
import { createMongoBlobStorage } from "./storage-mongo";

export interface StorageBackend {
  // Documents
  listDocuments(ownerId?: string | null): Promise<Document[]>;
  getDocument(id: string, ownerId?: string | null): Promise<Document | null>;
  saveDocument(doc: Document): Promise<void>;
  deleteDocument(id: string): Promise<void>;

  // Library folders (2026-08-10 M7 round 6, user: "option for making folder
  // too"). Deleting a folder UNFILES its documents (clears their folderId) —
  // it never deletes them. Folders are sorted by name in listFolders.
  listFolders(): Promise<Folder[]>;
  createFolder(name: string): Promise<Folder>;
  renameFolder(id: string, name: string): Promise<Folder | null>;
  deleteFolder(id: string): Promise<void>;

  // File attachments (html/pdf/snapshots per document folder)
  readFile(docId: string, filename: string): Promise<Buffer | null>;
  writeFile(docId: string, filename: string, data: Buffer): Promise<void>;
  deleteFile(docId: string, filename: string): Promise<void>;

  // Instructions (FR-21/22/23)
  readInstructions(): Promise<string>;
  writeInstructions(content: string): Promise<void>;
  snapshotInstructions(version: string): Promise<void>; // → history/<version>.md
  listInstructionsHistory(): Promise<{ version: string; savedAt: string }[]>; // newest first
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

// MongoDB (ResumeBuilder stack) — implemented in M5 (see lib/storage-mongo.ts).
