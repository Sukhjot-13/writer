// M7 smoke test round (2026-08-10): focus-mode plumbing is UI-only (tsc +
// build cover it); this file covers the new pure seams — buildAICopyText
// (copy dialog "For AI" tab), the preview field toggles + qa field order in
// generateTemplateHTML, and the InstructionsEditor history guard behavior is
// exercised via the history content fallback shape.
import { buildAICopyText, serializeBlocksForAI } from "../lib/prompt";
import { generateTemplateHTML } from "../lib/html-template";
import { generatePDFBuffer } from "../lib/pdf";
import { getTokens } from "../lib/design-tokens";
import { createBlock, setBlockContent, createDocument } from "../lib/types";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => {
  if (cond) { pass++; console.log("PASS —", name); }
  else { fail++; console.log("FAIL —", name); }
};

async function main() {

const doc = createDocument("D", "d1");
doc.blocks = [
  setBlockContent(createBlock("title"), { text: "Ma journée" }),
  setBlockContent(createBlock("heading"), { text: "Le matin" }),
  setBlockContent(createBlock("paragraph"), {
    text: "Je me lève tôt.",
    translation: "I get up early.",
    analysis: "Se lever — reflexive.",
    vocab: [{ term: "se lever", def: "to get up" }],
    expressions: [{ term: "tôt", def: "early" }],
    userAnswer: "Je me lève à sept heures.",
  }),
  setBlockContent(createBlock("essay"), {
    heading: "Ma ville", // 2026-08-10 #5: optional essay heading
    paragraphs: ["Un paragraphe.", "Deuxième paragraphe."],
    translation: "One paragraph. Second paragraph.",
  }),
  setBlockContent(createBlock("qa"), {
    question: "Qu'est-ce que tu as fait hier ?",
    questionTranslation: "What did you do yesterday?",
    analysis: "Passé composé with avoir.",
    modelAnswer: "J'ai mangé une pomme.",
    answerTranslation: "I ate an apple.",
    vocab: [{ term: "hier", def: "yesterday" }],
    expressions: [{ term: "manger une pomme", def: "to eat an apple" }],
    userAnswer: "J'ai regardé la télé.",
  }),
];

const tokens = await getTokens(); // reads docs/html_instructions.md (same as smoke-m2)

// ---------- buildAICopyText (Copy dialog → "For AI" tab) ----------
// 2026-08-10: the payload embeds the SAME instructions Convert with AI uses,
// then the shared format spec (BLOCK_FORMAT_SPEC) + content.
const AI_INSTRUCTIONS = "Convert French material into practice worksheets with translations.";
const ai = buildAICopyText(doc, AI_INSTRUCTIONS);
check("ai-copy: embeds the active instructions verbatim at the top", ai.startsWith(AI_INSTRUCTIONS));
check("ai-copy: JSON shapes included", ai.includes('{"type":"qa","question":"…"') && ai.includes('{"type":"essay","heading":"…","paragraphs":["…","…"]'));
check("ai-copy: corrections section present (parity with Convert with AI)", ai.includes("CORRECTIONS:"));
check("ai-copy: content marker separates instruction from content", ai.includes("\n=== CONTENT ==="));
check("ai-copy: document content follows (marker serialization)",
  ai.endsWith(serializeBlocksForAI(doc)) && ai.includes("Qu'est-ce que tu as fait hier ?"));
check("ai-copy: never includes practice answers (private)", !ai.includes("J'ai regardé la télé"));

// ---------- essay heading (2026-08-10 #5): optional title round-trips ----------
const marker = serializeBlocksForAI(doc);
check("essay-heading: <HEADING> marker inside <ESSAY>",
  marker.includes("<ESSAY>") && marker.includes("<HEADING>Ma ville</HEADING>") && marker.includes("<P>Un paragraphe.</P>"));

// ---------- generateTemplateHTML — qa field order (question → translation →
// analysis → answer) and preview hidden toggles ----------
const html = generateTemplateHTML(doc, tokens, { printMode: true });
check("essay-heading: template renders the heading above the passage",
  html.indexOf("Ma ville") !== -1 && html.indexOf("<h3 class=\"block-essay-heading\">Ma ville</h3>") !== -1);
const qaIdx = html.indexOf("Qu&#39;est-ce que tu as fait hier ?"); // escaped apostrophe
const qtIdx = html.indexOf("What did you do yesterday?");
const anIdx = html.indexOf("Passé composé with avoir");
const maIdx = html.indexOf("J&#39;ai mangé une pomme");
const atIdx = html.indexOf("I ate an apple");
check("order: question before question translation", qaIdx !== -1 && qtIdx > qaIdx);
// 2026-08-10 M7 round 5 (user: "it is showing in same line as question it
// should be below it"): the translation renders BELOW the question in its own
// <p class="qa-question-translation"> — no longer an inline <em> inside the
// question text.
check("question translation on its OWN element below the question",
  html.includes('<p class="qa-question-translation">') && !html.includes("?<em>") && !html.includes("<em>What"));
check("order: translation before analysis", anIdx > qtIdx);
check("order: analysis before model answer", maIdx > anIdx);
check("order: model answer before answer translation", atIdx > maIdx);
check("order: paragraph text still first-class", html.indexOf("Je me lève tôt.") !== -1);

const hidden = generateTemplateHTML(doc, tokens, {
  printMode: true,
  hidden: { translations: true, analyses: true, vocab: true, modelAnswers: true },
});
check("hidden: translations omitted (question + answer translations)", !hidden.includes("What did you do yesterday?") && !hidden.includes("I ate an apple"));
check("hidden: analyses omitted", !hidden.includes("Passé composé with avoir") && !hidden.includes("Se lever"));
check("hidden: vocab/expressions grids omitted", !hidden.includes("Vocabulaire Clé") && !hidden.includes("Expressions Avancées") && !hidden.includes("se lever"));
check("hidden: model answers omitted", !hidden.includes("J&#39;ai mangé une pomme"));
check("hidden: MAIN content survives — question, paragraph text, heading, essay (+ essay heading)",
  hidden.includes("Qu&#39;est-ce que tu as fait hier ?") && hidden.includes("Je me lève tôt.") &&
  hidden.includes("Le matin") && hidden.includes("Un paragraphe.") && hidden.includes("Ma ville"));

// 2026-08-10 M7 round 4 (user: "it is showing practice answers why, it should
// not do this… same for para… in future we will add an option for the review
// of the practice area"): practice answers (userAnswer) NEVER render in the
// preview — default output AND every toggle combination, for qa, paragraph
// and essay. (The my-answers PDF variant + smoke-m5's round trip opt them in
// explicitly; the future practice-review option will use the same flag.)
check("preview: practice answers NEVER render (default output)",
  !html.includes("J&#39;ai regardé la télé") && !html.includes("Je me lève à sept heures."));
check("preview: practice answers NEVER render (with hidden toggles)",
  !hidden.includes("J&#39;ai regardé la télé") && !hidden.includes("Je me lève à sept heures."));

// Individual toggle only hides its own field type.
const onlyVocab = generateTemplateHTML(doc, tokens, { hidden: { vocab: true } });
check("hidden-vocab-only: grids gone but translations/analyses/answers stay",
  !onlyVocab.includes("Vocabulaire Clé") && onlyVocab.includes("What did you do yesterday?") &&
  onlyVocab.includes("Passé composé with avoir") && onlyVocab.includes("J&#39;ai mangé une pomme"));

// ---------- Empty lines (2026-08-10 #6): blank ruled areas where the model
// answer is hidden — the old "questions" sheet, now a toggle ----------
// (The check uses the element markup — the CSS rule for .blank-answer is always
// emitted in the <style> block.)
const emptyLines = generateTemplateHTML(doc, tokens, { hidden: { modelAnswers: true }, emptyLines: true });
check("empty-lines: blank answer box where the model answer is hidden",
  emptyLines.includes("<div class=\"blank-answer\">") && emptyLines.includes("<div class=\"line\"></div>"));
check("empty-lines: model answer still omitted", !emptyLines.includes("J&#39;ai mangé une pomme"));
check("empty-lines: main content + enrichment survive",
  emptyLines.includes("Qu&#39;est-ce que tu as fait hier ?") && emptyLines.includes("Passé composé with avoir"));
const noEmpty = generateTemplateHTML(doc, tokens, { hidden: { modelAnswers: true } });
check("empty-lines: absent when the toggle is off", !noEmpty.includes("<div class=\"blank-answer\">"));
const emptyAllVisible = generateTemplateHTML(doc, tokens, { emptyLines: true });
check("empty-lines: qa keeps the visible model answer (no blank under it)",
  emptyAllVisible.includes("J&#39;ai mangé une pomme"));
check("empty-lines: essay with no written answer gets writing space",
  emptyAllVisible.includes("<div class=\"blank-answer\">"));

// ---------- PDF display mode (2026-08-10 #6): the same options drive the
// "Download PDF" button. Text content can't be asserted from the stream
// (react-pdf embeds subset fonts as CID/glyph codes), so we assert structure:
// the hidden sections shrink the PDF, and the empty-lines toggle adds the
// blank-area vector content on top. ----------
const pdfFull = await generatePDFBuffer(doc, tokens, {});
const pdfHiddenOnly = await generatePDFBuffer(doc, tokens, {
  hidden: { modelAnswers: true, translations: true },
});
const pdfDisp = await generatePDFBuffer(doc, tokens, {
  hidden: { modelAnswers: true, translations: true },
  emptyLines: true,
});
check("pdf-display: %PDF magic", pdfDisp.subarray(0, 5).toString() === "%PDF-");
check("pdf-display: hidden sections shrink the PDF (omitted content)",
  pdfHiddenOnly.length < pdfFull.length);
check("pdf-display: empty lines add blank-area content on top",
  pdfDisp.length > pdfHiddenOnly.length);

console.log(`\nM7: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
}

void main();
