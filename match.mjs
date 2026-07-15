#!/usr/bin/env node
// Standalone matcher: describe your problem, get candidate canonical names.
// No LLM, no network — the same lexical scorer every adapter uses, as a CLI.
// Uses your catalogs in ./indexes/ if present, else the example catalog.
//
//   node match.mjs "two services keep retrying each other and traffic melts down"
//   echo "long description..." | node match.mjs
import { readFileSync } from "node:fs";
import { loadIndexes, buildScorer } from "./core/matcher.mjs";

const argText = process.argv.slice(2).join(" ").trim();
const text = argText || readFileSync(0, "utf-8").trim();
if (!text) {
  console.error('usage: node match.mjs "a description of the situation you are stuck on"');
  process.exit(1);
}

const index = loadIndexes([
  new URL("./indexes/", import.meta.url),
  new URL("./examples/", import.meta.url),
]);
if (!index.length) {
  console.error("No catalogs found in ./indexes/ or ./examples/.");
  process.exit(1);
}

const scored = buildScorer(index)(text).slice(0, 5).filter((x) => x.s > 0);
if (!scored.length) {
  console.log("No candidates. (The catalog may simply not cover this — silence beats a wrong name.)");
  process.exit(0);
}
for (const { e, s } of scored) {
  console.log(`\n${e.name}  [${e.cat}]  (score ${s.toFixed(1)})`);
  console.log(`  symptom: ${e.symptom}`);
  if (e.unlocks) console.log(`  unlocks: ${e.unlocks}`);
  if (e.distinguish.length) console.log(`  distinct from: ${e.distinguish.join("; ")}`);
}
