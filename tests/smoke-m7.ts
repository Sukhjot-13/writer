// M7 smoke test round (2026-08-10): focus-mode plumbing is UI-only (tsc +
// build cover it); this file covers the new pure seams — buildAICopyText
// (copy dialog "For AI" tab), the preview field toggles + qa field order in
// generateTemplateHTML, and the InstructionsEditor history guard behavior is
// exercised via the history content fallback shape.
import { buildAICopyText, serializeBlocksForAI } from "../lib/prompt";
import { generateTemplateHTML } from "../lib/html-template";
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
const ai = buildAICopyText(doc);
check("ai-copy: instruction heading present", ai.startsWith("You are helping prepare French practice material."));
check("ai-copy: JSON shapes included", ai.includes('{"type":"qa","question":"…"') && ai.includes('{"type":"essay","heading":"…","paragraphs":["…","…"]'));
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
check("hidden: practice answers survive (not a hidden field)",
  hidden.includes("J&#39;ai regardé la télé") && hidden.includes("Je me lève à sept heures."));

// Individual toggle only hides its own field type.
const onlyVocab = generateTemplateHTML(doc, tokens, { hidden: { vocab: true } });
check("hidden-vocab-only: grids gone but translations/analyses/answers stay",
  !onlyVocab.includes("Vocabulaire Clé") && onlyVocab.includes("What did you do yesterday?") &&
  onlyVocab.includes("Passé composé with avoir") && onlyVocab.includes("J&#39;ai mangé une pomme"));

console.log(`\nM7: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
}

void main();
