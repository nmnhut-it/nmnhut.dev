+++
date = '2026-03-23'
draft = false
title = 'Build a Token Router with Embeddings and Prompt Templates'
description = 'No training pipeline. No GPU. Just embeddings, cosine similarity, and structured prompts that cut your LLM bill by 80%.'
tags = ['ai', 'llm', 'routing', 'optimization', 'embeddings']
+++

*Skip the training pipeline and the GPU — embeddings, cosine similarity, and structured prompts are enough to cut your LLM bill by 80%.*

---

### The idea

Every query has a **shape** — topic, complexity, expected output format. You can detect that shape in <5ms using embeddings, then:

1. **Pick a prompt template** — pre-built system prompt with format constraints, cached by the provider
2. **Pick a model** — cheap for easy queries, strong for hard ones
3. **Cap output tokens** — templates define expected length

All of this works with pure geometry in embedding space — no model training, no preference data required.

---

### Step 1: Define your routes

A route is a category with example utterances. The examples define a **region in embedding space** — at runtime, you check which region the query lands in.

```python
from semantic_router import Route, RouteLayer
from semantic_router.encoders import HuggingFaceEncoder

encoder = HuggingFaceEncoder(name="all-MiniLM-L6-v2")  # 384-dim, 80MB, runs on CPU

routes = [
    Route(
        name="code_review",
        utterances=[
            "review this code for bugs",
            "check this function for security issues",
            "what's wrong with this implementation",
            "find the bug in this snippet",
            "is this code production-ready",
        ],
        metadata={"model": "sonnet", "max_tokens": 1024},
    ),
    Route(
        name="summarization",
        utterances=[
            "summarize this document",
            "give me the key points",
            "tl;dr of this article",
            "what are the main takeaways",
        ],
        metadata={"model": "haiku", "max_tokens": 256},
    ),
    Route(
        name="architecture",
        utterances=[
            "design a system that handles",
            "how should I architect this",
            "what's the best approach for scaling",
            "propose a data model for",
        ],
        metadata={"model": "opus", "max_tokens": 2048},
    ),
    Route(
        name="simple_qa",
        utterances=[
            "what is",
            "define",
            "explain the difference between",
            "how does X work",
            "what does this error mean",
        ],
        metadata={"model": "haiku", "max_tokens": 512},
    ),
]

router = RouteLayer(encoder=encoder, routes=routes)
```

**How it works under the hood:**

1. At init, the encoder converts every utterance into a 384-dim vector
2. Each route becomes a **centroid** (average of its utterance vectors)
3. At runtime: encode the query → compute cosine similarity against all centroids → pick the highest above a threshold

```
query: "check this endpoint for SQL injection"
                    │
                    ▼  encode → [0.12, -0.34, 0.81, ...]
                    │
    ┌───────────────┼───────────────┐
    ▼               ▼               ▼
code_review    summarization   architecture
  sim=0.87       sim=0.21       sim=0.34
    │
    ▼
  MATCH → template: code_review, model: sonnet
```

**Latency: <5ms.** The embedding is a single matrix multiply. Cosine similarity is a dot product. No LLM call, no network round-trip.

---

### Step 2: Add keyword boosting

Embeddings catch semantic similarity but miss domain-specific signals. "OWASP" should always route to code review. "p99 latency" should always route to architecture. Add keyword rules as a fast path:

```python
KEYWORD_OVERRIDES = {
    "code_review": ["CVE", "OWASP", "XSS", "injection", "vulnerability", "lint"],
    "architecture": ["p99", "throughput", "sharding", "replication", "CAP theorem"],
    "summarization": ["tl;dr", "tldr", "summarize", "key points", "digest"],
    "simple_qa": ["what is", "define", "meaning of"],
}

def classify(query: str) -> tuple[str, float]:
    q_lower = query.lower()

    # Fast path: keyword match
    for route_name, keywords in KEYWORD_OVERRIDES.items():
        if any(kw.lower() in q_lower for kw in keywords):
            return route_name, 1.0

    # Slow path: embedding similarity
    result = router(query)
    if result.name and result.similarity_score > 0.5:
        return result.name, result.similarity_score

    # Fallback: no confident match
    return "general", 0.0
```

Keywords are checked first — O(1) string matching. Embeddings are the fallback for queries that don't contain explicit signals. The `0.5` threshold controls how confident the router needs to be before committing to a route.

---

### Step 3: Complexity scoring within a route

Picking the route isn't enough. Within "code_review", a 5-line function and a 200-line class with async generators are different beasts. Score complexity with cheap heuristics:

```python
def score_complexity(query: str) -> float:
    """0.0 = trivial, 1.0 = complex. No LLM call."""
    score = 0.0
    signals = {
        "length": min(len(query) / 2000, 0.3),
        "code_blocks": 0.2 if "```" in query else 0.0,
        "multi_part": 0.15 if any(w in query.lower()
            for w in ["and also", "then", "additionally", "step by step"]) else 0.0,
        "technical_depth": 0.2 if any(w in query.lower()
            for w in ["async", "concurrent", "distributed", "optimize",
                       "deadlock", "race condition", "memory leak"]) else 0.0,
        "negation": 0.15 if any(w in query.lower()
            for w in ["without", "must not", "avoid", "except"]) else 0.0,
    }
    return min(sum(signals.values()), 1.0)
```

Combine route + complexity to pick the model:

```python
MODEL_TIERS = {
    "haiku":  {"id": "claude-haiku-4-5-20251001", "cost": 1},
    "sonnet": {"id": "claude-sonnet-4-6",         "cost": 5},
    "opus":   {"id": "claude-opus-4-6",            "cost": 25},
}

