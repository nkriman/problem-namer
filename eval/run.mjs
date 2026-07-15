#!/usr/bin/env node
// Paired eval: can a model name the problem better WITH the catalog than from
// memory alone? Provider-neutral — talks to any OpenAI-compatible
// /chat/completions endpoint.
//
//   PN_API_KEY=...            required
//   PN_BASE_URL=...           default https://api.openai.com/v1
//   PN_MODEL=...              default gpt-4o-mini
//
//   node eval/run.mjs --split=holdout --n=32 --conc=4
//
// Each case runs twice: RAW (name it from memory) and +INDEX (scan the
// catalog's table of contents, select the matching entry). Reports paired
// accuracy and a McNemar exact p on the discordant cases.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";

const arg = (n, d) => process.argv.slice(2).find((x) => x.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const BASE = process.env.PN_BASE_URL ?? "https://api.openai.com/v1";
const KEY = process.env.PN_API_KEY;
const MODEL = process.env.PN_MODEL ?? "gpt-4o-mini";
if (!KEY) { console.error("set PN_API_KEY (and optionally PN_BASE_URL, PN_MODEL)"); process.exit(1); }

async function chat(system, user) {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [...(system ? [{ role: "system", content: system }] : []), { role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).choices[0].message.content ?? "";
}

// --- load index (all files in ../indexes/) and benchmark ---
const index = [];
const dir = new URL("../indexes/", import.meta.url);
for (const f of readdirSync(dir)) {
  if (!f.endsWith(".json")) continue;
  for (const e of JSON.parse(readFileSync(new URL(f, dir), "utf-8"))) {
    index.push({ name: e.name, aliases: e.aliases || [], cat: (e.field || e.kind || "").split(",")[0], symptom: e.symptom || "", distinguish: e.distinguish || [] });
  }
}
const toc = index.map((e, i) => {
  const disc = e.distinguish.length ? ` [${e.distinguish.join("; ")}]` : "";
  return `${i}. [${e.cat}] ${e.name} — ${e.symptom}${disc}`;
}).join("\n");

const split = arg("split", "dev");
const cases = JSON.parse(readFileSync(new URL(arg("bench", "benchmark-problems.json"), new URL("./", import.meta.url)), "utf-8"))
  .filter((c) => c.split === split)
  .slice(0, Number(arg("n", "48")));

// --- grading: gold (or an alias) and the answer share a normalized substring ---
const norm = (s) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
const matches = (answer, gold, aliases) => {
  const a = norm(answer);
  if (!a) return false;
  return [gold, ...aliases].some((cand) => {
    const c = norm(cand);
    return c.length >= 3 && (a.includes(c) || (c.length >= 6 && c.includes(a) && a.length >= 6));
  });
};
const lastLine = (text, tag) => {
  const m = [...text.matchAll(new RegExp(`${tag}\\s*[:\\-]\\s*(.+)`, "gi"))].pop();
  if (m) return m[1].trim().replace(/^["'*]+|["'*.]+$/g, "");
  const lines = text.trim().split("\n").filter((l) => l.trim());
  return (lines[lines.length - 1] ?? "").trim();
};

console.error(`[eval] ${MODEL} on ${cases.length} ${split} cases, RAW vs +INDEX (${index.length}-entry catalog)`);
let rawC = 0, idxC = 0, helped = 0, hurt = 0, done = 0;
const log = [];
let i = 0;
await Promise.all(Array.from({ length: Math.min(Number(arg("conc", "4")), cases.length) }, async () => {
  while (i < cases.length) {
    const c = cases[i++];
    try {
      const [raw, sel] = await Promise.all([
        chat("", c.problemStatement),
        chat(
          "You match an inarticulate scenario to the canonical named problem in a catalog. End with exactly one line: PICK: <entry number>",
          `${c.problemStatement}\n\n---\nHere is a catalog of named problems. Find the ONE entry whose phenomenon best matches the scenario. If none fit, pick the closest.\n\nCATALOG:\n${toc}`
        ),
      ]);
      const rawName = lastLine(raw, "NAME");
      const pick = Number.parseInt(lastLine(sel, "PICK"), 10);
      const idxName = index[pick]?.name ?? "";
      const rOk = matches(rawName, c.goldName, c.aliases);
      const iOk = matches(idxName, c.goldName, c.aliases);
      if (rOk) rawC++;
      if (iOk) idxC++;
      if (!rOk && iOk) helped++;
      if (rOk && !iOk) hurt++;
      done++;
      log.push({ id: c.id, gold: c.goldName, rawName, idxName, rOk, iOk });
    } catch (err) {
      console.error(`[eval] errored: ${String(err?.message ?? err).slice(0, 80)}`);
    }
  }
}));

if (!done) { console.error("[eval] no cases completed — check endpoint/key"); process.exit(1); }
const pct = (x) => `${((100 * x) / done).toFixed(0)}%`;
// McNemar exact: two-sided binomial on the discordant pairs
const nd = helped + hurt, lo = Math.min(helped, hurt);
const logC = (nn, r) => { let x = 0; for (let k = 0; k < r; k++) x += Math.log(nn - k) - Math.log(k + 1); return x; };
let cum = 0;
for (let k = 0; k <= lo; k++) cum += Math.exp(logC(nd, k) - nd * Math.LN2);
const p = Math.min(1, 2 * cum);

console.log(`\n=== problem-naming lift (${MODEL}, ${split}, n=${done}) ===`);
console.log(`RAW (from memory):  ${rawC}/${done} = ${pct(rawC)}`);
console.log(`+ INDEX (catalog):  ${idxC}/${done} = ${pct(idxC)}  (${idxC - rawC >= 0 ? "+" : ""}${(((idxC - rawC) / done) * 100).toFixed(0)} pts)`);
console.log(`discordant: HELPED ${helped}, HURT ${hurt}; McNemar exact p=${p.toFixed(3)}`);
writeFileSync(new URL(`./run-${split}.json`, import.meta.url), JSON.stringify(log, null, 2));
