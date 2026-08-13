// lib/storage-fs.ts — filesystem storage implementation (FR-44, v1).
//
// Layout per FR-17 (folders.json added 2026-08-10 M7 round 6):
//   data/
//     folders.json                     # library folders [{id,name,createdAt,updatedAt}]
//     documents/<id>/document.json     # source blocks (the single editable truth)
//     documents/<id>/document.html     # generated HTML
//     documents/<id>/document.pdf      # generated PDF
//     documents/<id>/instructions.snapshot.md  # instructions version at last conversion
//     instructions/active.md           # editable copy (seeded in M4)
//     instructions/history/<timestamp>.md # versioned history (M4)
//
// The repo copy docs/html_instructions.md is the read-only fallback for
// readInstructions() until the M4 seed step creates data/instructions/active.md.

import { promises as fs } from "node:fs";
import path from "node:path";

import type { Document, Folder } from "./types";
import type { StorageBackend } from "./storage";
import { seedInstructionsIfMissing, syncActiveFromRepo } from "./instructions";

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
  const foldersFile = path.join(root, "folders.json");

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

  /**
   * Active instructions: data/instructions/active.md — seeded from the repo
   * copy on first run (FR-21), then auto-synced whenever the repo copy is the
   * newer writer (to-do item 10 — the repo file is the source; no manual
   * "Reset to repo file" anymore).
   */
  async function readInstructions(): Promise<string> {
    await seedInstructionsIfMissing(path.join(instructionsDir, "active.md"));
    await syncActiveFromRepo(backend);
    return fs.readFile(path.join(instructionsDir, "active.md"), "utf8");
  }

  // ---- library folders (2026-08-10 M7 round 6) ----
  // Folders live in data/folders.json (a single list; the docs keep a
  // folderId reference). Deleting a folder clears folderId on its documents —
  // documents are NEVER deleted by folder operations.

  async function readFolders(): Promise<Folder[]> {
    return (await readJson<Folder[]>(foldersFile)) ?? [];
  }

  async function writeFolders(folders: Folder[]): Promise<void> {
    await ensureDirs();
    await fs.writeFile(foldersFile, JSON.stringify(folders, null, 2), "utf8");
  }

  /** Clear folderId on every document that references the folder. */
  async function unfileDocuments(folderId: string): Promise<void> {
    const entries = await fs.readdir(docsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const file = path.join(docDir(entry.name), "document.json");
      const doc = await readJson<Document>(file);
      if (!doc || doc.folderId !== folderId) continue;
      delete doc.folderId;
      await fs.writeFile(file, JSON.stringify(doc, null, 2), "utf8");
    }
  }

  const backend: StorageBackend = {
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

    async listFolders() {
      const folders = await readFolders();
      return folders.sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
    },

    async createFolder(name) {
      const folders = await readFolders();
      const now = new Date().toISOString();
      const folder: Folder = { id: crypto.randomUUID(), name, createdAt: now, updatedAt: now };
      folders.push(folder);
      await writeFolders(folders);
      return folder;
    },

    async renameFolder(id, name) {
      const folders = await readFolders();
      const folder = folders.find((f) => f.id === id);
      if (!folder) return null;
      folder.name = name;
      folder.updatedAt = new Date().toISOString();
      await writeFolders(folders);
      return folder;
    },

    async deleteFolder(id) {
      const folders = await readFolders();
      const next = folders.filter((f) => f.id !== id);
      if (next.length !== folders.length) {
        await writeFolders(next);
        // Unfile the folder's documents — the documents themselves are kept.
        await unfileDocuments(id);
      }
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

    async listInstructionsHistory() {
      await ensureDirs();
      let entries;
      try {
        entries = await fs.readdir(historyDir, { withFileTypes: true });
      } catch {
        return []; // no history yet
      }
      const history = [];
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
        const version = entry.name.slice(0, -3);
        const stat = await fs.stat(path.join(historyDir, entry.name));
        history.push({ version, savedAt: stat.mtime.toISOString() });
      }
      return history.sort((a, b) => b.savedAt.localeCompare(a.savedAt)); // newest first
    },

    async readInstructionsVersion(version) {
      const safeVersion = version.replace(/[^\w.-]/g, "_");
      try {
        return await fs.readFile(path.join(historyDir, `${safeVersion}.md`), "utf8");
      } catch {
        return null;
      }
    },

    async getInstructionsEditedAt() {
      try {
        return (await fs.stat(path.join(instructionsDir, "active.md"))).mtimeMs;
      } catch {
        return 0; // no active copy yet — the first read seeds (and syncs)
      }
    },
  };
  return backend;
}
