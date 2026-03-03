+++
date = '2026-03-03'
draft = false
title = 'From Raw Text to Agent Teams: How LLM Tooling Evolved'
description = 'The full evolution of LLM tool use — from hardcoded functions to MCP, skills, agent teams, and communication protocols.'
tags = ['ai', 'llm', 'agents', 'mcp']
+++

## LLMs Don't Actually "Call" Tools

Here is a fact that surprises most people: LLMs cannot run code. They cannot call APIs. They cannot read files. All they do is **predict the next token** — they output raw text, one piece at a time.

So how do they "use tools"?

The trick is simple. During training, models learn to output text in a **special format** when they want to use a tool. For example, instead of guessing an answer, a model might output something like:

```
<tool_call>
{"name": "get_weather", "arguments": {"city": "Tokyo"}}
</tool_call>
```

The model does not run this. It just writes it. A **parser** — a piece of ordinary software sitting between the model and the outside world — watches the output stream. When it spots this special format, it:

1. Stops the model
2. Extracts the tool name and arguments
3. Runs the actual function
4. Feeds the result back to the model as a new message
5. Lets the model continue

The model then reads the result and keeps generating text. To the end user, it looks like the AI "called a function." In reality, the AI wrote a structured wish, and the system granted it.

This is the foundation. Everything that follows is about making this loop better.

---

## Stage 1: Functions Hardcoded on the Server

The earliest tool-use systems were dead simple. You, the developer, would:

1. Write a Python function (e.g., `def get_weather(city): ...`)
2. Describe that function in the **system prompt** — "You have access to `get_weather(city)`. Call it when the user asks about weather."
3. Build a parser to catch the model's output and route it to your function

This worked. But it had problems:

- **Every tool lived in your codebase.** Want to add a database lookup? Write the function, redeploy.
- **The system prompt grew with every tool.** Ten tools meant a wall of text describing each one's name, parameters, and usage rules — all eating into the model's context window.
- **No sharing.** Your weather function was yours alone. Another developer building a similar app had to write their own from scratch.

Still, this was the moment LLMs went from "chat assistants" to "agents that can act." OpenAI formalized this as **Function Calling** in June 2023, giving it a structured JSON schema instead of freeform text in the system prompt. But the architecture remained the same: functions lived on your server, described in your prompt.

---

## Stage 2: Tool Servers — Moving Tools Out

The next step was obvious: **why keep tools in your app?** If a tool is just a function with inputs and outputs, it can live anywhere. Run it as a separate service. Call it over HTTP.

This gave rise to **tool servers** — standalone services that expose tools via APIs. Your app no longer needs to contain the tool code. It just needs to know the tool's URL, its schema, and how to call it.

Benefits:

- **Separation of concerns.** The AI app handles conversation. The tool server handles actions.
- **Reusability.** One tool server can serve many AI apps.
- **Independent scaling.** A heavy tool (like image generation) can run on beefy hardware while the chat app stays lightweight.

But there was no standard. Every tool server had its own API format, its own auth scheme, its own way of describing capabilities. Connecting your AI app to three different tool servers meant writing three different integrations.

---

## Stage 3: MCP — A Universal Plug for Tools

In late 2024, Anthropic released the **Model Context Protocol (MCP)**. The idea: a single, open standard for connecting AI models to tools, data sources, and external systems.

Think of it like USB for AI. Before USB, every device had its own cable. MCP does the same thing for tools — one protocol, any tool, any model.

An MCP server exposes:

- **Tools** — functions the model can call
- **Resources** — data the model can read (files, database rows, API responses)
- **Prompts** — reusable prompt templates

Any AI app that speaks MCP can connect to any MCP server. A developer builds a Slack MCP server once, and every MCP-compatible AI app can use it. No custom integration needed.

MCP gained traction fast. GitHub, Postgres, Slack, Google Drive — community-built MCP servers popped up for everything. The ecosystem exploded.

But then came a new problem.

---

## Stage 4: The Context Window Problem

MCP made it easy to add tools. *Too* easy.

Each MCP server comes with instructions: "Here is what I can do. Here is how to call me. Here are the rules." When you connect five MCP servers, the model's context window fills up with tool descriptions, usage instructions, and server metadata — even when most of them are irrelevant to the current task.

Imagine a developer asking the AI to fix a bug in a Python file. The model's context already contains instructions for:

- A Slack MCP server (not needed right now)
- A database MCP server (not needed right now)
- A Jira MCP server (not needed right now)
- A browser automation MCP server (not needed right now)
- A file system MCP server (finally, the one it needs)

80% of the context window is wasted on tools the model won't use for this task. And context window space is precious — it is the model's working memory. Every token spent on irrelevant tool descriptions is a token not available for understanding the actual problem.

This is the **scaling curse of MCP**: the more capable your agent becomes, the less room it has to think.

---

## Stage 5: Skills — Tools on Demand

The solution? **Don't load everything upfront. Load what you need, when you need it.**

This is the idea behind **skills**. A skill is a bundle of instructions, tools, and context that gets injected into the model's context **only when triggered**. Think of it as a lazy-loaded capability.

