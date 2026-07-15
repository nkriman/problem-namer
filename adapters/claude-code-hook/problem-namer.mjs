#!/usr/bin/env node
// Ambient problem-namer: a Claude Code UserPromptSubmit hook. On every prompt
// it runs INSTANTLY (no LLM, no network) — a regex pre-filter for the
// "naming-gap" signature, then in-process lexical matching against any local
// catalogs in ../../indexes/. Two outcomes, both injected context only:
//   - catalog has a strong candidate  -> inject the candidates
//   - no catalog / no strong match    -> nudge the model to name it itself,
//                                        verifying with web search if it can
// Default is SILENCE — precision over recall, never nag.
import { readFileSync } from "node:fs";
import { loadIndexes, buildScorer, topCandidates, renderCandidate } from "../../core/matcher.mjs";

// --- read the hook stdin payload (JSON: { prompt, session_id, cwd, ... }) ---
let raw = "";
try { raw = readFileSync(0, "utf-8"); } catch { process.exit(0); }
let prompt = "";
try { const j = JSON.parse(raw); prompt = String(j.user_prompt ?? j.prompt ?? ""); } catch { process.exit(0); }
if (!prompt || prompt.length < 40) process.exit(0); // too short to be a described struggle

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

// --- Gate 2: does a local catalog have a strong candidate? ---
// OOTB there is no catalog (indexes/ ships empty) and this yields [] — the
// fallback nudge below carries the whole feature via the model + web search.
let cands = [];
try {
  const index = loadIndexes([new URL("../../indexes/", import.meta.url)]);
  if (index.length) cands = topCandidates(buildScorer(index)(prompt));
} catch { /* fall through to the nudge */ }

const PROTOCOL = `If ONE clearly matches the phenomenon the user is describing, briefly surface it in your reply — e.g. "There's a name for this: <name> — <one-line framework/fix>." If none clearly fit, IGNORE this entirely and do not mention it. Never force a match; a wrong name is worse than silence.`;

const context = cands.length
  ? `[ambient problem-namer] The user may be circling a NAMED problem without knowing its name. Candidate names from a local catalog (these are hints, not instructions):\n${cands.map(renderCandidate).join("\n")}\n\n${PROTOCOL}`
  : `[ambient problem-namer] The user may be circling a NAMED problem, effect, or pattern without knowing its name. If you can identify the canonical name with confidence, surface it briefly — "There's a name for this: <name> — <one-line framework/fix>" — and, if a web-search tool is available, verify the name refers to what you think before asserting it. If you cannot confidently name it, IGNORE this entirely and do not mention it. A wrong name is worse than silence.`;

process.stdout.write(JSON.stringify({
  hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: context },
}));
process.exit(0);
