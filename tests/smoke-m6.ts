// M6 smoke test round 2 (2026-08-10): AI corrections (suggestions), the
// corrections prompt demand, PDF page-number labels, suggestions round-trip
// through the document schema.
import { parseStructuredBlocksResponse } from "../lib/structuring";
import { buildAIPrompt, serializeBlocksForAI } from "../lib/prompt";
import {
  applySuggestion,
  dismissSuggestion,
  visibleSuggestions,
} from "../lib/suggestions";
import { pageNumberLabel } from "../lib/pdf-labels";
import { documentSchema } from "../lib/schemas";
import { createBlock, setBlockContent, createDocument } from "../lib/types";
import type { QaContent } from "../lib/types";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => {
  if (cond) { pass++; console.log("PASS —", name); }
  else { fail++; console.log("FAIL —", name); }
};

// ---------- lib/structuring.ts — suggestions parsing ----------
const rawWithSuggestions = `[
  {"type":"qa","question":"Qu'est-ce que tu aime faire ?","modelAnswer":"J'aime mangé du pain frait.",
   "suggestions":[
     {"kind":"spelling","field":"question","original":"aime faire","suggestion":"aimes faire","reason":"subject tu"},
     {"field":"modelAnswer","original":"mangé","suggestion":"manger"},
     {"kind":"punctuation","field":"modelAnswer","original":"frait","suggestion":"frais","reason":"missing accent"}
   ]},
  {"type":"paragraph","text":"Un paragraphe correct."}
]`;
const structured = parseStructuredBlocksResponse(rawWithSuggestions);
const qa = structured.find((b) => b.type === "qa");
check("suggestions: qa block parsed with suggestions", qa?.type === "qa" && Array.isArray((qa.content as QaContent).suggestions));
const sugs = (qa?.content as QaContent).suggestions ?? [];
check("suggestions: 3 suggestions preserved", sugs.length === 3);
check("suggestions: ids assigned (uuid-ish)",
  sugs.every((s) => typeof s.id === "string" && s.id.length >= 16) && new Set(sugs.map((s) => s.id)).size === 3);
check("suggestions: kind defaults to spelling", sugs[1].kind === "spelling");
check("suggestions: explicit kinds kept", sugs[0].kind === "spelling" && sugs[2].kind === "punctuation");
check("suggestions: reason optional", sugs[1].reason === undefined && sugs[0].reason === "subject tu");

// One malformed suggestion must never kill the whole qa block (tolerant parse).
const rawMalformed = `[
  {"type":"qa","question":"Q ?","modelAnswer":"A.",
   "suggestions":[{"field":"modelAnswer"}]},
  {"type":"qa","question":"Q2 ?"}
]`;
const tolerant = parseStructuredBlocksResponse(rawMalformed);
check("suggestions: malformed suggestion object → list dropped, qa survives",
  tolerant.length === 2 && tolerant[0].type === "qa" && !(tolerant[0].content as QaContent).suggestions);

// Empty entries dropped; cap of 10 applied.
const rawTrash = `[
  {"type":"qa","question":"Q ?","modelAnswer":"A.","suggestions":[
    {"field":"modelAnswer","original":"  ","suggestion":"x"},
    {"field":"modelAnswer","original":"a","suggestion":""},
    {"field":"modelAnswer","original":"o1","suggestion":"n1"},
    {"field":"modelAnswer","original":"o2","suggestion":"n2"},
    {"field":"modelAnswer","original":"o3","suggestion":"n3"},
    {"field":"modelAnswer","original":"o4","suggestion":"n4"},
    {"field":"modelAnswer","original":"o5","suggestion":"n5"},
    {"field":"modelAnswer","original":"o6","suggestion":"n6"},
    {"field":"modelAnswer","original":"o7","suggestion":"n7"},
    {"field":"modelAnswer","original":"o8","suggestion":"n8"},
    {"field":"modelAnswer","original":"o9","suggestion":"n9"},
    {"field":"modelAnswer","original":"o10","suggestion":"n10"},
    {"field":"modelAnswer","original":"o11","suggestion":"n11"}
  ]}
]`;
const capped = parseStructuredBlocksResponse(rawTrash)[0].content as QaContent;
check("suggestions: empty original/suggestion dropped", capped.suggestions!.length === 10);
check("suggestions: capped at 10", !capped.suggestions!.some((s) => s.original === "o11"));

