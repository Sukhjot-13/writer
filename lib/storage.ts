// lib/storage.ts — pluggable storage interface (FR-44) + factory.
//
// App code NEVER talks to a storage backend directly — only through this
// interface. v1 ships a local filesystem implementation (lib/storage-fs.ts,
// DATA_DIR default ./data); a MongoDB + Vercel Blob implementation
// (lib/storage-mongo.ts) is added at Vercel deploy time (ResumeBuilder pattern).
//
// Auth-ready (FR-45): every operation accepts an optional ownerId which v1
// ignores (always null). Adding auth later = middleware + setting ownerId —
// never a restructuring.

import type { Document, Folder } from "./types";
import { createFSStorage } from "./storage-fs";
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

/** Factory based on environment: MongoDB+Blob when MONGODB_URI is set, else filesystem. */
export function getStorage(): StorageBackend {
  if (!storageSingleton) {
    storageSingleton = process.env.MONGODB_URI
      ? createMongoBlobStorage()
      : createFSStorage(process.env.DATA_DIR || "./data");
  }
  return storageSingleton;
}

// MongoDB + Blob (ResumeBuilder stack) — implemented in M5 (see lib/storage-mongo.ts).
