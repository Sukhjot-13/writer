// M8 smoke test (2026-08-10 M7 round 6): library folders.
//
// Covers the pure seams of the new folder feature against the REAL filesystem
// storage (like smoke-m4): folder CRUD on createFSStorage, the sort order,
// and the delete-folder contract — deleting a folder UNFILES its documents
// (clears folderId) but NEVER deletes the documents or their content. Also
// covers the new schemas (folderId on documentSchema, create/rename/move
// payloads).

import { promises as fs } from "node:fs";
import path from "node:path";

import { createFSStorage } from "../lib/storage-fs";
import { createDocument, createBlock, setBlockContent } from "../lib/types";
import {
  documentSchema,
  createFolderPayloadSchema,
  renameFolderPayloadSchema,
  moveDocumentPayloadSchema,
} from "../lib/schemas";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => {
  if (cond) { pass++; console.log("PASS —", name); }
  else { fail++; console.log("FAIL —", name); }
};

const SCRATCH = path.resolve(__dirname, "..", ".tmp-m8");
const DATA = path.join(SCRATCH, "data");

async function run() {
  await fs.rm(SCRATCH, { recursive: true, force: true });
  const storage = createFSStorage(DATA);

  // ---------- empty start ----------
  check("folders: starts empty", (await storage.listFolders()).length === 0);

  // ---------- create + name sorting ----------
  const b = await storage.createFolder("Baguette");
  const a = await storage.createFolder("Accents");
  const z = await storage.createFolder("zoo");
  check("folders: create returns id + timestamps",
    typeof b.id === "string" && b.id.length > 0 && b.name === "Baguette" &&
    !!b.createdAt && !!b.updatedAt && b.createdAt === b.updatedAt);
  check("folders: listFolders sorted by name (case-insensitive)",
    (await storage.listFolders()).map((f) => f.name).join(",") === "Accents,Baguette,zoo");
  check("folders: persisted to data/folders.json",
    await fs.access(path.join(DATA, "folders.json")).then(() => true, () => false));

  // ---------- rename ----------
  const renamed = await storage.renameFolder(b.id, "Boulangerie");
  check("folders: rename updates name + updatedAt",
    renamed?.name === "Boulangerie" && renamed.updatedAt !== renamed.createdAt);
  check("folders: rename of missing id returns null",
    (await storage.renameFolder("no-such-id", "X")) === null);

  // ---------- document ↔ folder wiring ----------
  const doc = createDocument("Ma journée", "doc-in-folder");
  doc.blocks = [setBlockContent(createBlock("paragraph"), { text: "Bonjour." })];
  doc.folderId = a.id;
  await storage.saveDocument(doc);
  const readBack = await storage.getDocument("doc-in-folder");
  check("documents: folderId round-trips through save/get", readBack?.folderId === a.id);
  check("documents: listDocuments carries folderId", (await storage.listDocuments(null))[0]?.folderId === a.id);

  // An unfiled doc must stay visible too (filtering happens client-side).
  const loose = createDocument("Sans dossier", "doc-loose");
  await storage.saveDocument(loose);
  check("documents: unfiled doc has no folderId",
    (await storage.getDocument("doc-loose"))?.folderId === undefined);

  // ---------- delete folder → UNFILE, never delete ----------
  const beforeDelete = await storage.listDocuments(null);
  await storage.deleteFolder(a.id);
  const afterDelete = await storage.listDocuments(null);
  check("folders: delete removes the folder from the list",
    !(await storage.listFolders()).some((f) => f.id === a.id));
  check("folders: deleting a folder keeps the documents (count unchanged)",
    afterDelete.length === beforeDelete.length);
  const unfiled = await storage.getDocument("doc-in-folder");
  check("folders: deleting a folder clears folderId on its documents",
    unfiled?.folderId === undefined && unfiled?.title === "Ma journée");
  check("folders: document CONTENT untouched by folder delete",
    unfiled?.blocks[0]?.type === "paragraph" &&
    (unfiled.blocks[0].content as { text: string }).text === "Bonjour.");
  check("documents: unrelated documents keep their folderId", (await storage.getDocument("doc-loose"))?.folderId === undefined);

  // Deleting an unknown folder is a no-op, not an error.
  let threw = false;
  try { await storage.deleteFolder("no-such-folder"); } catch { threw = true; }
  check("folders: deleting a missing folder is a no-op", !threw);

  // ---------- schemas ----------
  check("schemas: documentSchema accepts folderId",
    documentSchema.safeParse({ ...doc, folderId: "f1" }).success);
  check("schemas: documentSchema accepts older docs without folderId",
    documentSchema.safeParse({ ...doc, folderId: undefined }).success);
  check("schemas: createFolderPayloadSchema accepts a name", createFolderPayloadSchema.safeParse({ name: "Verbes" }).success);
  check("schemas: createFolderPayloadSchema rejects empty name", !createFolderPayloadSchema.safeParse({ name: "   " }).success);
  check("schemas: renameFolderPayloadSchema accepts a name", renameFolderPayloadSchema.safeParse({ name: "Nouveau" }).success);
  check("schemas: moveDocumentPayloadSchema accepts null (unfile)", moveDocumentPayloadSchema.safeParse({ folderId: null }).success);
  check("schemas: moveDocumentPayloadSchema accepts a folder id", moveDocumentPayloadSchema.safeParse({ folderId: "f1" }).success);
  check("schemas: moveDocumentPayloadSchema rejects missing folderId", !moveDocumentPayloadSchema.safeParse({}).success);

  console.log(`\nM8 smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error("M8 smoke crashed:", e);
  process.exit(1);
});
