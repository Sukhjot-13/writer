// lib/storage-fs.ts — filesystem storage implementation (FR-44, v1).
//
// TEST-ONLY since 2026-08-13: production uses MongoDB exclusively
// (lib/storage-mongo.ts via getStorage()) because serverless filesystems are
// read-only — the FS fallback crashed Vercel deploys with "ENOENT: mkdir
// '/var/task/data'". This file survives as the local fixture backend for the
// smoke suites (smoke-m4 instructions lifecycle, smoke-m8 folder CRUD), which
// exercise the StorageBackend contract against a scratch dir. It is NOT
// imported by any production code — nothing in app/ or lib/ (other than this
// file's own tests) references it.
//
// Layout per FR-17 (folders.json added 2026-08-10 M7 round 6):
//   data/
//     folders.json                     # library folders [{id,name,createdAt,updatedAt}]
//     documents/<id>/document.json     # source blocks (the single editable truth)
//     instructions/active.md           # editable copy (seeded in M4)
//     instructions/history/<timestamp>.md # versioned history (M4)
//
// document.html / document.pdf / instructions.snapshot.md are LEGACY (2026-08-13):
// html/pdf render on demand and the snapshot rides on the document — the app
// never writes those files anymore, but readFile() fallbacks still read them
// for older documents (and writeFile stays on the interface for tests/compat).

import { promises as fs } from "node:fs";
import path from "node:path";

