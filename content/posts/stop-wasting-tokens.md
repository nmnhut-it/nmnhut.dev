+++
date = '2026-03-22'
draft = false
title = 'Stop Wasting Tokens'
description = 'Most LLM cost is waste — context that did not need to be there, models too big for the task, reasoning that ran longer than it should.'
tags = ['ai', 'llm', 'agents', 'optimization']
+++

<audio controls style="width:100%; margin-bottom: 1.5rem;">
  <source src="/audio/stop-wasting-tokens.mp3" type="audio/mpeg">
</audio>

Most LLM cost is waste — context that didn't need to be there, models too big for the task, reasoning that ran longer than it should. Here's how to fix it, grounded in 2025 research, with a concrete open-source stack at the end.

---

## The problem

Token cost and context bloat are the same problem: **no mechanism deciding what information is worth keeping.** It shows up three ways:

- **Uncontrolled output.** Thinking tokens are invisible but billed at 3–5x the input price. No budget cap = silent overbilling.
- **Context bloat.** Every API call sends the full conversation from scratch. History accumulates, quality degrades well before the limit.
- **No routing.** Simple classification tasks go to frontier models at frontier prices.

Fix these in order — output, then input structure, then context management, then routing. The savings compound.

---

## Context degrades faster than you think

Models advertise 128K–1M token windows. Effective context — where accuracy stays near baseline — is **50–65% of that.**

| Benchmark | Finding | Venue |
|---|---|---|
| NoLiMa | 11/13 models below 50% accuracy at 32K | ICML 2025 |
| RULER (NVIDIA) | Effective = 50–65% of advertised | COLM 2024 |
| Context Rot (Chroma) | 18/18 models degrade; shuffled text beats coherent | 2025 |
| Lost in the Middle | >30% drop mid-context | TACL 2024 |

Don't stuff documents in and hope. Treat context as a finite resource with non-linear quality decay.

---

## Control what the model writes

Output tokens cost 3–5x more than input (sequential generation vs. parallel input processing). This is the highest-leverage place to start.

**Cap `max_tokens` by task type.** Classification: 16–32. JSON extraction: 128–256. Summarization: 256–512. Analysis: 512–1,024.

**Control thinking budgets.** DeepSeek-R1 averages ~12K thinking tokens per math question. Without a cap, reasoning pipelines cost 10–30x what you'd expect from visible output alone.

**Use structured output.** JSON schema reduces output ~15% and eliminates parsing retries.

<details>
<summary><strong>Research: thinking budget techniques</strong></summary>

**TALE (ACL 2025)** auto-estimates per-task budget: 67% fewer output tokens, 59% cost reduction, 80% accuracy preserved.

**Chain of Draft (arXiv 2025)** — add one sentence to your prompt: *"Think step by step, but only keep a minimum draft for each thinking step."* Uses 7.6% of standard CoT tokens at comparable accuracy. Zero infrastructure change.

SGLang's xgrammar constrained decoding guarantees valid JSON with zero retry overhead.
</details>

---

## Structure prompts for prefix caching

The model has no memory between calls. Every request sends the **entire conversation as one flat token sequence** — system prompt, all previous turns, new message. Every token gets KV-computed before the model can output anything.

**Prefix caching** reuses KV vectors when the first N tokens match a previous request. Anthropic gives **90% off** cached tokens. OpenAI 50%. Google 75%. You just need to structure prompts so the static prefix is as large as possible.

**The rule:** static content first (system prompt, schema, few-shot examples), dynamic content last (conversation history, new message). Everything above the cache boundary must be byte-for-byte identical across requests.

<details>
<summary><strong>Code example: cache-hostile vs cache-friendly</strong></summary>

```python
# ❌ Cache-hostile — dynamic content at the top
messages = [
    {
        "role": "system",
        "content": f"""
            Current time: {datetime.now()}     # ← breaks cache every call
            User ID: {user_id}                 # ← breaks cache per user
            You are a helpful assistant...
            [800 tokens of static instructions]
        """
    },
    *conversation_history,
    {"role": "user", "content": user_message}
]
```

```python
# ✓ Cache-friendly — static prefix locked, dynamic at bottom
messages = [
    {
        "role": "system",
        "content": """
            You are a helpful assistant.
            [Instructions, rules, schema — never changes]
            [Few-shot examples — never changes]
        """,
        "cache_control": {"type": "ephemeral"}  # Anthropic API
    },
    *conversation_history,
    {"role": "user", "content": user_message}
]
```

