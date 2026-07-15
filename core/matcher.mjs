// The shared core: load symptom-first catalogs and lexically match a
// description against them. No LLM, no network, no dependencies. Every
// adapter (CLI, hook, MCP server) uses exactly this logic, so a description
// ranks the same everywhere.
import { readFileSync, readdirSync } from "node:fs";

// Load every *.json catalog in the given directories (later dirs only used if
// earlier ones yielded nothing — callers pass [indexes/, examples/] to make
// the example catalog a fallback, not an addition). Normalizes the two entry
// schemas (field/framework and kind/meaning) to one shape.
export function loadIndexes(dirUrls) {
  for (const dir of dirUrls) {
    const entries = [];
    let files = [];
    try { files = readdirSync(dir); } catch { continue; }
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      try {
        for (const e of JSON.parse(readFileSync(new URL(f, dir), "utf-8"))) {
          entries.push({
            name: e.name,
            aliases: e.aliases || [],
            symptom: e.symptom || "",
            alt: (e.altSymptoms || []).join(" "),
            cat: (e.field || e.kind || "").split(",")[0],
            unlocks: e.framework || e.meaning || "",
            distinguish: e.distinguish || [],
          });
        }
      } catch { /* skip unparseable file, keep the rest */ }
    }
    if (entries.length) return entries;
  }
  return [];
}

const STOP = new Set("the a an and or of to in for on at by is are be as with that this which it its you your i we our not no if then than so but they them their have has when where what who how why into from out over under about like keep keeps something someone way thing".split(" "));
const tok = (s) => (s.toLowerCase().match(/[a-z][a-z-]{2,}/g) || []).filter((t) => !STOP.has(t));

// IDF-weighted token overlap between the query and each entry's retrieval
// surface (name + aliases + symptom + category).
export function buildScorer(index) {
  const docs = index.map((e) => new Set(tok(`${e.name} ${e.aliases.join(" ")} ${e.symptom} ${e.cat}`)));
  const df = new Map();
  for (const d of docs) for (const t of d) df.set(t, (df.get(t) || 0) + 1);
  const N = index.length;
  return (query) => {
    const qtok = [...new Set(tok(query))];
    return index
      .map((e, i) => {
        let s = 0;
        for (const t of qtok) if (docs[i].has(t)) s += Math.log(1 + N / (df.get(t) || 1));
        return { e, s };
      })
      .sort((a, b) => b.s - a.s);
  };
}

// Precision gate: a strong top hit, then everything within ratio of it.
// Returns [] when the catalog has nothing it strongly recognizes — the
// caller decides what silence means (CLI: say so; hook: fall back to the
// search nudge; MCP: return an explicit no-match).
export function topCandidates(scored, { min = 6, ratio = 0.45, max = 6 } = {}) {
  const top = scored[0];
  if (!top || top.s < min) return [];
  return scored.filter((x) => x.s >= Math.max(3, top.s * ratio)).slice(0, max);
}

// One candidate, rendered for injection into a model's context.
export function renderCandidate({ e }) {
  const disc = e.distinguish.length ? ` [distinct from: ${e.distinguish.join("; ")}]` : "";
  return `- ${e.name}: ${e.symptom}${disc} (unlocks: ${e.unlocks})`;
}
