# problem-namer

**Notices when you're describing a named problem without knowing its name, and tells you what it's called.**

When you're stuck on something you can't name, you can't search for it, can't
read about it, and can't tell whether an answer about it is right. The moment
someone says *"there's a name for this: it's the winner's curse"* — or the N+1
query problem, or Simpson's paradox — you stop being stuck in a unique
personal mystery and inherit decades of prior art. Naming converts an
unsearchable description into a searchable term.

This repo is that move, packaged as **one core plus thin adapters** — pick
the integration that fits how your agent runs:

| Adapter | Who notices the naming gap | What it is |
|---|---|---|
| [`adapters/claude-code-hook/`](adapters/claude-code-hook/problem-namer.mjs) | **The harness** (push — fires even when nobody thought to ask) | Claude Code `UserPromptSubmit` hook: instant regex + lexical gates, injects candidates or a name-it-yourself nudge |
| [`adapters/mcp/`](adapters/mcp/server.mjs) | **The model**, mid-task (pull) | MCP server (stdio, zero deps): `name_problem` tool with explicit no-match, catalogs as resources, `name-this` prompt |
| [`adapters/skill/`](adapters/skill/problem-namer/SKILL.md) | **The model**, from an ambient description | The surfacing protocol as an Agent Skill — find, verify, discriminate, or stay silent |
| [`match.mjs`](match.mjs) | **You**, explicitly | Zero-dependency CLI: describe the situation, get candidates. No LLM, no network |

The unknown-unknown case — you don't know a name exists, so you'd never ask —
is why the push adapter (the hook) is the headline. The others cover the
cases where the model or the user does notice.

## The pipeline

Every adapter is a thin entry point into the same five conceptual stages:

```mermaid
flowchart TD
    U["Someone describes a situation they can't name"] --> D{"1 · DETECT — is this a naming gap?<br/>hook: harness regex (push) · skill: model (ambient) · CLI + prompt: user (explicit)"}
    D -->|"no signal"| Q0(["silence — never nag"])
    D -->|"signal"| LOOKUP
    subgraph LOOKUP["2 · LOOK UP — cheapest tier first"]
        direction LR
        T1["model memory<br/>free — famous problems"] --> T2["local catalog — indexes/<br/>instant — your coined vocabulary"] --> T3["web search<br/>slow — everything else"]
    end
    LOOKUP --> V{"3 · VERIFY — does the name exist,<br/>and does its established meaning fit THIS symptom?"}
    V -->|"top candidates too close"| DQ["4 · DISCRIMINATE<br/>ask the one observable question that separates them"]
    DQ --> V
    V -->|"no confident fit"| NIL(["no-match is an answer:<br/>silence, or 'no established name' — never stretch a match"])
    V -->|"one clear fit"| S["5 · SURFACE<br/>'There's a name for this: X'<br/>+ what knowing it unlocks + distinct-from note"]
    T3 -. "a successful web naming becomes a candidate catalog entry" .-> T2
```

None of these stages is new — each one enacts a classical idea from
ontology and knowledge organization, which is worth knowing because those
fields already solved the failure modes:

