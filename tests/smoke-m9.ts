// M9 smoke test (2026-08-13, to-do item 5): the Test generator's random path.
//
// buildTestDocument (lib/test-generator.ts) picks qa/essay blocks from the
// chosen documents and assembles a fresh "Test — <date>" document — no AI.
// Covers: count selection + clamping to the pool, no duplicate picks, the
// random-average defaults (3–5 questions, 1–2 essays), practice answers never
// carrying over, essay content preserved, and the title format.

import { createDocument, createBlock, setBlockContent } from "../lib/types";
import type { Block, Document, QaContent } from "../lib/types";
import { documentSchema } from "../lib/schemas"; // 2026-08-13: opensInPractice round-trip
import {
  buildTestDocument,
  testTitle,
  defaultQuestionCount,
  defaultEssayCount,
} from "../lib/test-generator";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => {
  if (cond) { pass++; console.log("PASS —", name); }
  else { fail++; console.log("FAIL —", name); }
};

function qa(id: string, question: string, userAnswer?: string): Block {
  return setBlockContent(createBlock("qa", id), {
    question,
    userAnswer,
    modelAnswer: `Réponse à "${question}"`,
    responseLabel: "RÉPONSE",
  } satisfies Partial<QaContent>);
}

function essay(id: string, heading: string, paragraphs: string[], userAnswer?: string): Block {
  return setBlockContent(createBlock("essay", id), { heading, paragraphs, userAnswer });
}

function sourceDocs(): Document[] {
  const docA = createDocument("Ma journée");
  docA.blocks = [
    setBlockContent(createBlock("title", "t1"), { text: "Ma journée" }),
    qa("q1", "Qu'as-tu fait hier ?", "Hier, je suis allé au cinéma."),
    qa("q2", "Où es-tu allé en vacances ?"),
    qa("q3", "Quel temps fait-il aujourd'hui ?", "Il pleut."),
    essay("e1", "Mes vacances", ["Premier été.", "Deuxième été."], "Mon essai."),
    essay("e2", "Mon quartier", ["Un paragraphe."]),
  ];
  const docB = createDocument("Conjugaison");
  docB.blocks = [
    setBlockContent(createBlock("paragraph", "p1"), { text: "Raconte ta semaine." }),
    qa("q4", "Qu'est-ce que tu aimes manger ?", "Les pâtes."),
  ];
  return [docA, docB];
}

async function run() {
  // ---------- testTitle ----------
  check("testTitle: 'Test — 13 Aug' from a known date",
    testTitle(new Date("2026-08-13T12:00:00")) === "Test — 13 Aug");
  check("testTitle: default date still has the prefix", testTitle().startsWith("Test — "));

  // ---------- defaults (random-average rule) ----------
  check("defaultQuestionCount: 3–5", defaultQuestionCount() >= 3 && defaultQuestionCount() <= 5);
  check("defaultEssayCount: 1–2", defaultEssayCount() >= 1 && defaultEssayCount() <= 2);

  // ---------- explicit counts ----------
  const docs = sourceDocs();
  const test = buildTestDocument(docs, { questions: 2, essays: 2 }); // both essays → id-checkable
  check("buildTestDocument: title is the test title", test.title.startsWith("Test — "));
  check("buildTestDocument: 2 qa + 2 essays picked", test.blocks.filter((b) => b.type === "qa").length === 2 &&
    test.blocks.filter((b) => b.type === "essay").length === 2);
  check("buildTestDocument: no duplicate picks", new Set(test.blocks.map((b) => b.id)).size === 4);
  const pickedQa = test.blocks.filter((b) => b.type === "qa");
  check("buildTestDocument: practice answers stripped from qa",
    pickedQa.every((b) => b.content.userAnswer === undefined));
  check("buildTestDocument: model answers kept (the test checks against them)",
    pickedQa.every((b) => Boolean(b.content.modelAnswer)));
  const e1 = test.blocks.find((b) => b.id === "e1");
  const e2 = test.blocks.find((b) => b.id === "e2");
  check("buildTestDocument: both essays picked (e1 + e2)", Boolean(e1) && Boolean(e2));
  check("buildTestDocument: essay heading + paragraphs preserved",
    e1?.type === "essay" && e1.content.heading === "Mes vacances" &&
    e1.content.paragraphs.length === 2 && e1.content.paragraphs[1] === "Deuxième été." &&
    e2?.type === "essay" && e2.content.heading === "Mon quartier" && e2.content.paragraphs.length === 1);
  check("buildTestDocument: essay practice answer stripped",
    e1?.type === "essay" && e1.content.userAnswer === undefined && e2?.type === "essay" && e2.content.userAnswer === undefined);
  check("buildTestDocument: no title/paragraph blocks carried over",
    test.blocks.every((b) => b.type === "qa" || b.type === "essay"));

  // ---------- clamping + defaults when counts exceed the pool ----------
  const clamped = buildTestDocument([docs[0]], {}); // pool: 3 qa + 2 essays
  const cQa = clamped.blocks.filter((b) => b.type === "qa").length;
  const cEssays = clamped.blocks.filter((b) => b.type === "essay").length;
  check("buildTestDocument: default counts within the random-average rule",
    cQa >= 3 && cQa <= 5 && cEssays >= 1 && cEssays <= 2);
  check("buildTestDocument: defaults never exceed the pool", cQa <= 3 && cEssays <= 2);
  const tiny = buildTestDocument([docs[1]], { questions: 5, essays: 2 }); // pool: 1 qa + 0 essays
  check("buildTestDocument: counts clamped to what exists",
    tiny.blocks.filter((b) => b.type === "qa").length === 1 && tiny.blocks.filter((b) => b.type === "essay").length === 0);

  // ---------- opensInPractice (2026-08-13): tests open in practice mode,
  // answers hidden until Check; normal documents never carry the flag ----------
  check("buildTestDocument: opensInPractice set on every path",
    test.opensInPractice === true && clamped.opensInPractice === true && tiny.opensInPractice === true);
  check("createDocument: normal documents carry no opensInPractice flag",
    createDocument("Normal").opensInPractice === undefined);
  check("documentSchema: opensInPractice round-trips through validation",
    documentSchema.parse(test).opensInPractice === true);

  // ---------- blank questions never picked ----------
  const blank = createDocument("Blanc");
  blank.blocks = [qa("q5", "  "), qa("q6", "Question réelle")];
  const fromBlank = buildTestDocument([blank], { questions: 2, essays: 1 });
  check("buildTestDocument: blank questions skipped",
    fromBlank.blocks.length === 1 && fromBlank.blocks[0].type === "qa" && fromBlank.blocks[0].content.question === "Question réelle");

  // ---------- no usable content → empty test document ----------
  const empty = createDocument("Vide");
  empty.blocks = [setBlockContent(createBlock("paragraph", "p"), { text: "pas de contenu" })];
  const fromEmpty = buildTestDocument([empty], { questions: 3, essays: 1 });
  check("buildTestDocument: no qa/essay content → no blocks", fromEmpty.blocks.length === 0);

  console.log(`\nM9 smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error("M9 smoke crashed:", e);
  process.exit(1);
});
