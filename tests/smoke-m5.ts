// M5 smoke test: HTML→blocks parse-back (FR-41), ZIP writer, tags parsing.
//
// Parse-back is round-trip tested through the real template generator
// (generateTemplateHTML): build a document → render → parse → compare
// structure and fields. Also covers hidden-element omission, raw-HTML
// fallback for unrecognized fragments, and zip structural signatures
// (a full `unzip -t` pass runs in the Bash verification step).

import { inflateRawSync } from "node:zlib";
import { promises as fs } from "node:fs";
import path from "node:path";

import { createDocument, createBlock, setBlockContent, type Block, type QaContent } from "../lib/types";
import { DEFAULT_TOKENS } from "../lib/design-tokens";
import { generateTemplateHTML } from "../lib/html-template";
import { parseHtmlToBlocks } from "../lib/html-to-blocks";
import { createZip } from "../lib/zip";
import { parseTags } from "../lib/tags";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => {
  if (cond) { pass++; console.log("PASS —", name); }
  else { fail++; console.log("FAIL —", name); }
};

function qa(content: Partial<QaContent>): Block {
  return setBlockContent(createBlock("qa"), {
    question: "",
    responseLabel: "RÉPONSE",
    ...content,
  });
}

function richDocument() {
  const doc = createDocument("Round trip");
  doc.blocks = [
    setBlockContent(createBlock("title"), { text: "Ma journée" }),
    setBlockContent(createBlock("paragraph"), { text: "Premier paragraphe.\nSeconde ligne.", format: "plain" }),
    setBlockContent(createBlock("paragraph"), { text: "Un **mot** en gras et *italique*.", format: "markdown" }),
    qa({
      question: "Qu'as-tu fait hier ?",
      questionTranslation: "What did you do yesterday?",
      grammarNote: "Passé composé avec avoir.",
      responseLabel: "RÉPONSE",
      userAnswer: "Hier, je suis allé au cinéma.",
      modelAnswer: "Hier, je suis allé au cinéma avec mes amis.",
      answerTranslation: "Yesterday I went to the cinema with my friends.",
      analysis: "On emploie l'imparfait pour la description.",
      vocab: [
        { term: "hier", def: "yesterday" },
        { term: "le cinéma", def: "the cinema" },
      ],
      expressions: [{ term: "faire un tour", def: "to take a stroll" }],
    }),
    qa({
      question: "Question cachée ?",
      questionTranslation: "Hidden translation",
      hideTranslation: true,
      modelAnswer: "Réponse cachée.",
      hideModelAnswer: true,
    }),
    createBlock("separator"),
    setBlockContent(createBlock("heading"), { text: "Section suivante", level: 3 }),
  ];
  return doc;
}

