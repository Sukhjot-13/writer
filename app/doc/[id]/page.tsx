// app/doc/[id]/page.tsx — editor route (M6 redesign).
// Async server page: in Next 16 params is a Promise — await it, then hand the
// id to the client Editor. Unknown/new ids make the editor start fresh with
// the same id, so "New document" and pasted links both work.

import type { Metadata } from "next";

import Editor from "@/components/Editor";

export const metadata: Metadata = {
  title: "Editor — Writer App",
};

// The editor is fully client-side — never prerender a specific document.
export const dynamic = "force-dynamic";

export default async function DocPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Editor docId={id} />;
}
