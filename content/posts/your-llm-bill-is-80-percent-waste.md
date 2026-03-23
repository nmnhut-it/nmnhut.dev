+++
date = '2026-03-23'
draft = false
title = 'Your LLM Bill Is 80% Waste. Here Are 3 Fixes.'
description = 'You are sending every question to your most expensive model. Route by difficulty, cache instructions, cap output — 75-85% savings with no quality loss.'
tags = ['ai', 'llm', 'optimization', 'routing', 'cost']
+++

You're sending every question to your most expensive model. Simple lookups, complex architecture reviews, one-word classifications — all hitting the same endpoint at the same price. That's like routing every hospital patient to the head surgeon, whether they need stitches or a heart transplant.

The fix is three levers, applied in order. Each compounds on the last. Together: **75–85% cost reduction, and quality goes up on the hard queries.**

1. **Route by difficulty** — send easy questions to cheap models, hard ones to strong models
2. **Cache the instructions** — stop re-reading the same playbook on every call
3. **Control the output** — stop the model from overthinking simple tasks

---

## Lever 1: Route by difficulty

**65% of your queries don't need your best model.** "What's our refund policy?" and "Design a distributed caching layer with consistency guarantees" both hit the same model at the same price. One needs a $0.80/million-token model. The other genuinely needs a $15/million-token model.

A router sits in front of your models and classifies each incoming query — in under 5 milliseconds, at near-zero cost.

Think of hospital triage. The nurse at the front desk doesn't diagnose — she routes. Chest pain goes to cardiology. Sprained ankle goes to general. Nobody waits in the wrong line, and the specialists stay focused on what only they can do.

**How it works:** you define categories with example phrases — "simple Q&A", "summarization", "architecture", "code review." The router converts each query into a mathematical fingerprint (technically called an embedding) and checks which category it's closest to. Pure math, no AI call needed.

| Query | Best match | Routed to |
|-------|-----------|-----------|
| "What's our refund policy?" | Simple Q&A (92% match) | Cheap model |
| "Design a caching layer for 10M users" | Architecture (88% match) | Strong model |

The router has three layers, each catching what the last misses. **Category matching** handles most queries via the fingerprint comparison. **Keyword overrides** catch domain-specific signals — mentions "OWASP" or "vulnerability"? Always route to code review. **Complexity scoring** adjusts within a category — a 5-line function review goes to the cheap model, a 200-line distributed system goes to the strong one.

| Query type | % of traffic | Before (all mid-tier) | After routing |
|-----------|-------------|----------------------|--------------|
| Simple Q&A | 40% | $3 per MTok | $0.80 (cheap model) |
| Summarization | 25% | $3 per MTok | $0.80 (cheap model) |
| Code review | 25% | $3 per MTok | $3 (mid-tier, cached) |
| Architecture | 10% | $3 per MTok | $15 (strong model) |
| **Blended cost** | | **$3 per MTok** | **~$2.77 per MTok** |

*MTok = million tokens. Tokens are the units LLMs charge by — roughly one token per word.*

That looks modest — only 8% off the blended rate. But look at it differently: **65% of your traffic just got 3.75x cheaper** ($3 → $0.80). The architecture tier pulls the average up because it's a premium model, but those queries now produce **better results**. You're not just saving money — you're allocating it where it matters.

The real power of routing isn't the blended rate. It's that routing **unlocks Lever 2** — caching — which wouldn't work without stable, per-category instruction sets.

**Impact: 65% of queries cost 3.75x less. Architecture quality goes up.** Medium effort — one new component in your pipeline.

---

## Lever 2: Cache the instructions

Now that queries are routed to the right model, the next question: can each model's instructions be cheaper to process?

**You can cut input costs by up to 90% without changing a line of application code.** Here's why: every API call re-sends your full instructions from scratch. System prompt, rules, output format, examples — all re-transmitted and re-processed every single time. The model re-reads the entire playbook before generating a single word of response.

Providers now offer **prefix caching** — the provider remembers the beginning of your request if it hasn't changed, and charges 75–90% less for the matched portion.

It's like a highway EZ-Pass. Same account, same lane, fly through. But if you showed up with a different pass each time, the system couldn't recognize you — and you'd pay cash-lane prices every trip.

**What breaks the cache:** anything dynamic mixed into your instructions. Many teams embed the user's name, a timestamp, or session data into their instruction prompts for personalization — and that breaks the cache on every call.

