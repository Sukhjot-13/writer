// lib/sanitize.ts — strict, dependency-free HTML sanitizer for IMPORTED html
// (2026-09-28, FR-40 hardening).
//
// Why this exists: pasted/imported HTML was stored verbatim and later served
// from the app's own origin as `text/html` (GET /api/documents/[id]/html, and
// the "Download HTML" button). A `<script>`, an `onerror=` attribute or a
// `javascript:` href therefore executed with the app's origin — a stored-XSS
// hole in an app that had no authentication at all.
//
// Contract (deliberately narrow — imported material is reading content, not an
// application):
//   REMOVED  <script> <style> <iframe> <object> <embed> <applet> <frameset>
//            <noscript> <template> <svg> <math> (element AND its content)
//   REMOVED  <base> <link> <meta> <frame> <form> tags (content kept)
//   REMOVED  HTML comments, every `on*` event attribute, `srcdoc`, `http-equiv`
//   REMOVED  any URL attribute whose scheme is not http/https/mailto/tel/ftp
//            (javascript:, data:, vbscript:, file: …)
//   STRIPPED `style` attributes that reach outside plain inline CSS (url(),
//            expr(), javascript:, markup, braces)
//   KEPT     structure, text, links and images over http(s), inline styles
//
// It is intentionally NOT a full HTML parser: it is a strict scrubber, and
// tests/smoke-m10.ts pins the behaviour (including the UNCLOSED `<script>`
// case, which a naive `[\s\S]*?</script>` misses entirely). It is layered with
// the CSP header the HTML route now sends, so a sanitizer miss still cannot
// load or run a remote script.

/**
 * Paired elements dropped together with everything inside them. Each pattern
 * also swallows an UNTERMINATED opener (the `$` alternative) — otherwise
 * `<script>alert(1)` survives a `[\s\S]*?</script>` scrub entirely.
 */
const ELEMENT_VOIDED = [
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "applet",
  "frameset",
  "noscript",
  "template",
  "svg",
  "math",
] as const;

/** Void / self-closing tags removed on their own (dropping the rest of the
 *  document because they never close would be catastrophic, not safe). */
const TAG_VOIDED = ["base", "link", "meta", "frame"] as const;

/** Wrapper tags removed while their children are kept. */
const WRAPPER_VOIDED = ["form"] as const;

/** Attributes that carry a URL and therefore a scheme to police. */
const URL_ATTRIBUTES = new Set([
  "href",
  "src",
  "srcset",
  "action",
  "formaction",
  "poster",
  "data",
  "background",
  "cite",
  "longdesc",
  "profile",
  "manifest",
  "xlink:href",
  "ping",
]);

/** Schemes an imported document may link to. Everything else is dropped. */
const ALLOWED_SCHEMES = new Set(["http", "https", "mailto", "tel", "ftp"]);

/** Inline `style` values must be plain declarations — no fetches, no script. */
const DANGEROUS_STYLE = /(url\s*\(|expression\s*\(|javascript\s*:|vbscript\s*:|@import|[<>{}])/i;

/** Characters a browser ignores inside a URL scheme: C0/C1 controls + spaces. */
const URL_NOISE = /[\u0000-\u0020\u00a0\u1680\u2000-\u200f\u2028-\u202f\u205f\u3000\ufeff]/g;

const NAMED_ENTITIES: Record<string, string> = {
  tab: "\t",
  newline: "\n",
  colon: ":",
  sol: "/",
  amp: "&",
  NewLine: "\n",
  Tab: "\t",
  nbsp: " ",
};

function safeFromCodePoint(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return "";
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}

/** Decode numeric and the handful of named entities that matter for a scheme. */
export function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-fA-F]+);?/g, (_, hex: string) => safeFromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);?/g, (_, dec: string) => safeFromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-zA-Z]+);?/g, (whole, name: string) => NAMED_ENTITIES[name] ?? whole);
}

/**
 * Reduce an attribute value to the form a browser's URL parser effectively sees:
 * entities decoded, whitespace/control characters removed, lowercased.
 * `&#106;avascript:` and `java\tscript:` both collapse to `javascript:` here.
 */
