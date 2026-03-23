+++
date = '2026-03-23'
draft = false
title = 'Two Roads to AI Agents: Code or Markdown?'
description = 'Agent SDKs vs Agent Skills — two paradigms for building AI agents, when each makes sense, and why the real answer is both.'
tags = ['ai', 'llm', 'agents', 'skills', 'sdk']
+++

The same task, two radically different approaches. One says "write code to orchestrate the LLM." The other says "write markdown to teach it." Both produce agents that reason, use tools, and complete complex work. Knowing when to reach for which is the skill that matters in 2026.

## The SDK Way: Agents as Code

Agent SDKs — [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/), [Claude Agent SDK](https://docs.anthropic.com/en/docs/agents-and-tools/agent-sdk), [LangGraph](https://www.langchain.com/langgraph), [CrewAI](https://www.crewai.com/) — let you build agents programmatically. You register tools as functions, write instructions, and the SDK runs the loop: prompt the LLM, execute tool calls, feed results back, repeat.

```python
agent = Agent(
    name="Triage",
    instructions="Route to the right specialist.",
    handoffs=[billing_agent, tech_agent]
)
Runner.run(agent, messages=[user_message])
```

Each framework differentiates on orchestration patterns — handoffs, state graphs, role-based crews — but underneath they all run the same loop: reason, act, observe, repeat.

SDKs give you **control**. Branching logic, retry policies, multi-agent coordination, tracing, tests. Production concerns that need deterministic code, not probabilistic interpretation.

The cost: you need developers, you ship code, you maintain infrastructure. Changing what the agent does means changing code and redeploying.

## The Skills Way: Agents as Knowledge

Skills flip it. Instead of coding the orchestration, you write a `SKILL.md` file — markdown with instructions that load into the agent's context when relevant.

```markdown
---
name: database-migration
description: Guide safe database migrations
---
1. Generate a rollback script before applying
2. Run against staging first
3. Verify row counts post-migration
```

No orchestration code. No deployment. Just version-controlled knowledge that reshapes what the agent knows. Edit the file, behavior changes immediately.

This pattern started in Claude Code and spread fast. By late 2025, GitHub Copilot, OpenAI Codex, and Cursor all adopted the [SKILL.md spec](https://agentskills.io/specification). Write once, run on any compliant agent.

The architecture is efficient — **progressive disclosure**. Twenty installed skills cost ~2K tokens at idle. Only the relevant ones expand into full instructions when needed.

Skills give you **accessibility**. Anyone who writes markdown can shape agent behavior. Portable across platforms, composable without code, living in git next to the code they support.

The cost: no branching logic, no error recovery, no state machines. When the agent misinterprets a skill, debugging is opaque.

## The Tool Layer: MCP vs Just Use the Terminal

Both approaches need tools — the concrete actions an agent can take. This is where it gets interesting.

**[MCP (Model Context Protocol)](https://modelcontextprotocol.io/)** standardizes tool discovery and invocation. Anthropic launched it, OpenAI and Google adopted it. Thousands of MCP servers exist for databases, APIs, cloud services. It's the USB-C of agent tools.

But here's the thing: **in terminal-native environments, MCP is often overkill.**

Claude Code, Cursor, Codex CLI — these agents already have a shell. Every CLI tool on the system PATH is already a "tool." Why wrap `psql` in an MCP server when the agent can run `psql -c "SELECT ..."` directly? Why build a GitHub MCP server when `gh` exists?

This creates a split:

| | Sandboxed Agents (ChatGPT, API) | Terminal-Native Agents (Claude Code, Codex CLI) |
|---|---|---|
| **Tools** | MCP servers (required) | Shell is the tool layer; MCP optional |
| **Knowledge** | Skills / system prompts | Skills + CLAUDE.md + rules files |
| **Orchestration** | Agent SDKs | SDK or the agent itself |

Terminal-native agents collapse the tool layer. The shell *is* the universal protocol. `jq` replaces a JSON MCP server. `kubectl` replaces a Kubernetes MCP server. `gh` replaces a GitHub MCP server.

MCP's lasting value may not be as a runtime protocol but as a **discovery and documentation standard** — describing what tools exist and how to call them, even when the agent invokes them via bash.

## The Convergence

The most interesting trend isn't choosing sides — it's the merger.

OpenAI's Agents SDK now loads skills natively. Skills can include `scripts/` directories with executable code. Production systems use SDK orchestration for the control plane while loading skills for domain-specific execution.

The emerging architecture is layered:

- **Skills** handle what the agent knows about a domain
- **Shell or MCP** handle what actions the agent can take
- **SDKs** handle how the agent coordinates and recovers

## When to Use What

**Reach for skills when:** non-developers need to shape agent behavior, workflows are knowledge-driven and mostly linear, you want cross-platform portability, or you're iterating fast on *what* the agent should do.

**Reach for an SDK when:** you need multi-agent coordination with explicit handoffs, error recovery and retry logic are critical, you need observability and tracing in production, or deterministic control flow matters.

**Reach for both when:** you're building something real. SDK orchestration loading skills dynamically is the production pattern.

## The Pattern Behind the Pattern

This mirrors a recurring theme in software: **declarative vs imperative**. CSS vs JavaScript. SQL vs procedural data access. Terraform vs shell scripts.

The declarative approach wins for the common case. The imperative approach remains essential at the edges. Skills will handle 80% of agent customization. SDKs will handle the 20% that needs precise control.

The developer who understands both layers — and knows which to reach for — builds better agents than the one who only knows one.