// ---------- lib/prompt.ts — corrections demand ----------
const doc = createDocument("D", "d1");
const qaBlock = setBlockContent(createBlock("qa"), {
  question: "Q ?",
  modelAnswer: "A.",
  suggestions: [{ id: "s1", kind: "spelling", field: "modelAnswer", original: "A.", suggestion: "A !" }],
});
doc.blocks = [createBlock("title"), qaBlock];
const { user } = buildAIPrompt(doc, "RULES");
check("prompt: JSON demand includes the suggestions shape", user.includes('"suggestions"'));
check("prompt: corrections rule present", user.includes("CORRECTIONS") && user.includes("NEVER rewrite the text") && user.includes("French spacing"));
check("prompt: never-serialize — suggestions absent from serialized blocks",
  !serializeBlocksForAI(doc).includes("A !") && !serializeBlocksForAI(doc).includes("spelling"));

// ---------- lib/suggestions.ts — apply / dismiss / visible ----------
const c0: QaContent = {
  question: "Q ?",
  modelAnswer: "Je suis trist, mais j'ai mangé du pain frait.",
  suggestions: [
    { id: "s1", kind: "grammar", field: "modelAnswer", original: "trist,", suggestion: "triste," },
    { id: "s2", kind: "punctuation", field: "modelAnswer", original: "du pain frait.", suggestion: "du pain frais." },
    { id: "s3", kind: "spelling", field: "modelAnswer", original: "frait", suggestion: "frais" },
  ],
};

// Apply s3 ("frait" → "frais"): ONLY s3 changes text; overlapping s2 ("du pain
// frait.") is now stale and removed; disjoint s1 stays.
const afterS3 = applySuggestion(c0, c0.suggestions![2]);
check("apply: only the selected suggestion changed the text",
  afterS3.modelAnswer === "Je suis trist, mais j'ai mangé du pain frais.");
check("apply: selected row removed", !afterS3.suggestions!.some((s) => s.id === "s3"));
check("apply: overlapping stale row removed", !afterS3.suggestions!.some((s) => s.id === "s2"));
check("apply: disjoint rows kept", afterS3.suggestions!.some((s) => s.id === "s1"));

// First occurrence only: "frait frait" → "frais frait".
const twice: QaContent = {
  question: "Q ?",
  modelAnswer: "frait frait",
  suggestions: [{ id: "s", kind: "spelling", field: "modelAnswer", original: "frait", suggestion: "frais" }],
};
check("apply: replaces FIRST occurrence only",
  applySuggestion(twice, twice.suggestions![0]).modelAnswer === "frais frait");

// Stale original → dismiss-only, text untouched.
const stale: QaContent = {
  question: "Q ?",
  modelAnswer: "Something else entirely.",
  suggestions: [{ id: "s", kind: "spelling", field: "modelAnswer", original: "old text", suggestion: "new text" }],
};
const afterStale = applySuggestion(stale, stale.suggestions![0]);
check("apply: stale original → dismissed, text untouched",
  afterStale.modelAnswer === "Something else entirely." && !afterStale.suggestions!.some((s) => s.id === "s"));

// Dismiss by id — content mutation, stays gone.
const afterDismiss = dismissSuggestion(c0, "s1");
check("dismiss: removes only the given id", !afterDismiss.suggestions!.some((s) => s.id === "s1") && afterDismiss.suggestions!.length === 2);

// visibleSuggestions — cosmetic filter on current text: the user manually
// fixed the "pain frais" error; s2 and s3 (which target that span) disappear,
// s1 ("trist," still present) stays.
const edited = { ...c0, modelAnswer: "Je suis trist, mais j'ai mangé du pain frais." };
const visEdited = visibleSuggestions(edited);
check("visible: stale suggestions hidden, matching shown",
  visEdited.length === 1 && visEdited[0].id === "s1");
check("visible: question-field suggestion matches question text", (() => {
  const q: QaContent = {
    question: "Qu'est-ce que tu aime faire ?",
    suggestions: [{ id: "s", kind: "spelling", field: "question", original: "aime faire", suggestion: "aimes faire" }],
  };
  return visibleSuggestions(q).length === 1;
})());

// ---------- lib/schemas.ts — suggestions survive the document round-trip ----------
const roundDoc = createDocument("R", "r1");
roundDoc.blocks = [setBlockContent(createBlock("qa"), {
  question: "Q ?",
  modelAnswer: "A.",
  suggestions: [{ id: "s1", kind: "grammar", field: "modelAnswer", original: "A.", suggestion: "A !" }],
})];
const roundTrip = documentSchema.safeParse(roundDoc);
check("schema: suggestions survive round-trip",
  roundTrip.success && (roundTrip.data.blocks[0].content as QaContent).suggestions!.length === 1);

// ---------- lib/pdf-labels.ts ----------
check("pdf-labels: 1/7", pageNumberLabel(1, 7) === "1/7");
check("pdf-labels: 12/12", pageNumberLabel(12, 12) === "12/12");

console.log(`\nM6 round 2: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