| Stage | The ontology idea it enacts |
|---|---|
| **1 · Detect** | The naming gap is a missing *instance → concept* link: a lived situation that belongs to a class whose label the describer doesn't hold. Library science's fix is the **entry vocabulary** — index the words novices actually use, not the expert's terms. That's why `symptom` is written from *before* you know the name. |
| **2 · Look up** | **Entity linking / ontology alignment**: generate candidate canonical concepts for a free-text mention. The catalog is a micro-ontology in [SKOS](https://www.w3.org/TR/skos-primer/) terms — `name` ≈ `prefLabel`, `aliases` ≈ `altLabel`, `symptom` ≈ the entry vocabulary that points at the concept. |
| **3 · Verify** | Classification by **intension, not surface similarity**: an instance belongs to a concept because it satisfies the concept's defining conditions, not because their words overlap. Lexical overlap (stage 2) proposes; only intension confirms. |
| **4 · Discriminate** | **Genus + differentia**, operationalized as a biologist's dichotomous key: sibling concepts are told apart by one observable property (livelock vs. deadlock: is the CPU busy or idle?). `distinguish` is a disjointness axiom in prose. |
| **5 · Surface / NIL** | A label is a **handle into the concept's connected knowledge** — `framework` carries the concept's relations to canonical analyses and fixes, which is the actual payoff of naming. And NIL respects the **open-world assumption**: the ontology lacking a match is information ("no established name found"), never license to force one. |
| **↺ Capture** | **Ontology population**: concepts enter the catalog from usage — a successful web-search naming is a candidate entry, so the ontology grows as a byproduct of solving. |

## Out of the box: no catalog, web search

By default the framework ships **zero knowledge**. The hook detects the
naming-gap signature and nudges the model you're already talking to: *name it
if you confidently can, verify with web search before asserting, stay silent
otherwise*. Slow and costs a search — but infinitely flexible, and the model
plus the web already covers most famous named problems.

`indexes/` is where local catalogs go, and it ships empty. Adding one buys
the fast, free, offline tier — three tiers, cheapest first:

1. **Model memory** — free; covers well-known problems.
2. **Local catalog** (`indexes/*.json`) — instant, offline; the only tier
   that works for vocabulary the model *cannot* know (your team's coined
   terms — see below, it's where the measured lift is biggest).
3. **Web search** — slow, costs money, covers everything else; also the
   verification step for the other two.

A naming the web-search tier produces is a candidate entry for your local
catalog — the catalog is a memoization layer that grows as a byproduct of use.

## Try it (no setup, no LLM)

```
node match.mjs "our dashboard metric became the target everyone optimizes and it keeps climbing while the actual quality it was a proxy for gets worse"
```

```
Goodhart's Law  [statistics]  (score 13.5)
  symptom: A number that used to be a reliable indicator becomes an official target, and soon people
  optimize it directly—so it climbs while the underlying thing it was supposed to reflect stagnates
  or worsens.
  unlocks: 'When a measure becomes a target, it ceases to be a good measure': the proxy decouples
  from the true objective; the fix is multiple/rotating metrics, guardrail measures, and rewarding
  the outcome rather than the proxy.
```

The CLI falls back to [`examples/problems.json`](examples/problems.json) — a
189-entry catalog of named problems across software, distributed systems,
statistics, economics, ML, and operations — when `indexes/` is empty.

## Install the adapters

**Claude Code hook** — clone the repo anywhere, then in `~/.claude/settings.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [{ "type": "command", "command": "node /path/to/problem-namer/adapters/claude-code-hook/problem-namer.mjs" }] }
    ]
  }
}
```

Runs in single-digit milliseconds on every prompt, exits silently on anything
unexpected. Two precision gates before it says a word: a regex for the
naming-gap signature ("is there a name for...", hedged circumlocution inside
a descriptive passage — never ordinary work instructions), then, if a local
catalog exists, an IDF-scored match that must clear a threshold. The model
makes the final call; the injected instruction ends with *"never force a
match; a wrong name is worse than silence."*

**MCP server** — works in any MCP client:

```
claude mcp add problem-namer -- node /path/to/problem-namer/adapters/mcp/server.mjs
```

Exposes the `name_problem` tool (ranked candidates with distinguishing notes,
or an **explicit no-match** — NIL is a real outcome, never a forced pick),
every catalog as a readable resource, and a user-invokable `name-this` prompt.

**Skill** — copy `adapters/skill/problem-namer/` into your skills directory
(e.g. `~/.claude/skills/`). It carries the surfacing protocol: cheapest
source first, verify before asserting, ask the discriminating question when
two candidates are close, silence over a stretched match.

**Enable the local catalog tier** for the hook, MCP server, and eval:

```
cp examples/problems.json indexes/
```

## The catalog format

```json
{
  "field": "distributed systems and concurrency",
  "name": "Livelock",
  "aliases": ["live-lock"],
  "symptom": "Threads are busy and CPU is pegged, yet no work advances; each keeps reacting to the others and retrying...",
  "framework": "Introduce asymmetry or randomness: jittered backoff, priorities, a single arbiter...",
  "distinguish": ["Deadlock: threads are blocked and idle, not busy"]
}
```

- **`symptom`** is the retrieval surface, deliberately written the way a
  person describes it *before* they know the name. Naming the concept in its
  own symptom would defeat the point.
- **`framework`** is what knowing the name unlocks — the canonical analysis
  or fix, so a surfaced name arrives with its payoff.
- **`distinguish`** separates confusable neighbors (deadlock vs. livelock,
  Simpson's paradox vs. confounding) at selection time.

Drop any number of `*.json` files into `indexes/` — every adapter loads them
all. `core/matcher.mjs` (the loader + IDF scorer all adapters share) is ~80
lines if you want to port the pattern elsewhere.

## Build an index for your own vocabulary

The measured lift (below) is largest not on famous problems but on
**vocabulary neither the model nor the web can know**: your team's internal
coined terms, your architecture's named failure modes. A model can often name
Goodhart's law from memory; it cannot name a concept that exists only in your
design docs — and web search can't help there either. This is the case the
local catalog tier exists for.

The recipe that worked for us:

1. Walk your internal docs and extract every deliberately coined term.
2. For each, write the `symptom` as a person would describe it **without**
   the term (this is the step that matters — have someone or something
   rewrite each definition as a lived situation).
3. Add `distinguish` notes between entries that keep colliding.
4. Check retrieval with `match.mjs` using paraphrases, not the original
   definitions.

## Does it actually help?

Paired evaluation of the **catalog tier**: the same model names the same
scenario twice — RAW (from memory) vs. +INDEX (scan the catalog, select the
matching entry). Scenarios are written symptom-first and never contain the
name. Runs below used a deliberately small model (`claude-haiku-4.5`); the
eval runner is provider-neutral (any OpenAI-compatible endpoint).

| benchmark | n | RAW | +catalog | helped / hurt | McNemar p |
|---|---|---|---|---|---|
| famous problems (dev) | 48 | 70% | 89% | 11 / 2 | — |
| famous problems (holdout) | 32 | 78% | 90% | 6 / 2 | — |
| famous problems (pooled) | 80 | 74% | 90% | 17 / 4 | ≈ 0.007 |
| private project vocabulary | 54 | 22% | 62% | 23 / 1 | < 0.001 |

Honest caveats:

- **These numbers describe the catalog tier, not the web-search default** —
  the default path (detection + model + web search) has not been benchmarked
  the same way yet. What the table shows is that a catalog helps exactly
  where the knowledge isn't already in the model: on famous problems a
  strong model is near ceiling without help; the +40pt jump is on coined
  vocabulary the model has never seen (that benchmark is a private lexicon,
  so it isn't included here — the build recipe above is). In a sibling
  experiment on a knowledge domain the model already covered well, the same
  mechanism moved nothing.
- **Hurt cases are real** (4/80 on famous problems): a plausible-but-wrong
  catalog pick can displace a correct from-memory answer. This is why every
  adapter is precision-gated, the injected instructions say to stay silent
  unless one entry clearly fits, and the MCP tool returns an explicit
  no-match instead of the closest entry.

Reproduce (uses `indexes/` if populated, else the example catalog):

```
PN_API_KEY=... PN_MODEL=gpt-4o-mini node eval/run.mjs --split=holdout
```

## License

MIT
