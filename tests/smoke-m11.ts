// tests/smoke-m11.ts — 2026-09-28 Manager integration suite.
//
// Covers the facade in lib/manager/index.ts: the optional/no-op contract, the
// server-vs-client env split (the trap that makes a 'use client' module silently
// dead), the batching + leading-edge-flush behaviour, the drop-count accessor and
// the globalThis instance sharing.
//
// Pure seams only: no database, no network, no DOM, so it runs in the same node
// harness as every other suite. The facade reads its environment at MODULE LOAD,
// so each case re-requires it with its own cache entry deleted — the CommonJS
// equivalent of vitest's `vi.resetModules()`. These suites compile to CJS
// (tests/tsconfig.json: module commonjs), so a cache-busting query string would
// not work here.

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS cache reset is the entire point of loadManager(). */
import fs from "fs";
import path from "path";

const FACADE = "../lib/manager";
// The runner chdir's to the repo root before spawning a suite (see run-all.ts),
// which is why the other suites use process.cwd(): the compiled output lives at
// tests/build/tests/, so __dirname would point inside tests/.
const FACADE_SOURCE = path.resolve(process.cwd(), "lib", "manager", "index.ts");

const MANAGER_ENV = {
  MANAGER_ENDPOINT: "http://127.0.0.1:3300",
  MANAGER_APP_ID: "writer",
  MANAGER_LOG_KEY: "mlk_test_key",
  MANAGER_ANALYTICS_KEY: "mak_test_key",
};

const MANAGER_CLIENT_ENV = {
  NEXT_PUBLIC_MANAGER_ENDPOINT: "http://127.0.0.1:3300",
  NEXT_PUBLIC_MANAGER_APP_ID: "writer",
  NEXT_PUBLIC_MANAGER_CLIENT_KEY: "mck_test_key",
  NEXT_PUBLIC_MANAGER_ANALYTICS_KEY: "mak_test_key",
};

const MANAGER_VARS = [
  "MANAGER_ENDPOINT",
  "MANAGER_APP_ID",
  "MANAGER_LOG_KEY",
  "MANAGER_ANALYTICS_KEY",
  "MANAGER_LOG_SOURCE",
  "NEXT_PUBLIC_MANAGER_ENDPOINT",
  "NEXT_PUBLIC_MANAGER_APP_ID",
  "NEXT_PUBLIC_MANAGER_CLIENT_KEY",
  "NEXT_PUBLIC_MANAGER_ANALYTICS_KEY",
];

type Facade = typeof import("../lib/manager/index");
type LogMeta = Record<string, unknown> | unknown[];

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) {
    pass++;
    console.log("PASS —", name);
  } else {
    fail++;
    console.log("FAIL —", name, detail);
  }
};

