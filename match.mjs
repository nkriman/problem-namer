#!/usr/bin/env node
// Standalone matcher: describe your problem, get candidate canonical names.
// No LLM, no network — the same lexical scorer the hook uses, as a CLI.
//
//   node match.mjs "two services keep retrying each other and traffic melts down"
//   echo "long description..." | node match.mjs
import { readFileSync, readdirSync } from "node:fs";

const argText = process.argv.slice(2).join(" ").trim();
const text = argText || readFileSync(0, "utf-8").trim();
if (!text) {
  console.error('usage: node match.mjs "a description of the situation you are stuck on"');
  process.exit(1);
}

// Load every *.json in ./indexes/ and normalize the two schemas to one shape.
const index = [];
const dir = new URL("./indexes/", import.meta.url);
for (const f of readdirSync(dir)) {
  if (!f.endsWith(".json")) continue;
  for (const e of JSON.parse(readFileSync(new URL(f, dir), "utf-8"))) {
    index.push({
      name: e.name,
      aliases: e.aliases || [],
      symptom: e.symptom || "",
      cat: (e.field || e.kind || "").split(",")[0],
      unlocks: e.framework || e.meaning || "",
      distinguish: e.distinguish || [],
    });
  }
}

const STOP = new Set("the a an and or of to in for on at by is are be as with that this which it its you your i we our not no if then than so but they them their have has when where what who how why into from out over under about like keep keeps something someone way thing".split(" "));
const tok = (s) => (s.toLowerCase().match(/[a-z][a-z-]{2,}/g) || []).filter((t) => !STOP.has(t));

const docs = index.map((e) => new Set(tok(`${e.name} ${e.aliases.join(" ")} ${e.symptom} ${e.cat}`)));
const df = new Map();
for (const d of docs) for (const t of d) df.set(t, (df.get(t) || 0) + 1);
const N = index.length;
const qtok = [...new Set(tok(text))];

const scored = index
  .map((e, i) => {
    let s = 0;
    for (const t of qtok) if (docs[i].has(t)) s += Math.log(1 + N / (df.get(t) || 1));
    return { e, s };
  })
  .sort((a, b) => b.s - a.s)
  .slice(0, 5)
  .filter((x) => x.s > 0);

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