import type { Document, Folder } from "./types";
import type { StorageBackend } from "./storage";
import { seedInstructionsIfMissing, syncActiveFromRepo } from "./instructions";
import { DOCUMENT_ID_PATTERN } from "./ids";

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

  /**
   * 2026-09-28 (path traversal): `path.join(docsDir, id)` with an unvalidated
   * id let `GET /api/documents/..%2F..%2Fetc` reach anywhere on the filesystem.
   * The id is rejected unless it matches the same closed character class the
   * route layer enforces, so no separator can ever appear in it.
   */
  function docDir(id: string): string {
    if (!DOCUMENT_ID_PATTERN.test(id)) {
      throw new Error(`Unsafe document id: ${JSON.stringify(id)}`);
    }
    const dir = path.resolve(docsDir, id);
    const under = path.resolve(docsDir);
    if (dir !== under && !dir.startsWith(under + path.sep)) {
      throw new Error(`Document id escapes the documents directory: ${JSON.stringify(id)}`);
    }
    return dir;
  }

  /** Keep the last MAX_DOC_VERSIONS pre-save snapshots of a document. */
  const MAX_DOC_VERSIONS = 20;
  async function snapshotDocVersion(id: string): Promise<void> {
    const current = await readJson<Document>(path.join(docDir(id), "document.json"));
    if (!current) return; // first save — nothing to snapshot
    const dir = path.join(docDir(id), "versions");
    await fs.mkdir(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    await fs.writeFile(path.join(dir, `${stamp}.json`), JSON.stringify(current, null, 2), "utf8");
    // Prune oldest beyond the cap.
    try {
      const entries = (await fs.readdir(dir))
        .filter((n) => n.endsWith(".json"))
        .sort();
      for (const old of entries.slice(0, Math.max(0, entries.length - MAX_DOC_VERSIONS))) {
        await fs.rm(path.join(dir, old), { force: true });
      }
    } catch {
      // pruning is best-effort
    }
  }

  /** The document row for `id`, but only when it belongs to `ownerId`. */
  async function ownedDoc(id: string, ownerId: string): Promise<Document | null> {
    await ensureDirs();
    const doc = await readJson<Document>(path.join(docDir(id), "document.json"));
    if (!doc || doc.ownerId !== ownerId) return null;
    return doc;
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
        // Owner scope (2026-09-28): the seam is load-bearing now — the FS
        // fixture mirrors the Mongo filter so the suites exercise the contract.
        if (doc.ownerId !== ownerId) continue;
        docs.push(doc);
      }
      return docs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },

    async getDocument(id, ownerId) {
      await ensureDirs();
      const doc = await readJson<Document>(path.join(docDir(id), "document.json"));
      if (!doc || doc.ownerId !== ownerId) return null;
      return doc;
    },

    async saveDocument(doc) {
      await ensureDirs();
      if (!doc.ownerId) {
        throw new Error("saveDocument requires doc.ownerId — it is assigned from the session.");
      }
      // Snapshot the pre-save content first so every save stays undoable.
      await snapshotDocVersion(doc.id);
      await fs.mkdir(docDir(doc.id), { recursive: true });
      const file = path.join(docDir(doc.id), "document.json");
      await fs.writeFile(file, JSON.stringify(doc, null, 2), "utf8");
    },

    async snapshotDocument(id, ownerId) {
      await ensureDirs();
      if (!(await ownedDoc(id, ownerId))) return;
      await snapshotDocVersion(id);
    },

    async listDocumentVersions(id, ownerId) {
      if (!(await ownedDoc(id, ownerId))) return [];
      const dir = path.join(docDir(id), "versions");
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return []; // no history yet
      }
      const history = [];
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
        const stat = await fs.stat(path.join(dir, entry.name));
        history.push({ version: entry.name.slice(0, -5), savedAt: stat.mtime.toISOString() });
      }
      return history.sort((a, b) => b.savedAt.localeCompare(a.savedAt)); // newest first
    },

    async readDocumentVersion(id, version, ownerId) {
      const safe = version.replace(/[^\w.-]/g, "_");
      const snapshot = await readJson<Document>(path.join(docDir(id), "versions", `${safe}.json`));
      if (!snapshot || snapshot.ownerId !== ownerId) return null;
      return snapshot;
    },

    async deleteDocument(id, ownerId) {
      const doc = await readJson<Document>(path.join(docDir(id), "document.json"));
      if (!doc || doc.ownerId !== ownerId) return false;
      await fs.rm(docDir(id), { recursive: true, force: true });
      return true;
    },

    async listFolders(ownerId) {
      const folders = (await readFolders()).filter((f) => f.ownerId === ownerId);
      return folders.sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
    },

    async getFolder(id, ownerId) {
      const folders = await readFolders();
      return folders.find((f) => f.id === id && f.ownerId === ownerId) ?? null;
    },

    async createFolder(name, ownerId) {
      const folders = await readFolders();
      const now = new Date().toISOString();
      const folder: Folder = {
        id: crypto.randomUUID(),
        ownerId,
        name,
        createdAt: now,
        updatedAt: now,
      };
      folders.push(folder);
      await writeFolders(folders);
      return folder;
    },

    async renameFolder(id, name, ownerId) {
      const folders = await readFolders();
      const folder = folders.find((f) => f.id === id && f.ownerId === ownerId);
      if (!folder) return null;
      folder.name = name;
      folder.updatedAt = new Date().toISOString();
      await writeFolders(folders);
      return folder;
    },

    async deleteFolder(id, ownerId) {
      const folders = await readFolders();
      const next = folders.filter((f) => f.id !== id || f.ownerId !== ownerId);
      if (next.length === folders.length) return false;
      await writeFolders(next);
      // Unfile the folder's documents — the documents themselves are kept.
      await unfileDocuments(id);
      return true;
    },

    async readFile(docId, filename, ownerId) {
      assertSafeFilename(filename);
      if (!(await ownedDoc(docId, ownerId))) return null;
      try {
        return await fs.readFile(path.join(docDir(docId), filename));
      } catch {
        return null;
      }
    },

    async writeFile(docId, filename, data, ownerId) {
      assertSafeFilename(filename);
      if (!(await ownedDoc(docId, ownerId))) throw new Error("Unknown document.");
      await fs.mkdir(docDir(docId), { recursive: true });
      await fs.writeFile(path.join(docDir(docId), filename), data);
    },

    async deleteFile(docId, filename, ownerId) {
      assertSafeFilename(filename);
      if (!(await ownedDoc(docId, ownerId))) return;
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
      const history: { version: string; savedAt: string; content: string }[] = [];
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
        const version = entry.name.slice(0, -3);
        const file = path.join(historyDir, entry.name);
        const stat = await fs.stat(file);
        // 2026-09-28: carry the CONTENT so the editor's Preview/Restore works
        // without a second round-trip (Mongo backend does the same).
        history.push({ version, savedAt: stat.mtime.toISOString(), content: await fs.readFile(file, "utf8") });
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