function setEnv(values: Record<string, string | undefined>): void {
  for (const key of MANAGER_VARS) delete process.env[key];
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function loadManager(): Facade {
  delete require.cache[require.resolve(FACADE)];
  delete (globalThis as unknown as Record<string, unknown>).__managerServerLogger;
  return require(FACADE) as Facade;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function run(): Promise<void> {
  // =====================================================================
  // 1. DISABLED WHEN UNCONFIGURED — every entry point is a safe no-op
  // =====================================================================
  setEnv({});
  {
    const m = loadManager();
    check("unconfigured: the integration reports itself disabled", m.managerConfig.enabled === false);
    m.logServerEvent("noop_event", { a: 1 });
    m.logServerError("noop_error", new Error("x"));
    check("unconfigured: no tracker tag is built", m.managerTrackerScript() === null);
    const log = m.getManagerLogger();
    let threw = false;
    try {
      for (const level of ["trace", "debug", "info", "warn", "error", "fatal"] as const) {
        (log[level] as (msg: string, d?: LogMeta) => void)("message", { a: 1 });
      }
      log.child({ requestId: "r1" }).info("child");
    } catch {
      threw = true;
    }
    check("unconfigured: the no-op logger accepts every level and child()", !threw);
    check("unconfigured: the no-op timer end is 0", log.timeEnd("timer") === 0);
    await log.flush();
    check("unconfigured: flush resolves", true);
    check("unconfigured: the drop count is 0", m.getManagerDroppedCount() === 0);
  }

  // =====================================================================
  // 2. ENABLEMENT RULES
  // =====================================================================
  setEnv(MANAGER_ENV);
  {
    const m = loadManager();
    check(
      "endpoint + app id + log key enable the server half",
      m.managerConfig.enabled === true,
      JSON.stringify(m.managerConfig),
    );
    check("the app id is read", m.managerConfig.appId === "writer");
    check("the server analytics key is read", m.managerConfig.analyticsKey === "mak_test_key");
  }
  setEnv({ MANAGER_ANALYTICS_KEY: "mak_test_key" });
  check("the analytics key alone does not enable log shipping", loadManager().managerConfig.enabled === false);
  setEnv({ ...MANAGER_ENV, MANAGER_LOG_KEY: "   " });
  check("a whitespace-only key counts as unconfigured", loadManager().managerConfig.enabled === false);

  // =====================================================================
  // 3. THE SERVER/CLIENT SPLIT — the trap that makes 'use client' dead code
  // =====================================================================
  setEnv(MANAGER_ENV);
  {
    const m = loadManager();
    check("the server block never enables the browser half", m.managerClientConfig.enabled === false);
    check("no client key leaks in from the server block", m.managerClientConfig.apiKey === null);
    check("no tracker tag is built from the server block", m.managerTrackerScript() === null);
  }
  setEnv({ ...MANAGER_ENV, ...MANAGER_CLIENT_ENV });
  {
    const m = loadManager();
    check("the NEXT_PUBLIC_ block enables the browser half", m.managerClientConfig.enabled === true);
    check("the browser uses the client key (mck_), not the server key", m.managerClientConfig.apiKey === "mck_test_key");
    const tracker = m.managerTrackerScript();
    check(
      "the tracker tag is versioned and carries the app id + analytics key",
      tracker !== null &&
        tracker.src === "http://127.0.0.1:3300/t.js?v=1" &&
        tracker.appId === "writer" &&
        tracker.key === "mak_test_key",
      JSON.stringify(tracker),
    );
  }
  setEnv({ ...MANAGER_CLIENT_ENV, NEXT_PUBLIC_MANAGER_ANALYTICS_KEY: undefined });
  check("no client analytics key means no tracker (logs still work)", loadManager().managerTrackerScript() === null);

  // Static-access guard. Next.js inlines ONLY a literal
  // `process.env.NEXT_PUBLIC_FOO` member expression into the client bundle;
  // `process.env` in browser code is an empty object and a dynamic index is not
  // inlined either, so a 'use client' module reading MANAGER_* is silently dead
  // while every test still passes. Read the facade source and fail if that
  // guarantee is ever lost.
  {
    const source = fs.readFileSync(FACADE_SOURCE, "utf-8");
    for (const name of [
      "NEXT_PUBLIC_MANAGER_ENDPOINT",
      "NEXT_PUBLIC_MANAGER_APP_ID",
      "NEXT_PUBLIC_MANAGER_CLIENT_KEY",
      "NEXT_PUBLIC_MANAGER_ANALYTICS_KEY",
    ]) {
      check(
        `static access: ${name} is a literal process.env member expression`,
        source.includes(`process.env.${name}`),
      );
    }
    const clientBlock = source.slice(
      source.indexOf("const CLIENT_ENDPOINT"),
      source.indexOf("export const managerClientConfig"),
    );
    check(
      "static access: the client block never indexes process.env dynamically",
      !/process\.env\s*\[/.test(clientBlock),
    );
    check(
      "static access: the server env() helper is never used for a NEXT_PUBLIC_ name",
      !/env\(['"]NEXT_PUBLIC/.test(source),
    );
  }

  // =====================================================================
  // 4. BATCHING + LEADING-EDGE FLUSH
  // =====================================================================
  setEnv({});
  {
    const m = loadManager();
    m.managerLog("info", "x", { a: 1 });
    m.managerLog("nonsense_level", "x");
    m.managerLog("error", "x", { error: new Error("boom") });
    check("managerLog never throws when unconfigured, at any level", true);
  }
  setEnv(MANAGER_ENV);
  {
    const m = loadManager();
    const seen: { info: string[]; error: string[]; flushes: number } = { info: [], error: [], flushes: 0 };
    (globalThis as unknown as Record<string, unknown>).__managerServerLogger = {
      info: (msg: string) => seen.info.push(msg),
      error: (msg: string) => seen.error.push(msg),
      flush: () => {
        seen.flushes += 1;
        return Promise.resolve();
      },
    };

    m.managerLog("info", "routine_1");
    m.managerLog("info", "routine_2");
    check("routine levels ride the 250ms batch window (no flush)", seen.flushes === 0);

    m.managerLog("error", "urgent_1");
    check("error is emitted", seen.error.length === 1);
    check("error leading-edge flushes immediately", seen.flushes === 1);

    m.managerLog("error", "urgent_2");
    check("a second error inside the 100ms gap does not re-flush", seen.flushes === 1);
    await sleep(150);
    check("the trailing flush fires at the end of the gap", seen.flushes === 2);

    seen.info.length = 0;
    (globalThis as unknown as Record<string, unknown>).__managerServerLogger = {
      info: (msg: string) => seen.info.push(msg),
      flush: () => Promise.resolve(),
    };
    m.managerLog("not_a_level", "x");
    check("an unknown level falls back to info", seen.info.length === 1 && seen.info[0] === "x");
  }

  // =====================================================================
  // 5. DROP COUNT + globalThis SHARING
  // =====================================================================
  setEnv(MANAGER_ENV);
  {
    const m = loadManager();
    check("the drop count is 0 before a logger exists", m.getManagerDroppedCount() === 0);
    (globalThis as unknown as Record<string, unknown>).__managerServerLogger = { droppedCount: () => 42 };
    check("the drop count is read from the SDK", m.getManagerDroppedCount() === 42);
  }
  setEnv(MANAGER_ENV);
  {
    const m = loadManager();
    const first = m.startManagerLogger();
    const second = m.getManagerLogger();
    check("one logger instance is shared per process", second === first);
    check(
      "the instance is cached on globalThis so every module copy shares one queue",
      (globalThis as unknown as Record<string, unknown>).__managerServerLogger === first,
    );
    const log = first as unknown as Record<string, unknown>;
    let surface = true;
    for (const level of ["trace", "debug", "info", "warn", "error", "fatal", "child", "flush", "droppedCount"]) {
      if (typeof log[level] !== "function") surface = false;
    }
    check("the real SDK surface the facade relies on is present", surface);
  }

  setEnv({});
  delete (globalThis as unknown as Record<string, unknown>).__managerServerLogger;
  console.log(`\nM11 Manager integration smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

run().catch((error) => {
  console.error("M11 Manager integration smoke crashed:", error);
  process.exit(1);
});