async function run() {
  const doc = richDocument();
  // 2026-08-10 M7 round 4: the template no longer renders practice answers by
  // default (the preview never shows them) — the parse-back round trip passes
  // showUserAnswers so the .qa-user-answer recovery path keeps being tested.
  const html = generateTemplateHTML(doc, DEFAULT_TOKENS, { showUserAnswers: true });

  // ---------- parse-back round trip (FR-41) ----------
  const parsed = parseHtmlToBlocks(html);
  check("parse: same block count", parsed.blocks.length === doc.blocks.length);
  check("parse: no unparsed fallbacks", parsed.unparsedCount === 0);

  const [p0, p1, p2, p3, p4, p5, p6] = parsed.blocks;
  check("parse: title text", p0.type === "title" && p0.content.text === "Ma journée");
  check("parse: plain paragraph keeps line break",
    p1.type === "paragraph" && p1.content.text === "Premier paragraphe.\nSeconde ligne.");
  check("parse: markdown paragraph restores markers",
    p2.type === "paragraph" && p2.content.format === "markdown" && p2.content.text === "Un **mot** en gras et *italique*.");

  const q1 = p3.type === "qa" ? p3.content : null;
  check("parse: QA question", q1?.question === "Qu'as-tu fait hier ?");
  check("parse: QA <em> translation split out", q1?.questionTranslation === "What did you do yesterday?");
  check("parse: grammar note", q1?.grammarNote === "Passé composé avec avoir.");
  check("parse: response label", q1?.responseLabel === "RÉPONSE");
  check("parse: user answer (dashed box)", q1?.userAnswer === "Hier, je suis allé au cinéma.");
  check("parse: model answer (.qa-answer exact class)", q1?.modelAnswer === "Hier, je suis allé au cinéma avec mes amis.");
  check("parse: answer translation", q1?.answerTranslation === "Yesterday I went to the cinema with my friends.");
  check("parse: analysis label stripped", q1?.analysis === "On emploie l'imparfait pour la description.");
  check("parse: vocab grid rows", q1?.vocab?.length === 2 && q1.vocab[1].term === "le cinéma" && q1.vocab[1].def === "the cinema");
  check("parse: expressions column", q1?.expressions?.length === 1 && q1.expressions[0].term === "faire un tour");

  // FR-36: hidden elements are omitted from the HTML, so the parser must not
  // fabricate them — parse-back of the rendered output carries no hide flags
  // (best-effort: hidden fields simply don't appear).
  const q2 = p4.type === "qa" ? p4.content : null;
  check("parse: hidden translation not fabricated", q2?.questionTranslation === undefined);
  check("parse: hidden model answer not fabricated", q2?.modelAnswer === undefined);
  check("parse: question of hidden-qa still present", q2?.question === "Question cachée ?");

  check("parse: separator", p5.type === "separator");
  check("parse: heading level 3", p6.type === "heading" && p6.content.level === 3 && p6.content.text === "Section suivante");

  // ---------- full round trip: parse → re-render → re-parse (stability) ----------
  const html2 = generateTemplateHTML({ ...doc, blocks: parsed.blocks }, DEFAULT_TOKENS);
  const parsed2 = parseHtmlToBlocks(html2);
  check("round trip: stable block count", parsed2.blocks.length === parsed.blocks.length);
  const rq = parsed2.blocks.find((b) => b.type === "qa" && b.content.question === "Qu'as-tu fait hier ?");
  check("round trip: vocab survives two passes", rq?.type === "qa" && rq.content.vocab?.length === 2);

  // ---------- unparseable fragments → raw-HTML paragraph (FR-41) ----------
  const stray = parseHtmlToBlocks(
    "<main class=\"document\"><div class=\"unknown-widget\" data-x=\"1\"><span>inner</span></div><p>plain</p></main>",
  );
  check("unparsed: unknown element → paragraph with raw HTML preserved",
    stray.blocks[0].type === "paragraph" && stray.blocks[0].content.text.includes("unknown-widget") && stray.blocks[0].content.text.includes("<span>inner</span>"));
  check("unparsed: plain <p> is also an unparsed fragment (childless → text kept)",
    stray.unparsedCount === 2);
  check("unparsed: plain <p> becomes text paragraph",
    stray.blocks[1].type === "paragraph" && stray.blocks[1].content.text === "plain");

  // ---------- tags parsing (lib/tags.ts, FR-5/18) ----------
  check("tags: lowercase + de-hash + dedupe", JSON.stringify(parseTags("French, #past-tense, french")) === JSON.stringify(["french", "past-tense"]));
  check("tags: whitespace → dash", JSON.stringify(parseTags("a b, c")) === JSON.stringify(["a-b", "c"]));
  check("tags: empty input", parseTags("  , , #")?.length === 0);

  // ---------- ZIP writer (backup, M5) ----------
  const zip = createZip([
    { name: "doc1/", data: Buffer.alloc(0) },
    { name: "doc1/document.json", data: Buffer.from('{"title":"hello"}', "utf8") },
    { name: "doc1/document.html", data: Buffer.from("<p>hi</p>", "utf8") },
    { name: "doc1/document.pdf", data: Buffer.from("%PDF-1.7 fake", "utf8") },
    { name: "doc2/document.json", data: Buffer.from("{}", "utf8") },
  ]);
  check("zip: local header magic (PK\\x03\\x04)", zip.readUInt32LE(0) === 0x04034b50);
  check("zip: EOCD magic at end (PK\\x05\\x06)", zip.readUInt32LE(zip.length - 22) === 0x06054b50);
  check("zip: EOCD entry count", zip.readUInt16LE(zip.length - 12) === 5);
  check("zip: deflate method in first local header", zip.readUInt16LE(8) === 8);
  // Round-trip: deflate each entry's stored data back and compare with the source.
  const entries = [
    { name: "doc1/", data: Buffer.alloc(0) },
    { name: "doc1/document.json", data: Buffer.from('{"title":"hello"}', "utf8") },
    { name: "doc1/document.html", data: Buffer.from("<p>hi</p>", "utf8") },
    { name: "doc1/document.pdf", data: Buffer.from("%PDF-1.7 fake", "utf8") },
    { name: "doc2/document.json", data: Buffer.from("{}", "utf8") },
  ];
  let zipOk = true;
  let cursor = 0;
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, "utf8");
    const nameLen = zip.readUInt16LE(cursor + 26);
    const csize = zip.readUInt32LE(cursor + 18);
    const dataStart = cursor + 30 + nameLen;
    const back = inflateRawSync(zip.subarray(dataStart, dataStart + csize));
    if (!back.equals(e.data)) zipOk = false;
    cursor = dataStart + csize;
  }
  check("zip: every entry inflates back to its source bytes", zipOk);
  // Write the archive so the Bash step can run `unzip -t` on it.
  const scratch = path.resolve(__dirname, "..", ".tmp-m5");
  await fs.mkdir(scratch, { recursive: true });
  await fs.writeFile(path.join(scratch, "backup.zip"), zip);

  console.log(`\nM5 smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error("M5 smoke crashed:", e);
  process.exit(1);
});