**What breaks the cache:** timestamps or user IDs above the boundary, rotating few-shot examples, dynamic personalization in the system prompt. If you need personalization, put it in a user-turn message below the boundary.
</details>

**Skill templates** take this further. For recurring tasks (reports, deployments, code reviews), the model spends thinking tokens rewriting the user's request into a form it can reason about — every time. A pre-built template eliminates this translation cost. Combined with prefix caching, skill templates hit cache from the second call: **10% input cost, near-zero thinking overhead.**

---

## Manage context over time

Even with perfect prompt structure, context grows. Active management keeps quality high and costs linear.

**Compaction.** Summarize history into a compact block and reset. Proactive compaction beats automatic — the model's recall is still intact and can be guided toward what matters. Write state to a JSON file, spawn a fresh context that reads it.

**Subgoal-based chunking.** **HiAgent (ACL 2025)** compresses completed subgoal history into short summaries. Result: 2x success rate on long-horizon tasks, 35% context reduction.

**Hierarchical memory.** Three layers: working memory (current window) → session memory (today's summary) → long-term memory (persistent facts). The [Letta/MemGPT](https://github.com/letta-ai/letta) framework validates this — the LLM self-manages context through function calls to page data in and out.

**KG-RAG for history.** Instead of keeping all history in context, use [HippoRAG](https://github.com/OSU-NLP-Group/HippoRAG) (NeurIPS 2024) to build a knowledge graph across sessions and retrieve by semantic query. 10–30x cheaper than iterative RAG.

<details>
<summary><strong>When to reset a conversation</strong></summary>

| Utilization | Action |
|---|---|
| <50% | Keep going — near-baseline accuracy |
| 50–70% | Monitor; compact at a natural break |
| 70–85% | Compact now — measurable quality loss |
| >85% | Reset — severe degradation |

**Signals that mean reset now:** model asks for information already provided, generated code contradicts earlier decisions, suggests previously rejected solutions, enters a fix-break-fix loop.
</details>

---

## Route intelligently

Routing isn't just about sending easy queries to cheap models. It **directly improves cache efficiency** across the entire system.

### Why routing multiplies savings

When a router dispatches to specialized sub-agents, each sub-agent gets a **stable, task-specific prompt template** and a **fresh context window**. Because every request to "Agent A" shares the exact same system prompt prefix, the KV cache is computed once and reused — **cache hit rates approach 100%** for the system prompt portion. The router effectively pre-warms cached templates for all downstream agents.

Two independent savings: cheaper models for simple tasks *and* better cache utilization for all tasks.

### Tencent ADP: proof at scale

Tencent's Agent Development Platform ships an **Intent Classifier node** (意图识别节点) as a first-class building block. User message enters → intent classifier (LLM with constrained prompt) produces a label → conditional branching routes to a specialized sub-graph with its own system prompt, tools, and knowledge base. Deployed across WeChat Pay and QQ Music customer service. The same pattern appears in ByteDance's Coze, Baidu's AppBuilder, and Dify — intent-based routing is now a standard production primitive.

The cache benefit is structural: each branch has a stable prompt template, so prefix caching kicks in automatically from the second request per intent category.

### Building a router: four options

| Approach | How | Latency / Cost |
|---|---|---|
| **Embedding similarity** | [Semantic Router](https://github.com/aurelio-labs/semantic-router) — define intents with example utterances, route via cosine similarity. No LLM call. | <5ms / free |
| **Small local LLM** | Run Qwen2.5-1.5B or Phi-3-mini via [Ollama](https://github.com/ollama/ollama). System prompt lists intents, model returns a label. This is Tencent ADP's approach. | 50–150ms / free |
| **Learned router** | [RouteLLM](https://github.com/lm-sys/RouteLLM) (ICLR 2025) — trained on Chatbot Arena preference data. 95% of GPT-4 quality, 85% cost reduction. | ~50ms / free |
| **Cascading** | AutoMix (ICML 2024) — try cheapest model first, self-verify confidence, escalate if uncertain. Up to 98% cost reduction. | Varies |

**Start with:** embedding similarity for high-confidence matches + local LLM for ambiguous cases + frontier API only when both are uncertain.

---

## Open-source stack

```text
User request
    │
    ▼
Qdrant semantic cache  ─── hit? → return cached response
    │ miss
    ▼
Ollama (Qwen2.5-1.5B)  ─── intent classification → skill_id
    │
    ▼
LiteLLM proxy
    ├── budget check (per-key caps)
    ├── inject skill template        ← prefix cached after first call
    ├── attach memory context        ← HippoRAG / Letta retrieval
    │
    ├── simple task  → SGLang (self-hosted 7B)
    ├── medium task  → RouteLLM decides
    └── complex task → frontier API (Anthropic / OpenAI)
              │
              ▼
        Letta memory manager
              ├── update session memory
              ├── extract to long-term store
              └── trigger compaction at 70% utilization
```

> **Start with** LiteLLM + Ollama + Qdrant. That handles routing, semantic caching, and budget control. Add Letta and HippoRAG once you have multi-turn agents that need persistent memory.

<details>
<summary><strong>Full tool list with links</strong></summary>

**Routing:** [LiteLLM](https://github.com/BerriAI/litellm) (MIT) — unified proxy, caching, budget caps. [RouteLLM](https://github.com/lm-sys/RouteLLM) (Apache 2.0) — learned router. [Semantic Router](https://github.com/aurelio-labs/semantic-router) (MIT) — embedding-based.

**Inference:** [SGLang](https://github.com/sgl-project/sglang) (Apache 2.0) — RadixAttention, 6.4x throughput. [Ollama](https://github.com/ollama/ollama) (MIT) — local models. [vLLM](https://github.com/vllm-project/vllm) (Apache 2.0) — PagedAttention.

**Compression:** [LLMLingua](https://github.com/microsoft/LLMLingua) (MIT) — 20x compression, <1.5% accuracy loss.

**Memory:** [Letta](https://github.com/letta-ai/letta) (Apache 2.0) — hierarchical memory. [HippoRAG](https://github.com/OSU-NLP-Group/HippoRAG) (Apache 2.0) — KG-RAG. [Qdrant](https://github.com/qdrant/qdrant) (Apache 2.0) — vector DB. [Chroma](https://github.com/chroma-core/chroma) (Apache 2.0) — simpler vector store.
</details>

---

## What to do, in order

| # | Action | Effort | Savings |
|---|---|---|---|
| 1 | Prompt structure — static first, dynamic last | Low | 60–90% input cost |
| 2 | Cap `max_tokens` + Chain of Draft | Low | 59–92% output cost |
| 3 | Thinking budget on reasoning models | Low | 10–30x on reasoning calls |
| 4 | Intent routing via Ollama + LiteLLM | Medium | 3–10x model cost |
| 5 | Subgoal chunking + proactive compaction | Medium | 35%+ context reduction |
| 6 | KG-RAG for conversation history | Medium | >90% vs full-context |
| 7 | Hierarchical memory via Letta | High | Long-horizon task quality |

**All combined: 90–95% savings vs. a naive single-model pipeline.**

The most important thing: output tokens cost 3–5x more than input. Controlling what the model *writes* saves more than all input-side optimizations combined.

---

## References

1. TALE — Han et al., ACL 2025, arXiv:2412.18547
2. Chain of Draft — Xu et al., arXiv:2502.18600, 2025
3. Unified Routing & Cascading — Dekoninck et al., ICLR + ICML 2025, arXiv:2410.10347
4. RouteLLM — Ong et al., ICLR 2025, arXiv:2406.18665
5. HiAgent — Hu et al., ACL 2025
6. NoLiMa — Adobe Research, ICML 2025, arXiv:2502.05167
7. LongBench v2 — Tsinghua, ACL 2025, arXiv:2412.15204
8. HippoRAG — Gutiérrez et al., NeurIPS 2024, arXiv:2405.14831
9. Context Rot — Chroma Research, 2025
10. Lost in the Middle — Liu et al., TACL 2024, arXiv:2307.03172
11. MemGPT / Letta — Packer et al., arXiv:2310.08560
12. SGLang — Zheng et al., NeurIPS 2024, arXiv:2312.07104
13. Effective Context Engineering for AI Agents — Anthropic Engineering Blog, 2025
14. AutoMix — Madaan et al., ICML 2024
