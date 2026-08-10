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

import type { Document } from "./types";
import { createFSStorage } from "./storage-fs";
import { createMongoBlobStorage } from "./storage-mongo";

export interface StorageBackend {
  // Documents
  listDocuments(ownerId?: string | null): Promise<Document[]>;
  getDocument(id: string, ownerId?: string | null): Promise<Document | null>;
  saveDocument(doc: Document): Promise<void>;
  deleteDocument(id: string): Promise<void>;

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
