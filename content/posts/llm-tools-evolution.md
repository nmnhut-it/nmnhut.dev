+++
date = '2026-03-03'
draft = false
title = 'From Raw Text to Agent Teams: How LLM Tooling Evolved'
description = 'The full evolution of LLM tool use — from hardcoded functions to MCP, skills, agent teams, and communication protocols.'
tags = ['ai', 'llm', 'agents', 'mcp']
+++

LLMs can't call tools. They just **predict the next token**. When a model "calls a function," it outputs structured text like `{"name": "get_weather", "arguments": {"city": "Tokyo"}}`. A host app executes it and feeds the result back. Everything below is scaffolding around this trick.

## The Evolution

```
Hardcoded Functions → Tool Servers → MCP → Skills → Agents → Teams
```

### Stage 1–2: From Hardcoded to Servers

- **Stage 1** — Tools live in your codebase. You write `get_weather()`, describe it in the system prompt, parse the model's output. Every new tool = redeploy.
- **Stage 2** — Move tools to standalone HTTP services. Better separation, reusable across apps. But **no standard** — every server has its own API format.

### Stage 3: MCP — USB for AI Tools

[Anthropic's Model Context Protocol](https://www.anthropic.com/news/model-context-protocol) (late 2024): one open standard for connecting models to tools, data, and prompts.

```
┌──────────────┐     MCP      ┌─────────────┐
│   AI App     │◄────────────►│  MCP Server  │
│              │  (standard)  │  (Slack/DB/  │
│              │              │   Git/...)   │
└──────────────┘              └─────────────┘
```

- **Tools** — callable functions
- **Resources** — readable data (files, docs, DB rows)
- **Prompts** — reusable templates with domain knowledge

Build once, connect anywhere. Ecosystem exploded fast.

### Stage 4: The 80% Waste Problem

MCP made adding tools *too* easy. Tool descriptions eat context window space — **even when unused**.

```
╔══════════════════════════════════════════╗
║           Context Window                 ║
║  ┌────────┐┌────────┐┌────────┐         ║
║  │ Slack  ││  DB    ││ Jira   │ ← idle  ║
║  │ tools  ││ tools  ││ tools  │         ║
║  └────────┘└────────┘└────────┘         ║
║  ┌────────┐                              ║
║  │  File  │ ← actually needed            ║
║  │ tools  │                              ║
║  └────────┘                              ║
║  ┌─────┐                                 ║
║  │Task │ ← squeezed                      ║
║  └─────┘                                 ║
╚══════════════════════════════════════════╝
     ~80% wasted on irrelevant tools
```

**More tools = less room to think.** The scaling curse of MCP.

### Stage 5: Skills — Load On Demand

**Solution:** lazy-load capabilities only when triggered.

- A skill bundles tools + domain knowledge + workflows + examples
- Activates on keyword match, deactivates when done
- Context stays clean

| Approach | 10 tools | 100 tools |
|---|---|---|
| Raw MCP | Heavy | Unworkable |
| Skills | Light | Still light |

### Stage 6–7: Agents and Teams

**Agent = Model + Memory + Skills.** Memory makes it *yours* (preferences, project context). Skills make it *capable*.

One agent hits limits on big tasks — finite context, sequential bottleneck, mixed focus. Solution: **teams**.

```
┌─────────┐   ┌─────────┐   ┌─────────┐
│  Lead   │──►│  Coder  │──►│ Tester  │
│(plan)   │   │(edit)   │   │(verify) │
└─────────┘   └─────────┘   └─────────┘
     ▲              │              │
     └──────────────┴──────────────┘
          isolated context each
```

### Stage 8: How Agents Talk

| Pattern | Used By | Tradeoff |
|---|---|---|
| Shared thread | AutoGen | Simple but context explodes |
| LLM delegation | CrewAI | Flexible but unpredictable |
| State graph | LangGraph | Deterministic but rigid |
| Task list + DMs | Claude Code | Structured and flexible |
| Queue + mentions | TinyClaw | Decentralized, no orchestrator |
| A2A protocol | Google | Cross-org interop |

**MCP** = agent ↔ tools (vertical). **A2A** = agent ↔ agent (horizontal).

---

*The LLM is still just predicting the next token. Everything else is scaffolding around that one simple trick.*
