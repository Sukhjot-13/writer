// components/NewDocumentButton.tsx — "New document" (M6 redesign).
//
// Home page + library empty state: creates a fresh document client-side
// (createDocument with a new id + one empty paragraph block, FR-24) and
// navigates to its editor route /doc/<id>. The first save then persists it.

"use client";

import { useRouter } from "next/navigation";
import { createBlock, createDocument } from "@/lib/types";

export default function NewDocumentButton({ className = "" }: { className?: string }) {
  const router = useRouter();

  function createNew() {
    const doc = createDocument();
    doc.blocks = [createBlock("paragraph")];
    router.push(`/doc/${doc.id}`);
  }

  return (
    <button type="button" onClick={createNew} className={className}>
      + New document
    </button>
  );
}
