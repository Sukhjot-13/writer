// components/NewDocumentButton.tsx — "New document" (M6 redesign).
//
// Home page + library empty state: creates a fresh document client-side
// (createDocument with a new id + one empty paragraph block, FR-24) and
// navigates to its editor route /doc/<id>. The first save then persists it.
//
// 2026-08-10 M7 round 6b (user: "when I click on [a folder] and make a
// document in there it doesn't automatically move it there"): an optional
// `folderId` files the new document into a library folder from the very
// first save — the folder picker in the editor is a move, not a create.

"use client";

import { useRouter } from "next/navigation";
import { createBlock, createDocument } from "@/lib/types";

export default function NewDocumentButton({
  className = "",
  folderId,
  label = "+ New document",
}: {
  className?: string;
  /** Library folder to file the new document into (first save persists it). */
  folderId?: string;
  label?: string;
}) {
  const router = useRouter();

  function createNew() {
    const doc = createDocument();
    doc.blocks = [createBlock("paragraph")];
    if (folderId) doc.folderId = folderId;
    router.push(`/doc/${doc.id}`);
  }

  return (
    <button type="button" onClick={createNew} className={className}>
      {label}
    </button>
  );
}