export function normalizeUrlValue(raw: string): string {
  return decodeEntities(raw).replace(URL_NOISE, "").toLowerCase();
}

/**
 * True when a URL attribute value is safe to keep. Relative URLs, fragments and
 * protocol-relative `//host/x` are fine (they cannot execute); anything with an
 * explicit scheme must be allow-listed.
 */
export function isSafeUrlValue(raw: string): boolean {
  const value = normalizeUrlValue(raw).trim();
  if (value === "") return true;
  const scheme = value.match(/^([a-z][a-z0-9+.-]*):/);
  if (!scheme) return true;
  return ALLOWED_SCHEMES.has(scheme[1]);
}

/** Remove dangerous elements, void tags, wrapper tags and comments. */
function dropDangerousElements(html: string): string {
  let out = html;
  for (const tag of ELEMENT_VOIDED) {
    out = out.replace(
      new RegExp(`<\\s*${tag}\\b[\\s\\S]*?(?:<\\s*\\/\\s*${tag}\\s*>|$)`, "gi"),
      "",
    );
    out = out.replace(new RegExp(`<\\s*\\/\\s*${tag}\\s*>`, "gi"), "");
  }
  for (const tag of TAG_VOIDED) {
    out = out.replace(new RegExp(`<\\s*${tag}\\b[^>]*>`, "gi"), "");
  }
  for (const tag of WRAPPER_VOIDED) {
    out = out.replace(new RegExp(`<\\s*${tag}\\b[^>]*>`, "gi"), "");
    out = out.replace(new RegExp(`<\\s*\\/\\s*${tag}\\s*>`, "gi"), "");
  }
  // Comments can smuggle markup and add nothing to imported content.
  return out.replace(/<!--[\s\S]*?(?:-->|$)/g, "");
}

interface Attribute {
  name: string;
  raw: string;
}

const ATTRIBUTE_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'`=<>]+))?/g;

function parseAttributes(source: string): Attribute[] {
  const attrs: Attribute[] = [];
  ATTRIBUTE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ATTRIBUTE_RE.exec(source)) !== null) {
    attrs.push({ name: match[1].toLowerCase(), raw: match[2] ?? "" });
  }
  return attrs;
}

function attributeValue(raw: string): string {
  const eq = raw.indexOf("=");
  if (eq === -1) return "";
  const value = raw.slice(eq + 1).trim();
  return /^["']/.test(value) ? value.slice(1, -1) : value;
}

/** True when the attribute must not survive into stored/served HTML. */
export function shouldDropAttribute(name: string, value: string): boolean {
  const lower = name.toLowerCase();
  // Every event handler, whatever its casing (`onClick`, `ONERROR`, `onerror`).
  if (lower.startsWith("on")) return true;
  // Inline documents / client-side redirects.
  if (lower === "srcdoc" || lower === "http-equiv") return true;
  if (lower === "style" && DANGEROUS_STYLE.test(decodeEntities(value))) return true;
  if (URL_ATTRIBUTES.has(lower) && !isSafeUrlValue(value)) return true;
  return false;
}

function sanitizeTag(raw: string): string {
  const match = raw.match(/^<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)([\s\S]*?)(\/?)>$/);
  if (!match) return "";
  const closing = match[1];
  const name = match[2];
  const kept: string[] = [];
  for (const attr of parseAttributes(match[3])) {
    if (shouldDropAttribute(attr.name, attributeValue(attr.raw))) continue;
    kept.push(attr.raw.trim() ? `${attr.name}${attr.raw}` : attr.name);
  }
  return `<${closing}${name}${kept.length ? ` ${kept.join(" ")}` : ""}${match[4]}>`;
}

const TAG_RE = /<(\/?[a-zA-Z][a-zA-Z0-9:-]*)((?:"[^"]*"|'[^']*'|[^>])*)>/g;

/**
 * Sanitize an imported HTML string. Text nodes are preserved verbatim (the
 * renderers escape at output time, not here); only markup is rewritten.
 */
export function sanitizeImportedHtml(html: string): string {
  if (typeof html !== "string" || html === "") return "";
  const stripped = dropDangerousElements(html);
  TAG_RE.lastIndex = 0;
  return stripped.replace(TAG_RE, (raw) => sanitizeTag(raw));
}
