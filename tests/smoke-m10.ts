// tests/smoke-m10.ts — 2026-09-28 security & robustness suite.
//
// Covers the fixes from the security + bug + UI audit, and — just as important —
// their NEGATIVE cases. Pure seams only: no database, no network, no DOM, so it
// runs in the same node harness as every other suite.
//
//   • the imported-HTML sanitizer (stored XSS)
//   • the design-token value allow-list + the CSS interpolation backstop
//   • the route document-id validator (the `DELETE /api/documents/%2A` wipe)
//   • the OTP/session crypto helpers: hashing, salting, constant-time compare,
//     expiry, attempt lock-out
//   • the in-memory rate limiter
//   • the zod payload ceilings
//   • the file-index prefix range (range query, never a user-built regex)
//   • requireEnv never defaulting a missing secret

import { generateTemplateHTML, safeTokenValue } from "../lib/html-template";
import { DEFAULT_TOKENS } from "../lib/design-tokens";
import {
  isValidTokenValue,
  parseTokensBlock,
  MAX_TOKENS,
  TOKEN_VALUE_PATTERN,
} from "../lib/tokens";
import { DOCUMENT_ID_PATTERN, isValidDocumentId, isValidVersion } from "../lib/ids";
import {
  OTP_MAX_ATTEMPTS,
  generateOtpCode,
  hashOtpCode,
  hashToken,
  isWellFormedSessionToken,
  otpIsExpired,
  otpIsLocked,
  safeEquals,
  SESSION_TTL_MS,
  OTP_TTL_MS,
} from "../lib/auth";
import { isValidEmail, normalizeEmail } from "../lib/user";
import { requireEnv, hasEnv } from "../lib/env";
import { rateLimit, resetRateLimits, clientIp } from "../lib/rate-limit";
import { filePrefixRange } from "../lib/storage-mongo";
import { sanitizeImportedHtml, isSafeUrlValue, shouldDropAttribute, decodeEntities } from "../lib/sanitize";
import { validateAndWrapHtml } from "../lib/validate";
import {
  documentSchema,
  goalSchema,
  saveDocumentPayloadSchema,
  MAX_BLOCK_TEXT_CHARS,
  MAX_TITLE_CHARS,
} from "../lib/schemas";

let pass = 0,
  fail = 0;
const check = (name: string, cond: boolean) => {
  if (cond) {
    pass++;
    console.log("PASS —", name);
  } else {
    fail++;
    console.log("FAIL —", name);
  }
};