Instead of permanently stuffing the context with "here is how to use Jira," you register a skill:

- **Name:** `jira`
- **Trigger:** When the user mentions Jira, tickets, or sprint planning
- **Payload:** The full set of instructions, tool schemas, and examples needed to work with Jira

When the model encounters a Jira-related request, the skill activates and its payload enters the context. When the task is done, the payload leaves. The context stays clean.

Skills solve the scaling problem:

| Approach | Context cost | 10 tools | 100 tools |
|---|---|---|---|
| Raw MCP | All tools always loaded | Heavy | Unworkable |
| Skills | Only active tools loaded | Light | Still light |

Now an agent can have access to hundreds of capabilities without choking its context window. The shift is from "know everything" to "know how to find what you need."

---

## Stage 6: One Agent = Memory + Skills

With skills in place, we can define what a modern AI agent actually is:

> **An agent = a model + memory + a set of skills**

- **Model**: The LLM brain that reasons and generates text
- **Memory**: Persistent knowledge that survives across conversations — user preferences, project context, past decisions
- **Skills**: On-demand capabilities that activate when needed

Memory is what makes an agent *yours*. Without memory, every conversation starts from zero. With memory, the agent remembers that you prefer TypeScript over JavaScript, that your database is Postgres, that your team uses conventional commits.

Skills are what makes an agent *capable*. Without skills, the agent can only chat. With skills, it can commit code, manage PRs, query databases, browse the web — whatever skills are available.

This is a clean, scalable architecture. One agent, focused context, relevant tools loaded on demand, persistent knowledge.

But one agent has limits.

---

## Stage 7: Teams of Agents

Some tasks are too big for one agent. Not because the model isn't smart enough, but because:

- **Context windows are finite.** A single agent working on a large codebase will eventually run out of room.
- **Sequential work is slow.** One agent reading 50 files, then planning, then coding, then testing — that is a long chain.
- **Different tasks need different focus.** Research requires broad exploration. Coding requires deep file-level attention. Testing requires running commands and reading output. One agent juggling all three loses focus.

The answer: **teams of agents**, each with their own context window, their own memory, and their own skills.

A typical team might look like:

| Agent | Role | Skills |
|---|---|---|
| Lead | Coordinates work, synthesizes results | Task management, messaging |
| Researcher | Explores the codebase, reads docs | Search, web browsing |
| Coder | Writes and edits code | File editing, code generation |
| Tester | Runs tests, reports results | Test execution, log analysis |

Each agent runs as an independent process. They don't share a context window. They each start clean and focused on their assigned task.

But this creates a new problem: **how do they talk to each other?**

---

## Stage 8: The Communication Problem

The moment you have multiple agents, you need answers to hard questions:

- How does Agent A tell Agent B what to do?
- How does Agent B report results back?
- How do they avoid stepping on each other's work?
- How does the team know when everything is done?

Different systems answer these questions differently. Here are the main approaches that exist today.

### Approach 1: Shared Conversation Thread

**Used by:** Microsoft AutoGen

The simplest model. All agents share one message thread. Every agent can see what every other agent has said. A selector (either round-robin or model-based) picks who speaks next.

```
Agent A: "I found the bug in auth.py line 42."
Agent B: "I'll write a fix."
Agent C: "I'll write a test for the fix."
```

**Pros:** Simple. Full visibility. Easy to debug.
**Cons:** Context grows fast. With 5 agents and 100 messages, every agent carries the full conversation — even the parts that don't concern it. Expensive and wasteful at scale.

### Approach 2: LLM-Driven Delegation

**Used by:** CrewAI

Agents don't share a thread. Instead, when Agent A needs help, it uses a delegation tool — essentially asking the LLM to compose a message to a specific teammate.

```
Agent A calls: delegate_work(task="fix the bug", coworker="Coder", context="bug is in auth.py line 42")
```

The framework routes this to the Coder agent, which works on it and returns a result.

**Pros:** Natural. Agents decide when and what to delegate.
**Cons:** Unpredictable. The LLM decides when to delegate, so you can't guarantee it will. No structured lifecycle — you can't track whether a delegated task is pending, in-progress, or done.

### Approach 3: State Graph

**Used by:** LangGraph

The developer defines a **graph** where each node is an agent and each edge is an allowed transition. State flows through the graph as typed data. Agents hand off control explicitly using `Command` objects that specify both a state update and the next agent to run.

```
Researcher → Planner → Coder → Tester → (back to Planner if tests fail)
```

**Pros:** Deterministic. Auditable. You know exactly what happens and in what order.
**Cons:** Rigid. You must design the graph upfront. Agents can't self-organize or adapt the workflow at runtime.

### Approach 4: Task List + Direct Messages

**Used by:** Claude Code Agent Teams

Each team has a **shared task list** stored on disk. Agents claim tasks, work on them, and mark them done. For direct communication, agents use a **message tool** to send messages to specific teammates.

```
Lead creates task: "Fix auth bug" → status: pending
Coder claims task → status: in_progress
Coder finishes → status: completed → sends message to Lead: "Fixed. See commit abc123."
Lead reads message, checks task list, assigns next work.
```

