// tests/alias-hook.js — resolve Next.js "@/*" path aliases at runtime so the
// smoke tests can require app modules with their real import statements.
// "@/" maps to the compiled mirror under tests/build/ (outDir + rootDir "..").
// Used via: node --require tests/alias-hook.js <compiled test>
"use strict";
const Module = require("module");
const path = require("path");

const BUILD_ROOT = path.resolve(__dirname, "build");
const originalResolve = Module._resolveFilename;

Module._resolveFilename = function (request, ...args) {
  if (request.startsWith("@/")) {
    request = path.join(BUILD_ROOT, request.slice(2));
  }
  return originalResolve.call(this, request, ...args);
};