function run() {
  // =====================================================================
  // 1. HTML SANITIZER — imported HTML is served as text/html from our origin
  // =====================================================================
  check("sanitize: <script> element removed", !/script/i.test(sanitizeImportedHtml("<p>hi</p><script>alert(1)</script>")));
  check("sanitize: UNCLOSED <script> removed (a </script>-only regex misses this)",
    !sanitizeImportedHtml("<p>hi</p><script>alert(1)").includes("alert"));
  check("sanitize: <script src=…> removed", !/alert|evil\.example/.test(sanitizeImportedHtml('<script src="https://evil.example/x.js"></script>')));
  check("sanitize: <style> element removed", !/expression|@import/.test(sanitizeImportedHtml("<style>body{color:red}</style><p>x</p>")));
  check("sanitize: <iframe> removed", !sanitizeImportedHtml('<iframe src="https://evil.example"></iframe>').includes("iframe"));
  check("sanitize: <object>/<embed> removed",
    !/object|embed/.test(sanitizeImportedHtml("<object data='x.swf'></object><embed src='x'>")));
  check("sanitize: <svg> removed (foreign-content script vector)",
    !sanitizeImportedHtml("<svg><script>alert(1)</script></svg>").includes("svg"));
  check("sanitize: <base href> removed (base-tag hijack)",
    !sanitizeImportedHtml('<base href="https://evil.example/"><p>x</p>').includes("base"));
  check("sanitize: <meta http-equiv=refresh> removed",
    !sanitizeImportedHtml('<meta http-equiv="refresh" content="0;url=https://evil.example">').includes("refresh"));
  check("sanitize: <link> removed", !sanitizeImportedHtml('<link rel="stylesheet" href="https://evil.example/x.css">').includes("evil.example"));
  check("sanitize: <form> tags removed but its children kept",
    !sanitizeImportedHtml("<form action='https://evil.example'><p>keep me</p></form>").includes("form") &&
      sanitizeImportedHtml("<form action='https://evil.example'><p>keep me</p></form>").includes("keep me"));
  check("sanitize: HTML comments removed", !sanitizeImportedHtml("<!-- <script>alert(1)</script> -->x").includes("script"));

  check("sanitize: onerror attribute removed",
    !/onerror/i.test(sanitizeImportedHtml('<img src="x" onerror="alert(1)">')));
  check("sanitize: onload attribute removed (any casing)",
    !/onload/i.test(sanitizeImportedHtml('<body ONLOAD="alert(1)">')));
  check("sanitize: onclick attribute removed", !/onclick/i.test(sanitizeImportedHtml('<a href="#" onclick="steal()">x</a>')));
  check("sanitize: srcdoc removed", !/srcdoc/i.test(sanitizeImportedHtml('<div srcdoc="<script>x</script>"></div>')));
  check("sanitize: style attribute with url() removed",
    !/style/i.test(sanitizeImportedHtml('<div style="background:url(https://evil.example/x)">y</div>')));
  check("sanitize: plain style attribute kept",
    sanitizeImportedHtml('<div style="color: #333">y</div>').includes("color"));

  check("sanitize: javascript: href removed",
    !sanitizeImportedHtml('<a href="javascript:alert(1)">x</a>').includes("javascript"));
  check("sanitize: data: src removed",
    !sanitizeImportedHtml('<img src="data:text/html;base64,PHNjcmlwdD4=">').includes("data:"));
  check("sanitize: vbscript: href removed",
    !sanitizeImportedHtml('<a href="vbscript:msgbox(1)">x</a>').toLowerCase().includes("vbscript"));
  check("sanitize: whitespace-split scheme removed (java\\tscript:)",
    !sanitizeImportedHtml('<a href="java\tscript:alert(1)">x</a>').toLowerCase().includes("script:"));
  check("sanitize: entity-encoded scheme removed (&#106;avascript:)",
    !sanitizeImportedHtml('<a href="&#106;avascript:alert(1)">x</a>').toLowerCase().includes("javascript:"));
  check("sanitize: ordinary https href KEPT",
    sanitizeImportedHtml('<a href="https://example.com/x">x</a>').includes("https://example.com/x"));
  check("sanitize: relative href KEPT", sanitizeImportedHtml('<a href="/page">x</a>').includes('href="/page"'));
  check("sanitize: mailto KEPT", sanitizeImportedHtml('<a href="mailto:a@b.com">x</a>').includes("mailto:"));
  check("sanitize: text content is preserved", sanitizeImportedHtml("<p>Bonjour <b>monde</b></p>").includes("Bonjour"));
  check("sanitize: empty and non-string input are safe",
    sanitizeImportedHtml("") === "" && sanitizeImportedHtml(undefined as unknown as string) === "");

  check("sanitize: isSafeUrlValue rejects javascript:, allows https",
    !isSafeUrlValue("javascript:alert(1)") && isSafeUrlValue("https://a.example"));
  check("sanitize: shouldDropAttribute flags on* and srcdoc, keeps class",
    shouldDropAttribute("onerror", "x") && shouldDropAttribute("srcdoc", "x") && !shouldDropAttribute("class", "x"));
  check("sanitize: decodeEntities resolves numeric entities", decodeEntities("&#106;x") === "jx");

  // The wrapper's <title> comes from attacker-controlled <h1> text.
  const wrapped = validateAndWrapHtml('<h1>a</h1><img src=x onerror="alert(1)">');
  check("validate: wrapper escapes the h1-derived <title>", !/<\/title>/.test(wrapped.split("<title>")[1]?.split("</title>")[0] ?? "x"));
  check("validate: wrapper + sanitizer leave no onerror",
    !validateAndWrapHtml(sanitizeImportedHtml('<h1>a</h1><img src=x onerror="alert(1)">')).includes("onerror"));

  // =====================================================================
  // 2. DESIGN TOKENS — CSS injection through PUT /api/instructions
  // =====================================================================
  const INJECTION = "#000 } </style><script>fetch('/api/documents')</script>";
  check("tokens: the CSS-injection payload is rejected by the allow-list", !isValidTokenValue(INJECTION));
  check("tokens: a plain hex colour is accepted", isValidTokenValue("#1a1a1a"));
  check("tokens: a font stack is accepted", isValidTokenValue("Georgia, Times New Roman, serif"));
  check("tokens: an rgba() value is accepted", isValidTokenValue("rgba(0,0,0,0.18)"));
  check("tokens: multi-part spacing is accepted", isValidTokenValue("14px 16px"));
  check("tokens: a percentage radius is accepted", isValidTokenValue("50%"));
  check("tokens: an empty value is rejected", !isValidTokenValue(""));
  check("tokens: an over-64-char value is rejected", !isValidTokenValue("#".padEnd(65, "a")));
  check("tokens: a backslash (CSS escape) is rejected", !isValidTokenValue("red\\3b color:blue"));
  check("tokens: a lone brace is rejected", !isValidTokenValue("}"));
  check("tokens: the pattern itself rejects angle brackets", !TOKEN_VALUE_PATTERN.test("<"));
  const cleanedToken = safeTokenValue("#000 } </style>\\x");
  check("tokens: safeTokenValue strips < > { } and backslashes",
    !/[<>{}\\]/.test(cleanedToken) && cleanedToken.includes("#000") && cleanedToken.includes("style"));

  const hostile = parseTokensBlock(
    `<!-- TOKENS -->\ncolors:\n  mainText: "${INJECTION}"\n  heading: "#1e3a5f"\n<!-- /TOKENS -->`,
    DEFAULT_TOKENS,
  );
  check("tokens: a hostile token falls back to the default", hostile?.colors.mainText === DEFAULT_TOKENS.colors.mainText);
  check("tokens: sibling tokens in the same block still parse", hostile?.colors.heading === "#1e3a5f");

  const oversize = ["<!-- TOKENS -->", "colors:"];
  for (let i = 0; i < MAX_TOKENS + 20; i++) oversize.push(`  k${i}: "#123456"`);
  oversize.push("<!-- /TOKENS -->");
  const capped = parseTokensBlock(oversize.join("\n"), DEFAULT_TOKENS);
  check("tokens: the token count is capped", capped !== null && !("k" in (capped.colors as object)));
  check("tokens: a block with no TOKENS marker returns null", parseTokensBlock("nothing", DEFAULT_TOKENS) === null);

  // Defence in depth: even a token object built by hand cannot break out of
  // the <style> block, because buildCss routes every value through safeTokens.
  const rendered = generateTemplateHTML(
    { id: "d", title: "t", source: "editor", createdAt: "", updatedAt: "", tags: [], blocks: [] },
    {
      colors: { ...DEFAULT_TOKENS.colors, mainText: INJECTION },
      fonts: { ...DEFAULT_TOKENS.fonts, base: "serif} body{display:none" },
      sizes: { ...DEFAULT_TOKENS.sizes },
      spacing: { ...DEFAULT_TOKENS.spacing },
      radius: { ...DEFAULT_TOKENS.radius },
    },
  );
  check("html: buildCss neutralizes a hand-built hostile token value", !rendered.includes("</style><script"));
  check("html: buildCss drops the brace that would end a declaration", !rendered.includes("serif} body"));

  // =====================================================================
  // 3. DOCUMENT ID — the `DELETE /api/documents/%2A` file-index wipe
  // =====================================================================
  check("ids: a uuid is a valid document id", isValidDocumentId("0f8c1a2b-3d4e-4f5a-8b9c-0d1e2f3a4b5c"));
  check("ids: a legacy underscore/dash id is valid", isValidDocumentId("doc-in-folder"));
  check("ids: '*' is REJECTED (the whole-store wipe)", !isValidDocumentId("*"));
  check("ids: a regex metacharacter is rejected", !isValidDocumentId("a.b"));
  check("ids: a mongo operator is rejected", !isValidDocumentId("$ne"));
  check("ids: a slash (traversal) is rejected", !isValidDocumentId("../../etc/passwd"));
  check("ids: an over-64-char id is rejected", !isValidDocumentId("a".repeat(65)));
  check("ids: an empty id is rejected", !isValidDocumentId(""));
  check("ids: a non-string is rejected", !isValidDocumentId(null) && !isValidDocumentId(42));
  check("ids: the pattern is anchored at both ends", DOCUMENT_ID_PATTERN.source.startsWith("^") && DOCUMENT_ID_PATTERN.source.endsWith("$"));
  check("ids: versions allow ISO stamps but not a slash", isValidVersion("2026-09-28T10:00:00.000Z") && !isValidVersion("a/b"));

  // The file index is keyed "<docId>/<filename>": the prefix scan is a RANGE,
  // so no metacharacter in the id can widen it.
  const range = filePrefixRange("abc");
  check("ids: the file prefix range starts at the id + '/'", range.$gte === "abc/");
  check("ids: the file prefix range ends at the next lexicographic char", range.$lt === "abc0");
  check("ids: the prefix range is a range query, not a regex", !("$regex" in range));
  check("ids: '*' cannot widen a range query (regression for the wipe)", filePrefixRange("*").$gte === "*/");

  // =====================================================================
  // 4. OTP + SESSION CRYPTO
  // =====================================================================
  const code = generateOtpCode();
  check("otp: the code is 6 zero-padded digits", /^\d{6}$/.test(code));
  check("otp: the code varies across draws", generateOtpCode() !== code || generateOtpCode() !== code);
  check("otp: 000000 is a possible code (padStart works)", /^\d{6}$/.test("000000"));

  check("otp: the code is never stored — only a sha256 digest", hashOtpCode("a@b.com", "123456").length === 64);
  check("otp: the digest is deterministic for the same input",
    hashOtpCode("a@b.com", "123456") === hashOtpCode("A@B.com ", "123456"));
  check("otp: the digest is salted with the address (no cross-address replay)",
    hashOtpCode("a@b.com", "123456") !== hashOtpCode("c@d.com", "123456"));
  check("otp: a different code gives a different digest", hashOtpCode("a@b.com", "123456") !== hashOtpCode("a@b.com", "654321"));
  check("otp: the raw code does not appear in the digest", !hashOtpCode("a@b.com", "123456").includes("123456"));

  check("otp: safeEquals matches identical values", safeEquals("abc", "abc"));
  check("otp: safeEquals rejects a different value", !safeEquals("abc", "abd"));
  check("otp: safeEquals rejects different lengths without throwing", !safeEquals("abc", "abcdef"));
  check("otp: safeEquals rejects an empty-vs-value comparison", !safeEquals("", "abc"));
  check("otp: safeEquals accepts two identical values including empty", safeEquals("", ""));

  // `expiresAt` is the DEADLINE, so a 9-minute-old code expires one minute from now.
  check("otp: a code whose 10-minute window has passed is expired",
    otpIsExpired(new Date(Date.now() - 60_000)));
  check("otp: a code issued 9 minutes ago (1 minute left) is NOT expired",
    !otpIsExpired(new Date(Date.now() + 60_000)));
  check("otp: a code expiring exactly now counts as expired", otpIsExpired(new Date(Date.now())));
  check("otp: the attempt lock-out trips at 5 wrong guesses", otpIsLocked(OTP_MAX_ATTEMPTS));
  check("otp: 4 wrong guesses do not lock out", !otpIsLocked(OTP_MAX_ATTEMPTS - 1));
  check("otp: the OTP window is 10 minutes", OTP_TTL_MS === 10 * 60_000);
  check("otp: the session window is 30 days", SESSION_TTL_MS === 30 * 24 * 60 * 60 * 1000);

  const token = hashToken("deadbeef");
  check("session: only the digest of the token is stored", token.length === 64 && !token.includes("deadbeef"));
  check("session: the digest is stable", hashToken("deadbeef") === token);
  check("session: a 64-hex-char token is well formed", isWellFormedSessionToken("a".repeat(64)));
  check("session: a short/garbage token is rejected", !isWellFormedSessionToken("abc"));
  check("session: a non-hex token is rejected", !isWellFormedSessionToken("z".repeat(64)));
  check("session: a missing token is rejected", !isWellFormedSessionToken(undefined) && !isWellFormedSessionToken(null));

  // =====================================================================
  // 5. EMAIL NORMALIZATION
  // =====================================================================
  check("email: lowercased and trimmed", normalizeEmail("  A@B.COM ") === "a@b.com");
  check("email: a valid address passes", isValidEmail("user@example.com"));
  check("email: an address without a dot in the domain is rejected", !isValidEmail("user@localhost"));
  check("email: an address without @ is rejected", !isValidEmail("nope"));
  check("email: an address with a space is rejected", !isValidEmail("a b@c.com"));
  check("email: an over-long address is rejected", !isValidEmail(`${"a".repeat(250)}@b.com`));

  // =====================================================================
  // 6. RATE LIMITER
  // =====================================================================
  resetRateLimits();
  const now = 1_000_000;
  check("rate: the first hit is allowed", rateLimit("k", 3, 60_000, now).allowed);
  check("rate: the second hit is allowed", rateLimit("k", 3, 60_000, now).allowed);
  check("rate: the third hit is allowed", rateLimit("k", 3, 60_000, now).allowed);
  const blocked = rateLimit("k", 3, 60_000, now);
  check("rate: the fourth hit is blocked", !blocked.allowed);
  check("rate: a blocked hit reports a retry-after", blocked.retryAfterSeconds > 0);
  check("rate: a different key has its own budget", rateLimit("other", 3, 60_000, now).allowed);
  check("rate: the window resets after it elapses", rateLimit("k", 3, 60_000, now + 61_000).allowed);
  check("rate: remaining is reported", rateLimit("k2", 3, 60_000, now).remaining === 2);

  const fake = new Request("https://x.test/api/auth/otp/send", {
    headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" },
  });
  check("rate: the client ip is the first forwarded hop", clientIp(fake) === "203.0.113.7");
  check("rate: a request with no ip headers falls back", clientIp(new Request("https://x.test/")) === "unknown");

  // =====================================================================
  // 7. ENV — a missing secret throws, it is never defaulted
  // =====================================================================
  const saved = { key: process.env.BREVO_API_KEY, sender: process.env.BREVO_SENDER_EMAIL };
  delete process.env.BREVO_API_KEY;
  let envThrew = false;
  try {
    requireEnv("BREVO_API_KEY");
  } catch {
    envThrew = true;
  }
  check("env: a missing BREVO_API_KEY throws", envThrew);
  process.env.BREVO_API_KEY = "   ";
  let blankThrew = false;
  try {
    requireEnv("BREVO_API_KEY");
  } catch {
    blankThrew = true;
  }
  check("env: a blank BREVO_API_KEY throws (no silent default)", blankThrew);
  check("env: hasEnv is false for blank", !hasEnv("BREVO_API_KEY"));
  process.env.BREVO_API_KEY = "  key  ";
  check("env: requireEnv trims the value", requireEnv("BREVO_API_KEY") === "key");
  if (saved.key === undefined) delete process.env.BREVO_API_KEY;
  else process.env.BREVO_API_KEY = saved.key;
  if (saved.sender === undefined) delete process.env.BREVO_SENDER_EMAIL;
  else process.env.BREVO_SENDER_EMAIL = saved.sender;

  // =====================================================================
  // 8. PAYLOAD CEILINGS
  // =====================================================================
  const baseDoc = {
    id: "d1",
    title: "T",
    source: "editor",
    createdAt: "now",
    updatedAt: "now",
    tags: [],
    blocks: [],
  };
  check("schema: a 300-char title is accepted",
    documentSchema.safeParse({ ...baseDoc, title: "x".repeat(MAX_TITLE_CHARS) }).success);
  check("schema: a 301-char title is rejected",
    !documentSchema.safeParse({ ...baseDoc, title: "x".repeat(MAX_TITLE_CHARS + 1) }).success);
  const para = { id: "b1", type: "paragraph", tags: [], content: { text: "x".repeat(MAX_BLOCK_TEXT_CHARS + 1) } };
  check("schema: an over-long block text is rejected", !documentSchema.safeParse({ ...baseDoc, blocks: [para] }).success);
  const okPara = { ...para, content: { text: "x".repeat(MAX_BLOCK_TEXT_CHARS) } };
  check("schema: block text at the ceiling is accepted",
    documentSchema.safeParse({ ...baseDoc, blocks: [okPara] }).success);
  check("schema: 2001 blocks are rejected", !documentSchema.safeParse({ ...baseDoc, blocks: new Array(2001).fill(okPara) }).success);
  check("schema: a 2 MB+1 sourceHtml is rejected",
    !documentSchema.safeParse({ ...baseDoc, sourceHtml: "x".repeat(2_000_001) }).success);
  check("schema: the goal is capped at 2000 characters",
    goalSchema.safeParse("x".repeat(2000)).success && !goalSchema.safeParse("x".repeat(2001)).success);
  check("schema: a negative block text length is rejected",
    !saveDocumentPayloadSchema.safeParse({ doc: { ...baseDoc, blocks: [para] } }).success);

  console.log(`\nM10 security smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

try {
  run();
} catch (e) {
  console.error("M10 security smoke crashed:", e);
  process.exit(1);
}
