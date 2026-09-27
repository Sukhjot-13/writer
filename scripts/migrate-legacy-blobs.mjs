#!/usr/bin/env node
// One-time legacy blob cleanup + migration (suggestion 2026-08-13).
//
// Round 13 stopped writing `document.html` / `document.pdf` /
// `instructions.snapshot.md` blobs, but pre-rework rows still sit in the
// Mongo `files` collection (and Vercel Blob) forever. This script:
//   1. For each document: if `instructions.snapshot.md` exists but
//      `doc.instructionsSnapshot` doesn't, copy it on and delete the blob;
//      same for `document.html` -> `doc.sourceHtml` on external-html docs.
//   2. Sweeps leftover `files` rows whose documents no longer exist.
//
// Usage:
//   MONGODB_URI="..." BLOB_READ_WRITE_TOKEN="..." node scripts/migrate-legacy-blobs.mjs        # dry run
//   MONGODB_URI="..." BLOB_READ_WRITE_TOKEN="..." node scripts/migrate-legacy-blobs.mjs --apply # write
//
// Legacy files remain readable as fallbacks, so running this is optional
// housekeeping — nothing is broken without it.
import { MongoClient } from "mongodb";

const APPLY = process.argv.includes("--apply");
const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI is required.");
  process.exit(1);
}

const client = new MongoClient(uri);
await client.connect();
const db = client.db();
try {
  const docs = await db.collection("documents").find({}).toArray();
  const byId = new Map(docs.map((d) => [String(d._id), d]));
  console.log(`Documents: ${docs.length}`);

  const files = await db.collection("files").find({}).toArray();
  console.log(`Files rows: ${files.length}`);

  const plan = { migrate: [], sweep: [] };
  for (const f of files) {
    const key = String(f._id);
    const slash = key.indexOf("/");
    const docId = slash === -1 ? key : key.slice(0, slash);
    const filename = slash === -1 ? key : key.slice(slash + 1);
    const doc = byId.get(docId);
    if (!doc) {
      plan.sweep.push(f);
      continue;
    }
    if (filename === "instructions.snapshot.md" && !doc.instructionsSnapshot) {
      plan.migrate.push({ file: f, docId, field: "instructionsSnapshot" });
    } else if (filename === "document.html" && doc.source === "external-html" && !doc.sourceHtml) {
      plan.migrate.push({ file: f, docId, field: "sourceHtml" });
    }
  }

  console.log(`Would migrate ${plan.migrate.length} blob(s) onto documents.`);
  for (const m of plan.migrate.slice(0, 10)) {
    console.log(`  migrate: ${m.file._id} -> documents.${m.docId}.${m.field}`);
  }
  console.log(`Would sweep ${plan.sweep.length} orphaned files row(s).`);
  for (const f of plan.sweep.slice(0, 10)) {
    console.log(`  sweep: ${f._id}`);
  }

  if (!APPLY) {
    console.log("Dry run — re-run with --apply to write.");
  } else {
    // Self-contained on mongodb + @vercel/blob (no lib imports — this file
    // runs directly with node, outside the Next/TS build).
    const { del } = await import("@vercel/blob");
    const fetchBlobText = async (url) => {
      if (!url) return null;
      const res = await fetch(url);
      if (!res.ok) return null;
      return res.text();
    };
    let migrated = 0;
    for (const m of plan.migrate) {
      const text = await fetchBlobText(m.file.url);
      if (text === null) {
        console.warn(`  skip (unreadable): ${m.file._id}`);
        continue;
      }
      await db.collection("documents").updateOne(
        { _id: m.docId },
        { $set: { [m.field]: text } }
      );
      await db.collection("files").deleteOne({ _id: m.file._id });
      if (m.file.url && process.env.BLOB_READ_WRITE_TOKEN) {
        try {
          await del(m.file.url);
        } catch {
          console.warn(`  blob del failed (row already gone): ${m.file._id}`);
        }
      }
      migrated += 1;
    }
    let swept = 0;
    for (const f of plan.sweep) {
      await db.collection("files").deleteOne({ _id: f._id });
      if (f.url && process.env.BLOB_READ_WRITE_TOKEN) {
        try {
          await del(f.url);
        } catch {
          // best-effort
        }
      }
      swept += 1;
    }
    console.log(`Migrated ${migrated}, swept ${swept}.`);
  }
} finally {
  await client.close();
}
