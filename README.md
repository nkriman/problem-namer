# problem-namer

**A catalog of named problems, and an ambient hook that notices when you're describing one without knowing its name.**

When you're stuck on something you can't name, you can't search for it, can't
read about it, and can't tell whether an answer about it is right. The moment
someone says *"there's a name for this: it's the winner's curse"* — or the N+1
query problem, or Simpson's paradox — you stop being stuck in a unique
personal mystery and inherit decades of prior art. Naming converts an
unsearchable description into a searchable term.

This repo is that move, packaged:

- **`indexes/problems.json`** — a catalog of 189 named problems, effects, and
  laws across software, distributed systems, statistics, economics, ML,
  operations, and more. Each entry is written **symptom-first**: it describes
  what the situation feels like from the inside, before you know the name.
- **`match.mjs`** — a zero-dependency CLI: describe your situation, get
  candidate names. No LLM, no network.
- **`problem-namer.mjs`** — an ambient hook (reference integration: Claude
  Code `UserPromptSubmit`; the pattern ports to any chat harness). It watches
  prompts for the *naming-gap signature*, and when the catalog has a strong
  candidate, injects it as context so the model you're already talking to can
  say "there's a name for this." Default is silence.
- **`eval/`** — a provider-neutral paired benchmark measuring whether the
  catalog actually improves naming accuracy over the model's memory.

## Try it

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

Pipe in something longer:

```
pbpaste | node match.mjs
```

## The ambient hook

The interesting failure mode isn't asking a bad question — it's *circling* a
named problem in 200 words because you don't know the 3-word name. The hook
targets exactly that:

1. **Gate 1 — naming-gap signature** (regex, instant): fires on explicit tells
   ("is there a name for…", "what's this called") or hedged circumlocution
   ("some kind of…", "the thing where…") inside a genuinely descriptive
   passage. Ordinary work instructions ("fix the build") never trigger it.
2. **Gate 2 — catalog match** (in-process lexical IDF scoring, instant): only
   proceeds if some entry scores well above the noise floor.
3. **Injection, not interruption**: candidates are added as context with the
   instruction *"if ONE clearly matches, surface it briefly; if none fit,
   ignore this entirely."* The model — not the regex — makes the final call.

Both gates err toward silence. A wrong name is worse than no name: it sends
the person off to read about the wrong problem with false confidence.

### Install (Claude Code)

Clone the repo anywhere, then add to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          { "type": "command", "command": "node /path/to/problem-namer/problem-namer.mjs" }
        ]
      }
    ]
  }
}
```

The hook resolves `indexes/` relative to its own location, runs in
single-digit milliseconds, and exits silently on anything unexpected.

### Other harnesses

The hook is ~90 lines with no dependencies. Any system that supports
prompt-time context injection (middleware, a system-prompt preamble, an MCP
resource) can use the same two-gate → inject-candidates pattern; the catalog
format is the portable part.

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

Drop any number of `*.json` files into `indexes/` — the CLI, hook, and eval
load them all.

## Build an index for your own vocabulary

The measured lift (below) is largest not on famous problems but on
**vocabulary the model cannot already know**: your team's internal coined
terms, your architecture's named failure modes, your domain's jargon. A model
can often name Goodhart's law from memory; it cannot name a concept that
exists only in your design docs.

The recipe that worked for us:

1. Walk your internal docs and extract every deliberately coined term.
2. For each, write the `symptom` as a person would describe it **without**
   the term (this is the step that matters — have someone or something
   rewrite each definition as a lived situation).
3. Add `distinguish` notes between entries that keep colliding.
4. Check retrieval with `match.mjs` using paraphrases, not the original
   definitions.

## Does it actually help?

Paired evaluation: the same model names the same scenario twice — RAW (from
memory) vs. +INDEX (scan the catalog's table of contents, select the matching
entry). Scenarios are written symptom-first and never contain the name.
Runs below used a deliberately small model (`claude-haiku-4.5`); the eval
runner is provider-neutral (any OpenAI-compatible endpoint).

| benchmark | n | RAW | +catalog | helped / hurt | McNemar p |
|---|---|---|---|---|---|
| famous problems (dev) | 48 | 70% | 89% | 11 / 2 | — |
| famous problems (holdout) | 32 | 78% | 90% | 6 / 2 | — |
| famous problems (pooled) | 80 | 74% | 90% | 17 / 4 | ≈ 0.007 |
| private project vocabulary | 54 | 22% | 62% | 23 / 1 | < 0.001 |

Honest caveats:

- **The lift lives exactly where the knowledge isn't already in the model.**
  On famous problems a strong model is near ceiling without help; the +38pt
  jump is on coined vocabulary the model has never seen (that benchmark is a
  private lexicon, so it isn't included here — the build recipe above is).
  In a sibling experiment on a knowledge domain the model already covered
  well, the same mechanism moved nothing. A catalog is a supplement for
  missing knowledge, not a general enhancer.
- **Hurt cases are real** (4/80 on famous problems): a plausible-but-wrong
  catalog pick can displace a correct from-memory answer. This is why the
  ambient hook is precision-gated and the injected instruction says to stay
  silent unless one entry clearly fits.

Reproduce:

```
PN_API_KEY=... PN_MODEL=gpt-4o-mini node eval/run.mjs --split=holdout
```

## License

MIT
