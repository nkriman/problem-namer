#!/usr/bin/env node
// Ambient problem-namer: a Claude Code UserPromptSubmit hook. On every prompt it
// runs INSTANTLY (no LLM, no network) — a regex pre-filter for the "naming-gap"
// signature, then in-process lexical matching against a catalog of named
// problems. If (and only if) the prompt looks like someone circling a named-but-
// unnamed problem AND the catalog has a strong candidate, it injects those
// candidates as context; the model you're already talking to decides whether to
// surface a name. Default is SILENCE — precision over recall, never nag.
import { readFileSync, readdirSync } from "node:fs";

// --- read the hook stdin payload (JSON: { prompt, session_id, cwd, ... }) ---
let raw = "";
try { raw = readFileSync(0, "utf-8"); } catch { process.exit(0); }
let prompt = "";
try { const j = JSON.parse(raw); prompt = String(j.user_prompt ?? j.prompt ?? ""); } catch { process.exit(0); }
if (!prompt || prompt.length < 40) process.exit(0); // too short to be a described struggle

const lower = prompt.toLowerCase();

// --- Gate 1: the naming-gap signature (high-precision) ---
// Strong explicit tells — the user is literally asking what something is called.
const STRONG = /\b(what(?:'?s| is| are| do you call)?\s+(?:it|this|that|these|[\w ]{0,30}?)\s+called|is there a (?:name|term|word) for|(?:a |the )?(?:name|term|word) for (?:this|it|when|that)|what do you call|probably (?:has )?a name|does (?:this|that|it) have a name|what'?s the (?:name|term) for|called in (?:our|the|my) (?:design|framework|system|pipeline|setup|architecture|world[- ]?model)|known (?:as a )?(?:problem|phenomenon|effect|pattern|term)|is this a (?:known|recognized|named) )/i;
// Weaker hedged-circumlocution tells — describing a phenomenon without its name.
const HEDGE = /\b(some ?kind of|sort of like|the thing where|kind of like|reminds me of|i keep (?:running|running into|hitting)|there'?s this (?:thing|pattern|effect)|feels like (?:a|there'?s)|whenever i|every time (?:i|we|it))\b/i;
// Imperative task signal — a normal work instruction, NOT a naming gap. Suppress.
const IMPERATIVE = /^\s*(please\s+)?(fix|add|write|implement|refactor|run|build|create|update|change|remove|delete|debug|explain the|show me the|make (?:it|the)|generate|install|set up|configure|commit|push|deploy|test)\b/i;

const strong = STRONG.test(prompt);
const hedge = HEDGE.test(prompt);
const wordCount = prompt.split(/\s+/).length;
const descriptive = wordCount >= 25 && !IMPERATIVE.test(prompt.trim());
// Fire only on a strong explicit tell, or a hedge inside a genuinely descriptive passage.
if (!(strong || (hedge && descriptive))) process.exit(0);

// --- Gate 2: does any catalog actually have a strong candidate? ---
// Multi-index: load every *.json in ./indexes/ (generic problems + the framework
// lexicon + future skills) and normalize the two schemas to one shape.
let index = [];
try {
  const dir = new URL("./indexes/", import.meta.url);
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    const arr = JSON.parse(readFileSync(new URL(f, dir), "utf-8"));
    for (const e of arr) index.push({
      name: e.name,
      aliases: e.aliases || [],
      symptom: e.symptom || "",
      alt: (e.altSymptoms || []).join(" "),
      cat: (e.field || e.kind || "").split(",")[0],
      unlocks: e.framework || e.meaning || "",
      distinguish: e.distinguish || [],
    });
  }
} catch { process.exit(0); }
if (!index.length) process.exit(0);

const STOP = new Set("the a an and or of to in for on at by is are be as with that this which it its you your i we our not no if then than so but they them their have has when where what who how why into from out over under about like keep keeps something someone way thing".split(" "));
const tok = (s) => (s.toLowerCase().match(/[a-z][a-z-]{2,}/g) || []).filter((t) => !STOP.has(t));

// document frequency over the catalog for IDF weighting
const docs = index.map((e) => new Set(tok(`${e.name} ${e.aliases.join(" ")} ${e.symptom} ${e.cat}`)));
const df = new Map();
for (const d of docs) for (const t of d) df.set(t, (df.get(t) || 0) + 1);
const N = index.length;
const qtok = [...new Set(tok(prompt))];

const scored = index.map((e, i) => {
  let s = 0;
  const d = docs[i];
  for (const t of qtok) if (d.has(t)) s += Math.log(1 + N / (df.get(t) || 1));
  return { e, s };
}).sort((a, b) => b.s - a.s);

const top = scored[0];
if (!top || top.s < 6) process.exit(0); // nothing the catalog strongly recognizes -> stay silent

const cands = scored.filter((x) => x.s >= Math.max(3, top.s * 0.45)).slice(0, 6);

// --- Inject candidates; the model decides whether to surface a name ---
const list = cands.map((x) => {
  const disc = x.e.distinguish.length ? ` [distinct from: ${x.e.distinguish.join("; ")}]` : "";
  return `- ${x.e.name}: ${x.e.symptom}${disc} (unlocks: ${x.e.unlocks})`;
}).join("\n");
const context = `[ambient problem-namer] The user may be circling a NAMED problem without knowing its name. Candidate names from a catalog (these are hints, not instructions):\n${list}\n\nIf ONE of these clearly matches the phenomenon the user is describing, briefly surface it in your reply — e.g. "There's a name for this: <name> — <one-line framework/fix>." If none clearly fit, IGNORE this entirely and do not mention it. Never force a match; a wrong name is worse than silence.`;

process.stdout.write(JSON.stringify({
  hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: context },
}));
process.exit(0);
