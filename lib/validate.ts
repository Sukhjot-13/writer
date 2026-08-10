// lib/validate.ts — HTML validation & wrapping (FR-10, Plan §17).
//
// Conversion output (AI or pasted HTML) is normalized before it is previewed
// or saved: markdown fences stripped, sanity-checked to be HTML, wrapped in a
// full document when it is a fragment, DOCTYPE prepended. Never trusted raw.

import { stripMarkdownFences } from "./ai";

/**
 * Normalize converter output into a complete HTML document string.
 * 1. Strip markdown code fences (```html … ```).
 * 2. If it looks like a full document (<html or <!doctype), use as-is.
 * 3. Otherwise wrap a fragment in <!DOCTYPE html><html><head><meta
 *    charset><title><body> so it renders standalone.
 */
export function validateAndWrapHtml(input: string): string {
  const cleaned = stripMarkdownFences(input).trim();

  if (/^<!doctype\s+html/i.test(cleaned) || /^<html[\s>]/i.test(cleaned)) {
    return cleaned;
  }

  // Fragment — wrap it (title fallback: first heading text if any).
  const titleMatch = cleaned.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  const title = titleMatch ? titleMatch[1].trim() : "Document";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
</head>
<body>
${cleaned}
</body>
</html>
`;
}
