# Is There a Name for This?

I spent weeks trying to prove that bolting pre-built knowledge onto a small model makes it smarter, and mostly proving it doesn't. One experiment finally moved, and it changed what I think the job is. The highest-leverage thing you can hand a stuck person is the canonical name of their problem: a name turns a description you can't search for into a term you can, and it's the one piece of AI output you can verify yourself.

The rest of this is how I got there, including the part where nothing worked.

## The flat part

The plan was simple. Small models are weak because they don't know enough, so give one a memory and watch it climb. I started with US bar-exam questions: built a retrieval memory, ran the eval, and learned the model already scored around 80% raw. The memory had nothing to add. Okay, pick a domain the model is actually bad at. So I built an issue-spotting index over 6,700 Swiss federal statute articles, citation-graph expansion, the whole apparatus. Accuracy moved three points. Not significant. The placebo control twisted the knife: injecting US-law knowledge instead of Swiss captured about half of even that. Half of my hand-built Swiss index was doing the work of any legal-sounding text. I sat there looking at a three-point lift I couldn't defend. I'd bet most retrieval systems in production have a flat line like this hiding in them; roughly nobody runs the placebo.

Then I tried naming. Give the model an inarticulate description of a situation and ask what the problem is called. claude-haiku-4.5 names the canonical problem from memory 74% of the time. Hand it a catalog of symptom-first entries to scan and it hits 90% (n=80 paired, helped 17, hurt 4, McNemar p ≈ 0.007). The test I care about most: a private vocabulary of terms coined in my own project's design docs. Words no model has ever seen, because I made them up. Raw, 22%. With the catalog, 62% (n=54, helped 23, hurt 1, p < 0.001).

Weeks of flat lines, then that. The lesson I take is narrow and I'll commit to it: external knowledge pays off exactly and only where the knowledge isn't already in the model. And "what is this called" is the purest case, because for your own coined vocabulary, no model can know it. Not a bigger model, not next year's model.

The bar-exam memory wasn't wrong, by the way. It was redundant. There's a difference, and it took me embarrassingly long to feel it.

## What a name buys you

When you're stuck on something you can't name, you're stuck twice: you can't search for it, and you can't read about it. Until someone says "there's a name for this: the winner's curse" (or the N+1 query problem, or Simpson's paradox). Other people hit this. Some of them wrote it down.

The part I under-rated at first: a name is a verification handle. If a model hands you free-form advice, you'd have to be an expert already to check it. If it hands you a name, you can look the name up and see whether its decades of established meaning fit your case. The model proposes; the literature decides. That's a much better trust arrangement than "sounds plausible."

There's a hazard, and I measured it. A wrong name is worse than no name, because it sends you off studying the wrong problem with false confidence and a citation in hand. In my famous-problems eval, 4 of 80 cases got hurt: a plausible-but-wrong catalog pick displaced a correct answer the model would have given from memory. Four out of eighty was enough for me. Every part of the tool defaults to silence, and "no established name found" is a first-class answer, never a forced closest match.

## The pipeline already had a name

Here's the part that made me laugh at my own tool. The loop I built: take a situation described without its name, produce ranked candidate names, and when two candidates sit close, ask the one question that splits them (livelock vs. deadlock: is the CPU busy or idle?). Confirm against defining criteria instead of surface resemblance, and deliver the name with what it unlocks, or say "undiagnosed" rather than force a label. I coined proud little stage names for all of this during development. It took me until the end to notice the loop already has a name and clinicians have run it for a century: differential diagnosis. Presenting complaint, differential, discriminating test, diagnosis. The tool's own lesson, applied to the tool. (Medicine also spent that century documenting the failure modes, anchoring bias and premature closure, so I get to import their homework.)

## Mechanics, briefly

The catalog entries are written symptom-first: the way you'd describe the situation before you know the name. Library science calls this an "entry vocabulary," an index keyed by what the searcher would actually say. Each entry carries the name, aliases, the symptom, what knowing the name unlocks, and how to tell it from its neighbors.

Lookup runs three tiers, cheapest first: model memory (free, covers famous problems), local catalog (instant, and the only tier that works for your own vocabulary), web search (slow, covers everything else, and double-checks the other two). When web search names something, that becomes a candidate catalog entry, so the catalog grows with use.

Detection ships as thin adapters, split by who notices the gap: a Claude Code hook (a single-digit-millisecond regex for phrases like "is there a name for..." or the hedged "the thing where..."), an MCP tool for when the model notices mid-task, a skill, a CLI for when you notice yourself. The hook matters most, and here's why: the whole problem is an unknown unknown. You don't know a name exists, so you'd never ask.

In the end-to-end test I described a real shape of failure: two services' retry loops feed each other, A times out and retries, which overloads B, which times out and retries back, and traffic spirals until everything melts down even after the original blip is gone. The session came back with: this is a metastable failure driven by a retry storm; the meltdown outliving the blip is the defining signature of metastability; break the loop with retry budgets, backoff with jitter, circuit breakers, load shedding. One term, and the private mess became a literature.

## What I haven't measured

The numbers above describe the catalog tier only; the web-search path is unbenchmarked, and I doubt it's as clean. Everything is from one small model, and I haven't tested whether the famous-problem lift survives on a bigger one. And on domains the model already covers, the mechanism adds nothing. I have the Swiss statutes to prove it. This is a supplement for missing knowledge, not a general upgrade.

The tool is [problem-namer](https://github.com/nkriman/problem-namer). The honest pitch is small: sometimes, when you're describing a thing sideways, it hands you the word. The rest of the time it has the decency to stay quiet. That part I did measure.

---

## Appendix: the lineage, stage by stage

None of the pipeline's stages is new — beyond differential diagnosis as the
whole, each step enacts a classical idea from ontology and knowledge
organization, and those fields already solved the failure modes:

| Stage | The idea it enacts |
|---|---|
| **1 · Detect** | The naming gap is a missing *instance → concept* link: a lived situation that belongs to a class whose label the describer doesn't hold. Library science's fix is the **entry vocabulary** — index the words novices actually use, not the expert's terms. That's why `symptom` is written from *before* you know the name. |
| **2 · Look up** | **Entity linking**: generate candidate canonical concepts for a free-text mention. The catalog is a micro-ontology in [SKOS](https://www.w3.org/TR/skos-primer/) terms — `name` ≈ `prefLabel`, `aliases` ≈ `altLabel`, `symptom` ≈ the entry vocabulary that points at the concept. |
| **3 · Verify** | Classification by **intension, not surface similarity**: an instance belongs to a concept because it satisfies the concept's defining conditions, not because their words overlap. Lexical overlap proposes; only intension confirms. |
| **4 · Discriminate** | **Genus + differentia**, operationalized as a biologist's dichotomous key: sibling concepts are told apart by one observable property. `distinguish` is a disjointness axiom in prose. |
| **5 · Surface / NIL** | A label is a handle into the concept's **connected knowledge** — `framework` carries the concept's relations to canonical analyses and fixes, which is the actual payoff of naming. NIL respects the **open-world assumption**: the ontology lacking a match is information, never license to force one. |
| **↺ Capture** | **Ontology population**: concepts enter the catalog from usage — a successful web-search naming is a candidate entry, so the ontology grows as a byproduct of solving. |
