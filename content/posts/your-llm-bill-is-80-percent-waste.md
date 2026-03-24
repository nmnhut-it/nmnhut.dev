+++
date = '2026-03-23'
draft = false
title = 'Your LLM Bill Is 80% Waste. Here Are 7 Fixes.'
description = 'Route by difficulty, manage context, cache instructions, cap output, materialize solutions, fine-tune with LoRA, and batch async work — 80-95% savings.'
tags = ['ai', 'llm', 'optimization', 'routing', 'cost']
+++

You're sending every question to your most expensive model. That's like routing every patient to the head surgeon — stitches or heart transplant, same price.

**Seven levers, applied in order. Together: 80–95% cost reduction.**

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

## Lever 5: Materialize Known Solutions

**If you've solved it before, don't solve it again with an LLM.** Every time your agent figures out a multi-step workflow — deploying a service, fixing a common bug pattern, generating a report — that's a solution you can capture as a deterministic pipeline.

```
Before: User → LLM (thinks 2000 tokens) → result
After:  User → Script/Skill (0 tokens)   → result
```

- **Scripts** — solved workflows become shell scripts or CI pipelines. "Generate weekly metrics report" doesn't need reasoning — it needs `SELECT` + template
- **Skills/playbooks** — reusable prompt+tool bundles that load on demand. The LLM still runs, but the skill carries the instructions instead of the model figuring it out each time
- **Cached decisions** — if the same question gets the same answer 95% of the time, cache it. Only call the LLM for the 5% edge cases

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Solved?     │─yes─►  Run script  │     │  Zero tokens │
│  (lookup)    │      │  /pipeline   │     │  Zero cost   │
└──────┬───────┘      └──────────────┘     └──────────────┘
       │no
       ▼
┌──────────────┐
│  Route to    │──► LLM (only for genuinely new problems)
│  model       │
└──────────────┘
```

Think of it as **graduating solutions out of AI**. The LLM is R&D — once R&D produces a proven process, production runs it without the LLM.

**Result:** Every materialized workflow = 100% token savings on that task. High-frequency tasks compound fast.

---

## Lever 6: Fine-Tune with LoRA

**Distill your expensive model's knowledge into a cheap one — for your domain only.**

[LoRA (Low-Rank Adaptation)](https://arxiv.org/abs/2106.09685) lets you fine-tune a small model by training only a thin adapter layer (~1-5% of parameters) instead of the full model. You get domain-specific accuracy from a model that costs 10-20x less to run.

```
                    General knowledge
                    ┌────────────────┐
                    │  Base model    │  (frozen, unchanged)
                    │  (Llama/Mistral│
                    │   /Qwen)       │
                    └───────┬────────┘
                            │
                    ┌───────┴────────┐
                    │  LoRA adapter  │  (your domain, ~1% params)
                    │  trained on    │
                    │  your data     │
                    └────────────────┘
```

How to build the training data:

1. Log your expensive model's best outputs (the ones users accepted)
2. Filter for your top task categories from Lever 1
3. Fine-tune a small model (Llama 8B, Mistral 7B) with LoRA on those pairs
4. The fine-tuned model replaces the expensive model for those categories

| Model | Cost/MTok | Your domain accuracy |
|---|---|---|
| Opus/GPT-4 (teacher) | $15 | 95% |
| Haiku/GPT-4-mini (generic) | $0.80 | 70% |
| Small + LoRA (your domain) | $0.80 | 90-93% |

- **Runs on a single GPU** — LoRA adapters are ~50MB, not 100GB
- **Stack with routing** — router sends known categories to your LoRA model, unknown ones still go to the big model
- **Update monthly** — retrain adapter as your domain evolves, base model stays frozen

**Result:** 10-20x cost reduction on high-volume task categories, with <5% quality drop.

---

## Lever 7: Batch Async Work

**If it doesn't need a real-time answer, don't pay real-time prices.**

Anthropic, OpenAI, and Google all offer batch/async APIs at 50% discount. Same models, same quality — just processed in a queue instead of immediately.

- Nightly report generation
- Bulk classification / tagging
- Content moderation backlogs
- Data extraction from documents
- Test generation, code review on PRs

**Result:** 50% off for any task that can wait 15-60 minutes. Zero code change — swap the endpoint.

---

## The Compound Effect

```
$10,000/mo bill breakdown:

Before     ████████████████████████████████████████  $10,000
           ├── Input (40%) ──┤── Output (60%) ───┤

Levers 1-4 ██████                                   $1,200–$2,000
           routing + cache + context + caps

+Lever 5   ████                                     $600–$1,000
           materialize top 30% workflows to scripts

+Lever 6   ███                                      $300–$600
           LoRA replaces expensive model on known tasks

+Lever 7   ██                                       $200–$500
           batch async work at 50% off

Savings: 80–95%
```

Each lever targets a different cost driver. They don't compete — they **compound**.

| Lever | Targets | Effort | Savings |
|---|---|---|---|
| 1. Route by difficulty | Model price | Medium | 65% of traffic 3.75x cheaper |
| 2. Manage context | Input volume | Medium | 35% less history |
| 3. Cache instructions | Input rate | Low | 60-90% off cached prefix |
| 4. Cap output | Output volume | Low | 50-90% fewer output tokens |
| 5. Materialize solutions | Call volume | Medium | 100% on each solved task |
| 6. LoRA fine-tuning | Model price | High | 10-20x on known categories |
| 7. Batch async | Per-token rate | Low | 50% off async tasks |

---

## What to Do Monday

- **This week** — Log 1,000 queries, classify manually. Most teams find 60–70% are simple. Switch async tasks to batch API (instant 50% off)
- **Next sprint** — Set output caps per task type. Reorder prompts (static first). Zero code changes
- **Next month** — Deploy [Semantic Router](https://github.com/aurelio-labs/semantic-router). 4–5 categories, 2–3 model tiers. Identify top 5 repetitive workflows and script them
- **Next quarter** — Build context memory layer. Auto-summarize at 70% utilization. Start LoRA fine-tuning on your highest-volume category using your logged query-response pairs
- **Ongoing** — Every solved workflow graduates from LLM to script. The LLM handles fewer and fewer tasks over time — each one genuinely worth the tokens
