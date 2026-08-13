// M3 smoke test: AI prompt assembly, question parsing/structuring, HTML
// validation, selective copy text, import-html title extraction.
import { stripMarkdownFences } from "../lib/ai";
import { validateAndWrapHtml } from "../lib/validate";
import {
  splitQuestions,
  questionsToQaBlocks,
  buildStructuringUserPrompt,
  parseStructuredQaResponse,
} from "../lib/questions";
import { buildAIPrompt, serializeBlocksForAI, serializePlainText } from "../lib/prompt";
import { createDocument, setBlockContent, createBlock } from "../lib/types";
import type { QaContent } from "../lib/types";
import {
  buildCopyText,
  DEFAULT_SELECTION,
  PRESET_QUESTIONS_ONLY,
  PRESET_WORKSHEET_NO_ANSWERS,
} from "../components/CopyDialog";
import { titleFromHtml } from "../app/api/documents/import-html/route";
import { sniffPasteKind } from "../lib/paste-sniff"; // to-do item 9

let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => {
  if (cond) { pass++; console.log("PASS —", name); }
  else { fail++; console.log("FAIL —", name); }
};

// ---------- lib/ai.ts ----------
check("stripMarkdownFences removes ```html fences", stripMarkdownFences("```html\n<p>x</p>\n```") === "<p>x</p>");
check("stripMarkdownFences leaves plain text alone", stripMarkdownFences("just text") === "just text");

// ---------- lib/validate.ts (FR-10) ----------
const full = "<!DOCTYPE html>\n<html><head><title>T</title></head><body><p>ok</p></body></html>";
check("validateAndWrapHtml passes full documents through", validateAndWrapHtml(full) === full);
const frag = validateAndWrapHtml("<h1>Bonjour</h1><p>monde</p>");
check("fragment wrapped with DOCTYPE", frag.startsWith("<!DOCTYPE html>"));
check("fragment title from first h1", frag.includes("<title>Bonjour</title>"));
check("fragment body content preserved", frag.includes("<p>monde</p>"));
const fenced = validateAndWrapHtml("```html\n<p>fenced</p>\n```");
check("fenced fragment wrapped", fenced.includes("<p>fenced</p>") && fenced.startsWith("<!DOCTYPE html>"));

// ---------- lib/questions.ts ----------
check("splitQuestions: numbered '1.'", JSON.stringify(splitQuestions("1. A\n2. B")) === JSON.stringify(["A", "B"]));
check("splitQuestions: numbered '1)'", JSON.stringify(splitQuestions("1) A\n2) B")) === JSON.stringify(["A", "B"]));
check("splitQuestions: bullets", JSON.stringify(splitQuestions("- A\n- B\n- C")) === JSON.stringify(["A", "B", "C"]));
check("splitQuestions: continuation lines merge",
  JSON.stringify(splitQuestions("1. A\ncontinued\n2. B")) === JSON.stringify(["A continued", "B"]));
check("splitQuestions: blank-line separated", splitQuestions("First\n\nSecond").length === 2);
const qaBlocks = questionsToQaBlocks(["Q1 ?", "Q2 ?"]);
check("questionsToQaBlocks: two qa blocks", qaBlocks.length === 2);
check("questionsToQaBlocks: question + RÉPONSE label",
  qaBlocks[0].content.question === "Q1 ?" && qaBlocks[0].content.responseLabel === "RÉPONSE");
check("buildStructuringUserPrompt: numbered list + JSON instruction",
  buildStructuringUserPrompt(["A", "B"]).includes("2. B") && buildStructuringUserPrompt(["A"]).includes("JSON array"));

const aiJson = `Here is the result:
\`\`\`json
[
  {"question": "Q1 ?", "questionTranslation": "T1", "grammarNote": "g", "modelAnswer": "M1", "vocab": [{"term": "mot", "def": "word"}], "expressions": [{"term": "expr", "def": "phrase"}]}
]
\`\`\`
`;
const structured = parseStructuredQaResponse(aiJson);
check("parseStructuredQaResponse: tolerant of fences + prose", structured.length === 1 && structured[0].question === "Q1 ?");
check("parseStructuredQaResponse: maps vocab/expressions",
  structured[0].vocab?.[0].term === "mot" && structured[0].expressions?.[0].def === "phrase");
check("parseStructuredQaResponse: garbage → empty", parseStructuredQaResponse("no json here").length === 0);

// ---------- lib/prompt.ts (FR-12/39) ----------
const doc = createDocument("Mon week-end");
doc.blocks = [
  setBlockContent(createBlock("title"), { text: "Mon week-end" }),
  setBlockContent(createBlock("paragraph"), { text: "Raconte ta semaine." }),
  setBlockContent(createBlock("qa"), {
    question: "Qu'est-ce que tu as fait hier ?",
    questionTranslation: "What did you do yesterday?",
    grammarNote: "Passé composé.",
    responseLabel: "RÉPONSE",
    userAnswer: "Je suis allé au cinéma.",
    modelAnswer: "Hier, je suis allé au cinéma.",
    answerTranslation: "Yesterday I went to the cinema.",
    analysis: "Passé composé avec être.",
    vocab: [{ term: "hier", def: "yesterday" }],
    expressions: [{ term: "avoir l'air", def: "to seem" }],
  } satisfies QaContent),
];

