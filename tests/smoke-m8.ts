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
// 2026-09-28: every storage call is owner-scoped now, so the suite runs as two
// users — that is also how it proves the scope is real and not decorative.
const OWNER = "user-m8";
const OTHER = "user-m8-other";

function owned<T extends { ownerId?: string | null }>(doc: T): T {
  doc.ownerId = OWNER;
  return doc;
}

async function run() {
  await fs.rm(SCRATCH, { recursive: true, force: true });
  const storage = createFSStorage(DATA);

  // ---------- empty start ----------
  check("folders: starts empty", (await storage.listFolders(OWNER)).length === 0);

  // ---------- create + name sorting ----------
  const b = await storage.createFolder("Baguette", OWNER);
  const a = await storage.createFolder("Accents", OWNER);
  await storage.createFolder("zoo", OWNER);
  check("folders: create returns id + timestamps",
    typeof b.id === "string" && b.id.length > 0 && b.name === "Baguette" &&
    !!b.createdAt && !!b.updatedAt && b.createdAt === b.updatedAt);
  check("folders: listFolders sorted by name (case-insensitive)",
    (await storage.listFolders(OWNER)).map((f) => f.name).join(",") === "Accents,Baguette,zoo");
  check("folders: persisted to data/folders.json",
    await fs.access(path.join(DATA, "folders.json")).then(() => true, () => false));

  // ---------- rename ----------
  const renamed = await storage.renameFolder(b.id, "Boulangerie", OWNER);
  check("folders: rename updates name + updatedAt",
    renamed?.name === "Boulangerie" && renamed.updatedAt !== renamed.createdAt);
  check("folders: rename of missing id returns null",
    (await storage.renameFolder("no-such-id", "X", OWNER)) === null);
  check("folders: rename by a different owner returns null (IDOR)",
    (await storage.renameFolder(b.id, "Hijacked", OTHER)) === null);

  // ---------- document ↔ folder wiring ----------
  const doc = owned(createDocument("Ma journée", "doc-in-folder"));
  doc.blocks = [setBlockContent(createBlock("paragraph"), { text: "Bonjour." })];
  doc.folderId = a.id;
  await storage.saveDocument(doc);
  const readBack = await storage.getDocument("doc-in-folder", OWNER);
  check("documents: folderId round-trips through save/get", readBack?.folderId === a.id);
  check("documents: listDocuments carries folderId", (await storage.listDocuments(OWNER))[0]?.folderId === a.id);
  // 2026-09-28: the owner filter is the security boundary, so it is asserted.
  check("documents: another owner cannot read the document (404 shape)",
    (await storage.getDocument("doc-in-folder", OTHER)) === null);
  check("documents: another owner's listDocuments is empty",
    (await storage.listDocuments(OTHER)).length === 0);

  // An unfiled doc must stay visible too (filtering happens client-side).
  const loose = owned(createDocument("Sans dossier", "doc-loose"));
  await storage.saveDocument(loose);
  check("documents: unfiled doc has no folderId",
    (await storage.getDocument("doc-loose", OWNER))?.folderId === undefined);

  // ---------- delete folder → UNFILE, never delete ----------
  const beforeDelete = await storage.listDocuments(OWNER);
  check("folders: delete reports whether it removed a row", (await storage.deleteFolder(a.id, OWNER)) === true);
  const afterDelete = await storage.listDocuments(OWNER);
  check("folders: delete removes the folder from the list",
    !(await storage.listFolders(OWNER)).some((f) => f.id === a.id));
  check("folders: deleting a folder keeps the documents (count unchanged)",
    afterDelete.length === beforeDelete.length);
  const unfiled = await storage.getDocument("doc-in-folder", OWNER);
  check("folders: deleting a folder clears folderId on its documents",
    unfiled?.folderId === undefined && unfiled?.title === "Ma journée");
  check("folders: document CONTENT untouched by folder delete",
    unfiled?.blocks[0]?.type === "paragraph" &&
    (unfiled.blocks[0].content as { text: string }).text === "Bonjour.");
  check("documents: unrelated documents keep their folderId", (await storage.getDocument("doc-loose", OWNER))?.folderId === undefined);

  // Deleting an unknown folder is a no-op, not an error.
  let threw = false;
  try { await storage.deleteFolder("no-such-folder", OWNER); } catch { threw = true; }
  check("folders: deleting a missing folder is a no-op", !threw);
  check("folders: deleting a missing folder reports false (404 shape)",
    (await storage.deleteFolder("no-such-folder", OWNER)) === false);

  // ---------- schemas ----------
  check("schemas: documentSchema accepts folderId",
    documentSchema.safeParse({ ...doc, folderId: "f1" }).success);
  check("schemas: documentSchema rejects an over-long title (300 max)",
    !documentSchema.safeParse({ ...doc, title: "x".repeat(301) }).success);
  check("schemas: documentSchema accepts older docs without folderId",
    documentSchema.safeParse({ ...doc, folderId: undefined }).success);
  check("schemas: createFolderPayloadSchema accepts a name", createFolderPayloadSchema.safeParse({ name: "Verbes" }).success);
  check("schemas: createFolderPayloadSchema rejects empty name", !createFolderPayloadSchema.safeParse({ name: "   " }).success);
  check("schemas: renameFolderPayloadSchema accepts a name", renameFolderPayloadSchema.safeParse({ name: "Nouveau" }).success);
  check("schemas: moveDocumentPayloadSchema accepts null (unfile)", moveDocumentPayloadSchema.safeParse({ folderId: null }).success);
  check("schemas: moveDocumentPayloadSchema accepts a folder id", moveDocumentPayloadSchema.safeParse({ folderId: "f1" }).success);
  check("schemas: moveDocumentPayloadSchema rejects missing folderId", !moveDocumentPayloadSchema.safeParse({}).success);

  // ---------- document version history (2026-09-26) ----------
  const vdoc = owned(createDocument("Versioned", "doc-versions"));
  await storage.saveDocument(vdoc);
  check("versions: first save snapshots nothing",
    (await storage.listDocumentVersions("doc-versions", OWNER)).length === 0);
  const v2 = { ...vdoc, title: "Versioned v2" };
  await storage.saveDocument(v2);
  const history = await storage.listDocumentVersions("doc-versions", OWNER);
  check("versions: second save snapshots the first", history.length === 1);
  const restored = await storage.readDocumentVersion("doc-versions", history[0].version, OWNER);
  check("versions: snapshot reads back pre-save content", restored?.title === "Versioned");
  check("versions: unknown version reads null",
    (await storage.readDocumentVersion("doc-versions", "nope", OWNER)) === null);
  check("versions: another owner cannot read the version list",
    (await storage.listDocumentVersions("doc-versions", OTHER)).length === 0);
  check("versions: another owner cannot read a version body",
    (await storage.readDocumentVersion("doc-versions", history[0].version, OTHER)) === null);
  check("versions: deleteDocument reports a miss for the wrong owner",
    (await storage.deleteDocument("doc-versions", OTHER)) === false);
  check("versions: deleteDocument reports a hit for the owner",
    (await storage.deleteDocument("doc-versions", OWNER)) === true);
  check("versions: deleteDocument reports a miss the second time",
    (await storage.deleteDocument("doc-versions", OWNER)) === false);

  console.log(`\nM8 smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error("M8 smoke crashed:", e);
  process.exit(1);
});
