// lib/storage-fs.ts — filesystem storage implementation (FR-44, v1).
//
// Layout per FR-17:
//   data/
//     documents/<id>/document.json        # source blocks (the single editable truth)
//     documents/<id>/document.html        # generated HTML
//     documents/<id>/document.pdf         # generated PDF
//     documents/<id>/instructions.snapshot.md  # instructions version at last conversion
//     instructions/active.md              # editable copy (seeded in M4)
//     instructions/history/<timestamp>.md # versioned history (M4)
//
// The repo copy docs/html_instructions.md is the read-only fallback for
// readInstructions() until the M4 seed step creates data/instructions/active.md.

import { promises as fs } from "node:fs";
import path from "node:path";

import type { Document } from "./types";
import type { StorageBackend } from "./storage";
import { REPO_INSTRUCTIONS_PATH } from "./tokens";

/** Filenames the storage layer is allowed to touch inside a document folder (path-traversal guard). */
const SAFE_FILENAMES = new Set([
  "document.json",
  "document.html",
  "document.pdf",
  "instructions.snapshot.md",
]);

function assertSafeFilename(filename: string): void {
  if (!SAFE_FILENAMES.has(filename)) {
    throw new Error(`Unsafe filename for document folder: ${filename}`);
  }
}

export function createFSStorage(dataDir: string): StorageBackend {
  const root = path.resolve(dataDir);
  const docsDir = path.join(root, "documents");
  const instructionsDir = path.join(root, "instructions");
  const historyDir = path.join(instructionsDir, "history");

  async function ensureDirs(): Promise<void> {
    await fs.mkdir(docsDir, { recursive: true });
    await fs.mkdir(historyDir, { recursive: true });
  }

  function docDir(id: string): string {
    return path.join(docsDir, id);
  }

  async function readJson<T>(file: string): Promise<T | null> {
    try {
      const raw = await fs.readFile(file, "utf8");
      return JSON.parse(raw) as T;
    } catch {
      return null; // missing file or corrupt JSON — treated as "not found"
    }
  }

  /** Active instructions: data/instructions/active.md, falling back to the repo copy. */
  async function readInstructions(): Promise<string> {
    try {
      return await fs.readFile(path.join(instructionsDir, "active.md"), "utf8");
    } catch {
      // Not seeded yet (M4) — fall back to the repo copy of the style instructions.
      return fs.readFile(REPO_INSTRUCTIONS_PATH, "utf8");
    }
  }

  return {
    async listDocuments(ownerId) {
      await ensureDirs();
      const entries = await fs.readdir(docsDir, { withFileTypes: true });
      const docs: Document[] = [];
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const doc = await readJson<Document>(path.join(docDir(entry.name), "document.json"));
        if (!doc) continue; // folder without a valid document.json — skip
        // Owner seam (FR-45): v1 ignores ownerId (null); a future auth middleware passes it.
        if (ownerId && doc.ownerId !== ownerId) continue;
        docs.push(doc);
      }
      return docs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },

    async getDocument(id, _ownerId) {
      await ensureDirs();
      return readJson<Document>(path.join(docDir(id), "document.json"));
    },

    async saveDocument(doc) {
      await ensureDirs();
      await fs.mkdir(docDir(doc.id), { recursive: true });
      const file = path.join(docDir(doc.id), "document.json");
      await fs.writeFile(file, JSON.stringify(doc, null, 2), "utf8");
    },

    async deleteDocument(id) {
      await fs.rm(docDir(id), { recursive: true, force: true });
    },

    async readFile(docId, filename) {
      assertSafeFilename(filename);
      try {
        return await fs.readFile(path.join(docDir(docId), filename));
      } catch {
        return null;
      }
    },

    async writeFile(docId, filename, data) {
      assertSafeFilename(filename);
      await fs.mkdir(docDir(docId), { recursive: true });
      await fs.writeFile(path.join(docDir(docId), filename), data);
    },

    async deleteFile(docId, filename) {
      assertSafeFilename(filename);
      await fs.rm(path.join(docDir(docId), filename), { force: true });
    },

    readInstructions,

    async writeInstructions(content) {
      await ensureDirs();
      await fs.writeFile(path.join(instructionsDir, "active.md"), content, "utf8");
    },

    async snapshotInstructions(version) {
      await ensureDirs();
      const content = await readInstructions();
      const safeVersion = version.replace(/[^\w.-]/g, "_");
      await fs.writeFile(path.join(historyDir, `${safeVersion}.md`), content, "utf8");
    },
  };
}