Tasks support **dependencies** — Task B can be blocked by Task A, and automatically unblocks when A completes.

**Pros:** Structured and flexible. Tasks track lifecycle. Agents work independently without a shared context. The lead doesn't bottleneck communication — agents can message each other directly.
**Cons:** Requires discipline. Agents must remember to update task status. An agent that forgets to mark a task done can block the whole team.

### Approach 5: Queue-Based Actor Model with Mention Parsing

**Used by:** TinyClaw

What if agents could coordinate using **natural language mentions** — just like humans do on Slack or Discord?

TinyClaw takes this approach. There is no central orchestrator. Instead, agents communicate by writing **mention tags** directly in their responses:

```
I fixed the bug in auth.ts.
[@reviewer: Please review the changes in auth.ts for security issues.]
[@tester: Run the test suite after the review is done.]
```

A parser extracts these tags, and the system enqueues internal messages to the target agents via a **shared SQLite queue**. Each agent has its own isolated workspace and processes messages sequentially through a promise chain — but different agents run in parallel.

The coordination relies on a **pending counter**. When an agent mentions a teammate, the counter increments. When a teammate finishes (with no further mentions), it decrements. When it hits zero, the conversation is complete and all responses are aggregated.

```
User: "@dev fix the auth bug"
  → Coder (team leader) receives message          pending: 1
  → Coder responds, mentions @reviewer            pending: 1
  → Reviewer responds, mentions @tester            pending: 1
  → Tester responds (no mentions)                  pending: 0 → COMPLETE
  → Aggregated response sent back to user
```

Text written *outside* mention tags becomes **shared context** — delivered to all mentioned agents. This lets an agent broadcast background information while sending targeted instructions:

```
Sprint ends Friday. 3 open bugs remain.
[@coder: Focus on the auth bug first.]
[@reviewer: Prioritize any open PRs.]
```

Both agents receive the shared context plus their specific message.

**Pros:** No orchestrator needed. Natural language mentions feel intuitive. SQLite queue is durable (survives crashes, supports retries). Supports fan-out, backflow, and cross-talk — all through the same queue-and-counter mechanism.

**Cons:** Agents must follow the mention format correctly. No structured task lifecycle — you can't query whether a piece of work is "pending" or "in progress" like you can with a task list.

### Approach 6: An Open Protocol — Google's A2A

**Announced:** April 2025 | **Governed by:** Linux Foundation (since June 2025)

All the approaches above work within a single framework. But what if your agents are built by different companies, running on different servers, using different models?

Google's **Agent-to-Agent (A2A)** protocol tackles this. It is an open standard for agents to discover each other, authenticate, and exchange work — across organizational boundaries.

The key concepts:

1. **Agent Cards** — Every agent publishes a JSON file at `/.well-known/agent.json` describing what it can do, like a machine-readable resume.
2. **Tasks** — Structured work units that move through a lifecycle: `submitted → working → completed / failed`.
3. **Messages and Parts** — The communication units within a task, supporting text, images, audio, and other modalities.
4. **Streaming** — Long-running tasks use Server-Sent Events (SSE) for real-time progress updates.

A2A is designed to complement MCP, not replace it:

- **MCP** = how an agent connects to tools (vertical)
- **A2A** = how an agent connects to other agents (horizontal)

As of early 2026, A2A has strong enterprise backing (AWS, Microsoft, Salesforce, SAP) but MCP has won more grassroots developer adoption. The two may converge over time — tools and agents are just different points on the same spectrum.

---

## The Full Picture

Let's zoom out and see how all the pieces fit together:

```
┌─────────────────────────────────────────────────┐
│                  Agent Team                      │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ Agent A   │  │ Agent B   │  │ Agent C   │      │
│  │ (Lead)    │  │ (Coder)   │  │ (Tester)  │      │
│  │          │  │          │  │          │       │
│  │ Memory   │  │ Memory   │  │ Memory   │       │
│  │ Skills   │  │ Skills   │  │ Skills   │       │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘       │
│       │              │              │             │
│       └──────── Communication ──────┘             │
│         (Messages / Tasks / A2A)                  │
└───────────────────────┬─────────────────────────┘
                        │
                   Skills activate
                   on demand
                        │
              ┌─────────┼─────────┐
              │         │         │
          ┌───┴───┐ ┌───┴───┐ ┌──┴────┐
          │ MCP   │ │ MCP   │ │ MCP   │
          │Server │ │Server │ │Server │
          │(Slack)│ │(DB)   │ │(Git)  │
          └───────┘ └───────┘ └───────┘
```

The evolution, in one line:

> **Hardcoded functions → Tool servers → MCP (standard plug) → Skills (on-demand loading) → Agents (memory + skills) → Teams (multiple agents) → Communication protocols (how they coordinate)**

Each layer solved the previous layer's problem. Each layer created a new one. And that is how we got here.

---

*The LLM is still just predicting the next token. Everything else — tools, skills, memory, teams, protocols — is scaffolding we built around that one simple trick.*
