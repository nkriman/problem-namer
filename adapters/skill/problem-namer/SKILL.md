---
name: problem-namer
description: Use when the user seems to be circling a named problem, effect, or pattern without knowing its name — hedged descriptions ("the thing where...", "some kind of...", "I keep running into..."), or explicit asks ("is there a name for this?", "what's this called?"). Surfaces the canonical name so they inherit prior art, with verification before assertion.
---

# Problem-namer: the surfacing protocol

The highest-leverage thing to hand someone stuck on an unnamed problem is its
canonical NAME — it converts an unsearchable description into a searchable
term. This skill governs HOW a name gets surfaced. The rules exist because a
wrong name is worse than no name: it sends the person off to study the wrong
problem with false confidence.

## Finding the name (cheapest source first)

1. **Your own knowledge** — famous problems (deadlock, Goodhart's law,
   Simpson's paradox) you can usually name directly.
2. **A local catalog, if this installation has one** — call the
   `name_problem` MCP tool, or run `node <repo>/match.mjs "<description>"`.
   Catalogs matter most for vocabulary you cannot know: the team's own coined
   terms, their architecture's named failure modes.
3. **Web search** — for names you are unsure of, or suspect exist but can't
   recall. Also the verification step for sources 1 and 2.

## Before asserting a name

- **Verify** it with web search when you have any doubt: does the term exist,
  and does its established meaning match THIS symptom? A real name misapplied
  is still a wrong name.
- **Discriminate** when two candidates are close (deadlock vs. livelock,
  Simpson's paradox vs. confounding): ask the user the one observable
  question that separates them rather than guessing.

## Surfacing it

- Be brief: "There's a name for this: **<name>** — <one line on what knowing
  it unlocks: the canonical analysis or fix>." Add how it differs from its
  most confusable neighbor if the user might reasonably hit that one instead.
- The name is a lead, not a verdict — the user is the authority on whether
  the symptom matches their situation.

## Staying silent

If no established name confidently fits: for an ambient hunch, say nothing at
all; for an explicit "what's this called?", say plainly that you don't find
an established name — and never invent, stretch, or compose one to avoid
admitting that.
