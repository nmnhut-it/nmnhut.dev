+++
date = '2026-03-23'
draft = false
title = 'Your LLM Bill Is 80% Waste. Here Are 4 Fixes.'
description = 'Route by difficulty, manage context, cache instructions, cap output — 80-88% savings with no quality loss.'
tags = ['ai', 'llm', 'optimization', 'routing', 'cost']
+++

You're sending every question to your most expensive model. That's like routing every patient to the head surgeon — stitches or heart transplant, same price.

**Four levers, applied in order. Together: 80–88% cost reduction.**

---

## Lever 1: Route by Difficulty

**65% of queries don't need your best model.**

A router classifies each query in <5ms using embeddings (mathematical fingerprints) — no AI call needed.

```
         ┌─────────┐
Query ──►│ Router  │──► "What's our refund policy?"  ──► Cheap model ($0.80/MTok)
         │ (<5ms)  │──► "Design a caching layer"     ──► Strong model ($15/MTok)
         └─────────┘
```

- **Category matching** — compare query fingerprint to example phrases
- **Keyword overrides** — "OWASP" → always route to code review
- **Complexity scoring** — 5-line function → cheap; 200-line system → strong

**Result:** 65% of traffic costs 3.75x less. Hard queries get *better* models.

---

## Lever 2: Manage Context Like Memory

**Message #50 re-sends messages 1–49 in full. Re-processed, re-billed.** Model accuracy drops past ~60% context utilization — you pay more for worse output.

```
Context utilization:
 0%──────50%─────70%─────85%────100%
 │  ✅ OK  │ ⚠ Plan │ 🔴 Now │ 💀  │
 │         │ reset  │ reset  │     │
```

Three layers, like human memory:

- **Working memory** — keep current conversation focused. Fork unrelated subtopics into separate threads
- **Consolidation** — at milestones, summarize into "meeting minutes" and restart fresh. Same knowledge, 5% of the tokens
- **Retrieval** — search past conversations by semantic similarity instead of replaying them. Knowledge graphs for structured recall

**Result:** 35% context cost reduction. Quality stays at baseline.

---

## Lever 3: Cache the Instructions

**Every API call re-sends your full system prompt.** Providers now cache stable prefixes — 75–90% cheaper on the repeated portion.

```
┌──────────────────────────────────┬──────────────┐
│  Static instructions (cached)    │ Dynamic msg  │
│  Rules, format, examples         │ User query   │
│  ✅ 90% discount (Anthropic)     │ Full price   │
│  ✅ 75% discount (Google)        │              │
│  ✅ 50% discount (OpenAI)        │              │
└──────────────────────────────────┴──────────────┘
```

- Put all static content **first**, dynamic content **last**
- Don't embed timestamps/usernames in instructions — breaks the cache
- Routing (Lever 1) gives each category a stable prefix → near-100% hit rate

**Result:** 60–90% off input costs from the second call onward.

---

## Lever 4: Cap the Output

**Output tokens cost 3–5x more than input.** Without limits, models over-deliver.

| Task | Sensible cap | Without cap |
|------|-------------|-------------|
| Classification | ~8 words | 500+ words |
| Data extraction | ~60 words | ~250 words |
| Summarization | ~125 words | ~500 words |
| Analysis | ~250 words | ~1,000 words |

Add `"answer directly, do not deliberate"` for simple tasks — cuts hidden thinking tokens too.

**Result:** 50–90% output cost reduction. Lowest effort of all four levers.

---

## The Compound Effect

```
$10,000/mo bill breakdown:

Before    ████████████████████████████████████████  $10,000
          ├── Input (40%) ──┤── Output (60%) ───┤

After     ██████                                   $1,200–$2,000
          ├─┤──┤
          │  └─ Output: caps + routing ──► $1,200
          └─ Input: cache + context mgmt ──► $250

Savings: 80–88%
```

Each lever targets a different cost driver. They don't compete — they **compound**.

---

## What to Do Monday

- **This week** — Log 1,000 queries, classify manually. Most teams find 60–70% are simple
- **Next sprint** — Set output caps per task type. Reorder prompts (static first). Zero code changes
- **Next month** — Deploy [Semantic Router](https://github.com/aurelio-labs/semantic-router). 4–5 categories, 2–3 model tiers
- **Next quarter** — Build context memory layer. Auto-summarize at 70% utilization. Add semantic search over past sessions