**The rule:** put all static content first (instructions, rules, format, examples). Put all dynamic content last (conversation history, user's message). Everything above the dividing line must be word-for-word identical across requests.

Routing (Lever 1) **multiplies** this benefit. Each model category gets a stable, task-specific instruction set. The cheap model always gets the same "answer simply" instructions. The strong model always gets the same "architect carefully" instructions. Cache hit rates approach 100% per category because every request in that category shares the same prefix.

| Provider | Cache discount | Minimum prefix |
|----------|---------------|----------------|
| Anthropic | 90% off | 1,024 tokens |
| Google | 75% off | Variable |
| OpenAI | 50% off | 1,024 tokens |

**Impact: 60–90% input cost reduction** from the second call per category. Low effort — it's a prompt restructure, not an architecture change.

---

## Lever 3: Control the output

**Capping output length is the highest-ROI, lowest-effort optimization you can make.** Output tokens (the words the model generates) cost 3–5x more than input tokens because generating text is sequential — one word at a time — while reading input is parallel. Controlling what the model writes saves more per dollar than any input-side optimization.

The problem: without explicit limits, models over-deliver. Ask for a yes/no classification, get a 500-word explanation. Ask for a data extraction, get a preamble, the data, and a reflective summary. You're paying premium rates for words nobody reads.

The fix is a maximum output length per task type:

| Task | Sensible cap | Typical without cap |
|------|-------------|-------------------|
| Classification (yes/no) | ~8 words | 500+ words |
| Data extraction | ~60 words | ~250 words |
| Summarization | ~125 words | ~500 words |
| Analysis / review | ~250 words | ~1,000 words (default) |

There's a subtler cost most teams miss: **thinking tokens.** Newer reasoning models — like OpenAI's o-series or Claude with extended thinking — "think" internally before answering. This reasoning is invisible in the response but billed at the same output rate. A simple math question can burn ~3,000 words of internal thinking before producing a 50-word answer.

Telling the model "answer directly, do not deliberate on format" in the instructions cuts this thinking waste significantly. For simple tasks, this one instruction saves more than switching models.

**Impact: 50–90% output cost reduction.** Lowest effort — it's a configuration change.

---

## The compound effect

These three levers aren't alternatives. They apply to different parts of your bill and stack.

A typical LLM bill breaks down roughly 40% input tokens, 60% output tokens (because output costs 3–5x more per token). Here's what happens when you apply all three levers to a **$10,000/month** bill:

| Cost component | Before | After all 3 levers | How |
|---------------|--------|-------------------|-----|
| **Input tokens** (40% = $4,000) | $4,000 | ~$400 | Caching saves 90% on repeated instruction prefixes |
| **Output tokens** (60% = $6,000) | $6,000 | ~$1,200 | Caps + reduced thinking cut output 50–80% |
| **Model selection** | All mid-tier | 65% on cheap tier | Routing sends simple queries to 3.75x cheaper models |
| | | | |
| **Monthly total** | **$10,000** | **~$1,500–$2,500** | **75–85% reduction** |

The savings aren't theoretical. Each lever targets a different cost driver: routing cuts model price, caching cuts input reprocessing, output caps cut generation waste. They don't compete — they compound.

And the quality story: the 10% of queries that genuinely need a strong model now get one. Before, they were stuck on mid-tier with everyone else.

---

## What to do Monday

**1. This week — Audit.** Log 1,000 queries and classify them manually. What percentage are simple Q&A vs. genuine reasoning tasks? The distribution will surprise you — most teams find 60–70% of queries don't need their best model.

**2. Next sprint — Quick wins.** Set maximum output lengths per task type. Add "answer directly, do not deliberate" to instructions for simple tasks. Reorder prompts so static instructions come first. These are configuration changes, not architecture changes. Your existing codebase doesn't change.

**3. Next month — Deploy the router.** Start with [Semantic Router](https://github.com/aurelio-labs/semantic-router) — a lightweight open-source library your team installs alongside the existing service. It runs on any server CPU, adds <5ms latency, and costs nothing to operate. Define 4–5 categories with example phrases. Route to 2–3 model tiers. Measure cost and quality weekly.

**Owner:** whoever owns your LLM integration layer. This is infrastructure work, not ML research. No training pipelines, no GPUs, no data scientists required.