const { system, user } = buildAIPrompt(doc, "SYSTEM RULES");
check("buildAIPrompt: system = instructions verbatim", system === "SYSTEM RULES");
check("buildAIPrompt: user has <TITLE> markers", user.includes("<TITLE>Mon week-end</TITLE>"));
check("buildAIPrompt: user has <QA> markers + HIDE flags",
  user.includes("<QA>") && user.includes("HIDE_TRANSLATION: false") && user.includes("VOCAB: hier|yesterday"));
check("buildAIPrompt: no GOAL line by default", !user.startsWith("GOAL:"));
const withGoal = buildAIPrompt(doc, "RULES", "Make it about Paris");
check("buildAIPrompt: GOAL line when goal passed", withGoal.user.startsWith("GOAL: Make it about Paris"));
// M6: the user prompt now demands the JSON block array (editable structured
// blocks), and practice answers are private — never serialized anywhere.
check("buildAIPrompt: JSON blocks demand present",
  user.includes("Return ONLY a JSON array of block objects") && user.includes("Never invent an answer"));
check("buildAIPrompt: user answer never serialized (M6)", !user.includes("USER_ANSWER:"));
check("serializeBlocksForAI: <PARAGRAPH> + <SEPARATOR> + <QA> order",
  serializeBlocksForAI(doc).includes("<PARAGRAPH>Raconte ta semaine.</PARAGRAPH>"));
const plain = serializePlainText(doc);
check("serializePlainText: question + user + model answer",
  plain.includes("Q: Qu'est-ce que tu as fait hier ?") &&
  plain.includes("My answer: Je suis allé au cinéma.") &&
  plain.includes("Answer: Hier, je suis allé au cinéma."));

// ---------- components/CopyDialog.tsx — buildCopyText (FR-50) ----------
const share = buildCopyText(doc, DEFAULT_SELECTION);
check("buildCopyText: numbering preserved (1.)", share.includes("1. Qu'est-ce que tu as fait hier ?"));
check("buildCopyText: defaults exclude translations", !share.includes("What did you do yesterday?") &&
  !share.includes("Traduction de la question :") && !share.includes("Traduction de la réponse :"));
check("buildCopyText: defaults exclude model answers", !share.includes("Réponse :"));
check("buildCopyText: includes practice answer with 'Ma réponse :' label",
  share.includes("Ma réponse : Je suis allé au cinéma."));
check("buildCopyText: grammar note has French heading", share.includes("Grammaire : Passé composé."));
check("buildCopyText: includes analysis + vocab + expressions",
  share.includes("Analyse :") && share.includes("Vocabulaire : hier : yesterday") && share.includes("Expressions :"));
const shareAll = buildCopyText(doc, { ...DEFAULT_SELECTION, modelAnswers: true, translations: true });
check("buildCopyText: all-on includes translation + model answer",
  shareAll.includes("Traduction de la question : What did you do yesterday?") &&
  shareAll.includes("Réponse : Hier, je suis allé au cinéma.") &&
  shareAll.includes("Traduction de la réponse : Yesterday I went to the cinema."));
const shareNoQa = buildCopyText(doc, { ...DEFAULT_SELECTION, questions: false, userAnswers: true, analysis: false, vocab: false, grammarNotes: false });
check("buildCopyText: numbering survives a partial selection",
  shareNoQa.includes("1. Ma réponse : Je suis allé au cinéma.") && !shareNoQa.includes("1. Qu'est-ce que tu as fait hier ?"));

// ---------- to-do item 9: copy presets (pure constants → buildCopyText) ----------
const worksheet = buildCopyText(doc, PRESET_WORKSHEET_NO_ANSWERS);
check("preset worksheet: question + translation + grammar + analysis + vocab",
  worksheet.includes("1. Qu'est-ce que tu as fait hier ?") &&
  worksheet.includes("Traduction de la question : What did you do yesterday?") &&
  worksheet.includes("Grammaire : Passé composé.") &&
  worksheet.includes("Analyse :") &&
  worksheet.includes("Vocabulaire :"));
check("preset worksheet: NO model answer", !worksheet.includes("Réponse :"));
check("preset worksheet: NO practice answer", !worksheet.includes("Ma réponse :"));
const questionsOnly = buildCopyText(doc, PRESET_QUESTIONS_ONLY);
check("preset questions-only: the numbered question only",
  questionsOnly === "1. Qu'est-ce que tu as fait hier ?");
check("preset questions-only: no translations/answers/vocab",
  !questionsOnly.includes("Traduction") && !questionsOnly.includes("Réponse :") && !questionsOnly.includes("Vocabulaire"));

// ---------- to-do item 9: smart paste kind sniffing (lib/paste-sniff.ts) ----------
check("sniffPasteKind: '[' → blocks", sniffPasteKind('[\n  {"type": "qa"}') === "blocks");
check("sniffPasteKind: '<' → html", sniffPasteKind("<html><body>") === "html");
check("sniffPasteKind: plain list → questions", sniffPasteKind("1. Qu'est-ce que tu as fait hier ?") === "questions");
check("sniffPasteKind: leading whitespace ignored", sniffPasteKind("  <p>hi</p>") === "html");
check("sniffPasteKind: empty → questions", sniffPasteKind("") === "questions");

// ---------- app/api/documents/import-html — titleFromHtml (FR-40) ----------
check("titleFromHtml: <title> tag wins",
  titleFromHtml("<html><head><title>Ma Page</title></head><body></body></html>") === "Ma Page");
check("titleFromHtml: falls back to first <h1>",
  titleFromHtml("<body><h1>Premier Titre</h1><h1>Second</h1></body>") === "Premier Titre");
check("titleFromHtml: null when no title", titleFromHtml("<p>rien</p>") === null);

console.log(`\nM3 smoke: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