def pick_model(route_name: str, complexity: float) -> str:
    default = SKILL_TEMPLATES[route_name]["model"]

    if complexity > 0.7:
        # Upgrade one tier
        if default == "haiku": return "sonnet"
        if default == "sonnet": return "opus"
    elif complexity < 0.2:
        # Downgrade one tier
        if default == "opus": return "sonnet"
        if default == "sonnet": return "haiku"

    return default
```

"Code review" defaults to Sonnet. But a trivial 3-line function → Haiku. A complex async distributed system → Opus. **The route sets the baseline, complexity adjusts it.**

---

### Step 4: Prompt templates with prefix caching

Each route maps to a **stable system prompt** that gets cached by the provider:

```python
SKILL_TEMPLATES = {
    "code_review": {
        "model": "sonnet",
        "max_tokens": 1024,
        "system": """You are a code reviewer. Be specific and concise.

## Rules
- Flag correctness, security, and maintainability issues
- Cite the exact line or pattern
- Suggest a concrete fix for each issue
- Do not deliberate on format — follow the output format exactly

## Output
Return JSON: {"issues": [{"severity": "high|medium|low", "description": str, "fix": str}]}""",
    },

    "summarization": {
        "model": "haiku",
        "max_tokens": 256,
        "system": """You are a technical summarizer.

## Rules
- 3-5 bullet points maximum
- Lead with the most important finding
- Include specific numbers when present
- No filler phrases, no preamble

## Output
Return a markdown bullet list. Nothing else.""",
    },

    "simple_qa": {
        "model": "haiku",
        "max_tokens": 512,
        "system": """Answer directly and concisely.

## Rules
- Lead with the answer, then explain if needed
- If you're unsure, say so in one sentence
- No unnecessary caveats or disclaimers""",
    },

    "architecture": {
        "model": "opus",
        "max_tokens": 2048,
        "system": """You are a distributed systems architect.

## Rules
- Consider failure modes and recovery
- Estimate cost and latency implications
- Reference industry-standard patterns by name
- Identify the simplest solution that meets requirements

## Output
Structured markdown: Overview, Components, Data Flow, Failure Modes, Trade-offs.""",
    },

    "general": {
        "model": "sonnet",
        "max_tokens": 1024,
        "system": "You are a helpful assistant. Be concise.",
    },
}
```

**Why these templates save money three ways:**

1. **Prefix caching.** Every "code_review" call shares the identical system prompt. Anthropic caches the KV vectors — 90% off input tokens from the second call within a 5-minute window.

2. **Killed thinking waste.** "Do not deliberate on format" + explicit output spec = the model jumps straight to answering. Measured: 40-60% fewer thinking tokens.

3. **Tight `max_tokens`.** Summaries get 256. QA gets 512. No more "4096 just in case" burning output tokens at 3-5x input price.

---

### Step 5: Wire it together

```python
from anthropic import Anthropic

client = Anthropic()

def dispatch(query: str):
    # 1. Classify intent (<5ms)
    route_name, confidence = classify(query)

    # 2. Score complexity (<1ms)
    complexity = score_complexity(query)

    # 3. Pick model
    template = SKILL_TEMPLATES[route_name]
    model = pick_model(route_name, complexity)

    # 4. Call with cached template
    response = client.messages.create(
        model=MODEL_TIERS[model]["id"],
        max_tokens=template["max_tokens"],
        system=[{
            "type": "text",
            "text": template["system"],
            "cache_control": {"type": "ephemeral"},
        }],
        messages=[{"role": "user", "content": query}],
    )

    return {
        "response": response.content[0].text,
        "route": route_name,
        "model": model,
        "complexity": complexity,
        "confidence": confidence,
        "input_tokens": response.usage.input_tokens,
        "output_tokens": response.usage.output_tokens,
        "cache_hit": response.usage.cache_read_input_tokens > 0,
    }
```

**Total routing overhead: <6ms.** One embedding encode + cosine similarity + string matching + arithmetic. The savings on a single Opus→Haiku downgrade pay for 10,000 routing decisions.

---

### The math

Assume 10,000 queries/day, current setup: all go to Sonnet at $3/$15 per MTok.

| | Before | After routing |
|---|---|---|
| **Simple QA (40%)** | Sonnet | Haiku ($0.80/$4) |
| **Summarization (25%)** | Sonnet | Haiku ($0.80/$4) |
| **Code review (25%)** | Sonnet | Sonnet (same, but cached) |
| **Architecture (10%)** | Sonnet | Opus (upgrade, but rare) |
| **Cache hit rate** | 0% | ~85% on system prompts |
| **Estimated savings** | — | **~75%** |

And the quality on architecture queries **goes up** because they're hitting Opus now.

---

### What to watch for

**Misroutes.** Log every `(query, route, confidence)` tuple. Sort by lowest confidence weekly — those are your edge cases. Add their patterns as new utterances to the right route.

**Cache-busting.** If you see `cache_read_input_tokens: 0` on repeat calls to the same template, something dynamic is leaking into the system prompt. Timestamps, user IDs, session context — all go in user messages, never system.

**Threshold tuning.** Start the embedding similarity threshold at 0.5. If too many queries fall to "general" (>20%), lower to 0.4. If wrong routes happen often, raise to 0.6.

**Template drift.** Every time you edit a template, the cache resets for that route. Batch template changes. Don't A/B test by modifying the system prompt per-request — that kills caching.
