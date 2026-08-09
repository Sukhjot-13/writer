// app/page.tsx — editor route ("/"). Reads ?id= to open a saved document;
// wraps the useSearchParams consumer in Suspense (Next 16 requirement —
// static pages must not call it outside a Suspense boundary).

"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import Editor from "@/components/Editor";

function EditorRoute() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  return <Editor docId={id} />;
}

export default function Page() {
  return (
    <Suspense
      fallback={<div className="p-8 text-sm text-zinc-500">Loading editor…</div>}
    >
      <EditorRoute />
    </Suspense>
  );
}
