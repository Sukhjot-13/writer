// M2 smoke test: Q&A HTML rendering (numbering, omission rules, vocab grids)
// + practice-mode PDF generation (blank answer areas).
import { generateTemplateHTML } from "../lib/html-template";
import { generatePDFBuffer } from "../lib/pdf";
import {
  getTokens,
  invalidateDesignTokensCache,
} from "../lib/design-tokens";
import type { Document } from "../lib/types";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => {
  if (cond) { pass++; console.log("PASS —", name); }
  else { fail++; console.log("FAIL —", name); }
};

const doc: Document = {
  id: "smoke-qa",
  title: "QA Smoke",
  ownerId: null,
  source: "editor",
  createdAt: "2026-08-10T00:00:00.000Z",
  updatedAt: "2026-08-10T00:00:00.000Z",
  tags: [],
  practice: { hideTranslations: false, hideModelAnswers: false },
  blocks: [
    { id: "b1", type: "heading", tags: [], content: { text: "Practice" } },
    {
      id: "b2", type: "qa", tags: ["french"],
      content: {
        question: "Qu'est-ce que tu as fait hier ?",
        questionTranslation: "What did you do yesterday?",
        grammarNote: "passé composé",
        responseLabel: "RÉPONSE",
        userAnswer: "J'ai mangé une pomme.",
        modelAnswer: "Je suis allé au cinéma.",
        answerTranslation: "I went to the cinema.",
        analysis: "Verbe aller au passé composé.",
        vocab: [
          { term: "hier", def: "yesterday" },
          { term: "manger", def: "to eat" },
        ],
        expressions: [{ term: "aller au cinéma", def: "to go to the movies" }],
      },
    },
    {
      id: "b3", type: "qa", tags: [],
      content: {
        question: "Deuxième question ?",
        questionTranslation: "Second question?",
        hideTranslation: true,
        modelAnswer: "Réponse cachée.",
        hideModelAnswer: true,
        userAnswer: "Ma réponse.",
        // Every qa block in this fixture carries the label; the checks verify
        // the GATING (item 8): it renders only where something is below it.
        responseLabel: "RÉPONSE",
      },
    },
    {
      id: "b4", type: "qa", tags: [],
      content: {
        question: "Troisième question — no user answer yet?",
        modelAnswer: "Réponse du modèle.",
        responseLabel: "RÉPONSE",
      },
    },
    {
      // 2026-08-13 (to-do item 8): a question with NO answer and no empty
      // lines must not render a lonely "RÉPONSE" label.
      id: "b5", type: "qa", tags: [],
      content: {
        question: "Question sans réponse ?",
        responseLabel: "RÉPONSE",
      },
    },
  ],
};

async function main() {
  invalidateDesignTokensCache();
  const tokens = await getTokens();

  // ---- HTML ----
  const html = generateTemplateHTML(doc, tokens);
  check("html has qa-block", html.includes('class="qa-block"'));
  check("numbering is sequential (1 then 2)", html.includes('class="qa-num">1</span>') && html.includes('class="qa-num">2</span>'));
  check("question translation rendered", html.includes("What did you do yesterday?"));
  check("grammar note rendered", html.includes("passé composé"));
  // 2026-08-13 (to-do item 8): quiet French headings lead the translation and
  // the grammar note (same style as "Analyse :").
  check("Traduction : label above question translation",
    html.includes("<strong>Traduction :</strong> What did you do yesterday?"));
  check("Grammaire : label above grammar note",
    html.includes("<strong>Grammaire :</strong> passé composé"));
  // 2026-08-13 (to-do item 8): the RÉPONSE label renders ONLY when there is
  // something to label — b2 + b4 have visible answers (2 labels); b3's answer
  // is hidden and b5 has no answer at all → no lonely labels.
  check("response label rendered", html.includes("RÉPONSE"));
  check("RÉPONSE only where an answer exists (no lonely label)",
    (html.match(/RÉPONSE/g) ?? []).length === 2);
  // Empty lines on → the blank ruled area is something to label too: b3's
  // hidden answer and b5's missing answer both get writing lines → 4 labels.
  const htmlBlank = generateTemplateHTML(doc, tokens, { hidden: {}, emptyLines: true });
  check("RÉPONSE shows with Empty lines on (labels the writing lines)",
    (htmlBlank.match(/RÉPONSE/g) ?? []).length === 4);
  check("user answer box with dashed class", html.includes("qa-user-answer"));
  check("model answer rendered", html.includes("Je suis allé au cinéma."));
  check("answer translation rendered", html.includes("I went to the cinema."));
  check("analysis rendered", html.includes("Analyse :"));
  check("two-col grid (vocab + expressions)", html.includes("qa-vocab-grid two-col"));
  check("vocab term bold class", html.includes("qa-vocab-term"));
  check("expr row present", html.includes("qa-expr-row"));
  check("wrapper classes + tag", html.includes("block block-qa tag-french"));
  // FR-36: hidden elements omitted entirely
  check("hidden translation OMITTED (b3)", !html.includes("Second question?"));
  check("hidden model answer OMITTED", !html.includes("Réponse cachée."));
  // 2026-08-10 M7 round 4 (user: "it is showing practice answers why, it
  // should not do this"): practice answers NEVER render in the preview HTML —
  // only the my-answers PDF variant and explicit showUserAnswers opt them in.
  check("practice answer of b3 NOT rendered (preview)", !html.includes("Ma réponse."));
  // XSS still safe
  check("escaped angle brackets", !html.includes("<script>"));

  // ---- PDF: normal ----
  const pdf = await generatePDFBuffer(doc, tokens, {});
  check("normal PDF %PDF magic", pdf.subarray(0, 5).toString() === "%PDF-");
  check("normal PDF size reasonable", pdf.length > 5000);

  // ---- PDF: practice variant (M6: "questions" / "my-answers" replace practice=true) ----
  const practicePdf = await generatePDFBuffer(doc, tokens, { variant: "questions" });
  check("practice PDF %PDF magic", practicePdf.subarray(0, 5).toString() === "%PDF-");
  // b4 has no user answer → practice replaces its model answer with a blank
  // ruled area (FR-49); translations/answers of b2/b3 omitted (FR-36).
  check("practice PDF generated (blank area path)", practicePdf.length > 4000);
  // b2 model answer must NOT appear in the practice PDF stream
  const practiceStream = practicePdf.toString("latin1");
  check("practice PDF omits model answers", !practiceStream.includes("cinéma") && !practiceStream.includes("modèle"));

  console.log(`\n== ${pass} passed, ${fail} failed ==`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
