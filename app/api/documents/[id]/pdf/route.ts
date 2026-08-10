// /api/documents/[id]/pdf — download the document's A4 PDF (FR-14/15/19, M6).
//
// The PDF is always generated from block data (document.json) via
// @react-pdf/renderer — never from HTML, no Chrome anywhere.
//
// M6 redesign: three variants ("full" | "questions" | "my-answers") replace
// the old ?practice= flag. POST accepts the current in-editor document body
// { doc, variant } so "Download PDF" renders instantly from current content
// without requiring a save first; GET keeps the saved-doc path with ?variant=.

import { NextResponse } from "next/server";

import { getStorage } from "@/lib/storage";
import { getTokens } from "@/lib/design-tokens";
import { generatePDFBuffer, type PDFVariant } from "@/lib/pdf";
import { documentSchema } from "@/lib/schemas";

type RouteParams = { params: Promise<{ id: string }> };

const VARIANTS: readonly PDFVariant[] = ["full", "questions", "my-answers"];

function parseVariant(value: string | null): PDFVariant {
  return VARIANTS.includes(value as PDFVariant) ? (value as PDFVariant) : "full";
}

/** "My Notes" → "My-Notes" — safe attachment filename (variant-suffixed). */
function safeFilename(title: string, variant: PDFVariant): string {
  const clean = title.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  const base = clean || "document";
  const suffix = variant === "questions" ? "-questions" : variant === "my-answers" ? "-my-answers" : "";
  return `${base}${suffix}.pdf`;
}

export async function GET(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const storage = getStorage();
  const doc = await storage.getDocument(id);
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  const { searchParams } = new URL(request.url);
  const variant = parseVariant(searchParams.get("variant"));

  const tokens = await getTokens();
  const buffer = await generatePDFBuffer(doc, tokens, { variant });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeFilename(doc.title, variant)}"`,
    },
  });
}

export async function POST(request: Request, { params }: RouteParams) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const payload = (body ?? {}) as { doc?: unknown; variant?: unknown };
  const parsed = documentSchema.safeParse(payload.doc ?? body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid document payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  if (parsed.data.id !== id) {
    return NextResponse.json(
      { error: "Document id in payload does not match route id" },
      { status: 400 },
    );
  }

  const variant = typeof payload.variant === "string" ? parseVariant(payload.variant) : "full";
  const tokens = await getTokens();
  const buffer = await generatePDFBuffer(parsed.data, tokens, { variant });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeFilename(parsed.data.title, variant)}"`,
    },
  });
}
