// tests/run-all.ts — run EVERY smoke suite (M2–M9) in one go.
//
// 2026-08-13 (user request: "make sure to make a file that runs all the test
// as when you run each and every test 1 by 1 it burns a lot of tokken… if any
// test fail we can jsut check the output or run only that test alone"). Each
// suite is a pure-seam node script that prints PASS/FAIL lines and exits 0/1.
//
//   cd tests && npx tsc -p tsconfig.json          # compile once
//   node --require <abs>/tests/alias-hook.js tests/build/tests/run-all.js
//   node tests/build/tests/run-all.js m7          # run only suite m7
//
// Suites are spawned as CHILD PROCESSES: a crash in one cannot take down the
// others, and the runner reports per-suite pass/fail/crash with their output.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { existsSync } from "node:fs";

const SUITES = [
  "smoke-m2", // HTML template + PDF renderer (the two must never drift)
  "smoke-m3", // prompts, questions, copy text, paste sniff, presets
  "smoke-m4", // instructions + storage (auto-sync, snapshots)
  "smoke-m5", // parse-back round trip, ZIP writer, backup naming
  "smoke-m6", // save flow, preview, document API
  "smoke-m7", // design tokens, suggestions
  "smoke-m8", // library folders
  "smoke-m9", // test generator (random path)
];

// The compiled suites live next to this file (tests/build/tests/). The alias
// hook itself is NOT compiled — it stays at tests/alias-hook.js (two levels up).
const HERE = __dirname;
const HOOK = path.resolve(HERE, "..", "..", "alias-hook.js");

const only = process.argv[2];
const suites = only ? SUITES.filter((s) => s.includes(only.replace(/^smoke-/, ""))) : SUITES;
if (only && suites.length === 0) {
  console.error(`No suite matches "${only}". Known suites: ${SUITES.map((s) => s.replace("smoke-", "m")).join(", ")}`);
  process.exit(2);
}

console.log(`Running ${suites.length} suite${suites.length === 1 ? "" : "s"}: ${suites.map((s) => s.replace("smoke-", "")).join(", ")}\n`);

interface Result {
  suite: string;
  ok: boolean;
  crashed: boolean;
  output: string;
}

const results: Result[] = [];
for (const suite of suites) {
  const script = path.join(HERE, `${suite}.js`);
  if (!existsSync(script)) {
    console.error(`MISSING ${script} — compile first: cd tests && npx tsc -p tsconfig.json`);
    results.push({ suite, ok: false, crashed: true, output: "" });
    continue;
  }
  const res = spawnSync(process.execPath, ["--require", HOOK, script], { encoding: "utf8" });
  const crashed = res.signal !== null || res.status === null || res.status > 1;
  results.push({ suite, ok: res.status === 0, crashed, output: `${res.stdout ?? ""}${res.stderr ?? ""}` });
}

// Per-suite output (a failing suite's PASS/FAIL lines show exactly what to fix).
console.log("─".repeat(70));
for (const r of results) {
  console.log(`\n### ${r.suite} — ${r.ok ? "PASS" : r.crashed ? "CRASH" : "FAIL"}`);
  if (r.output.trim()) console.log(r.output.trimEnd());
}
console.log("\n" + "─".repeat(70));

// Summary + aggregate exit code.
let passed = 0;
let failed = 0;
for (const r of results) {
  if (r.ok) passed++;
  else {
    failed++;
    console.log(`✗ ${r.suite}`);
  }
}
console.log(`\n${passed}/${results.length} suites passed`);
process.exit(failed > 0 ? 1 : 0);
