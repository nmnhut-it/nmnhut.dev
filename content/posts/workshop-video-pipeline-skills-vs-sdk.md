+++
date = '2026-03-23'
draft = false
title = 'Workshop: Build an AI Video Pipeline — Skills vs SDK in Practice'
description = 'A thinking framework for deciding what belongs in code (SDK) vs markdown (Skill), illustrated through an educational video pipeline.'
tags = ['ai', 'llm', 'agents', 'skills', 'sdk', 'remotion', 'workshop']
+++

*Part 2 of [Two Roads to AI Agents](/posts/two-roads-to-ai-agents/). This time we apply the framework to something real.*

In Part 1, we drew the line between Agent SDKs (code orchestration) and Agent Skills (markdown knowledge). Now let's see where that line falls in practice. We'll walk through a pipeline that turns any article into a narrated MP4 — and at each step, I'll label whether it belongs in **SDK code** or **Skill knowledge**, and *why*.

For the full implementation with code, see [Building an AI Video Pipeline](/posts/educational-video-pipeline/).

---

## Step 1: Scaffold the renderer `[SDK]`

Remotion turns React components into video frames. You register a composition, set resolution and framerate, and point it at your component tree.

**Why SDK:** Rendering video is deterministic. You need frame-exact timing, typed slide schemas, and React components. No LLM should be improvising your render loop.

---

## Step 2: Define the slide schema `[SDK]`

Every slide is typed — nine types covering title, concept, code, diagram, flow, table, section-header, image, and outro. Each has a required `narration` field that feeds the audio pipeline.

See the [full schema definition](/posts/educational-video-pipeline/#step-2-design-the-slide-schema) for the TypeScript interfaces.

**Why SDK:** Schemas are contracts. You want TypeScript catching a missing `narration` field at compile time, not the LLM guessing at runtime.

---

## Step 3: Build slide components `[SDK]`

Each slide type gets a React component wrapped in a shared `SlideLayout` for consistent padding, progress bar, and theme. Animations use Remotion's `spring()` with staggered delays.

See the [component implementation](/posts/educational-video-pipeline/#step-3-build-the-slide-components) for the full code.

**Why SDK:** Animations need `spring()` functions, staggered delays, frame-level control. This is code territory.

---

## Step 4: Generate audio `[SDK]`

A TypeScript script calls ElevenLabs for each slide's narration, saves MP3s, and writes a timing manifest. The manifest drives Remotion's `durationInFrames` per slide — audio timing becomes frame timing.

See the [audio generation walkthrough](/posts/educational-video-pipeline/#step-4-generate-voice-narration-with-elevenlabs) for the API integration and manifest format.

**Why SDK:** API calls, rate limiting, error handling for 401/429, file I/O. This needs retry logic and deterministic execution.

---

## Step 5: Wire audio to video `[SDK]`

The composition reads the manifest and sequences slides using Remotion's `<Sequence>`. At this point you have a working pipeline — feed it a `video-script.json` and it renders an MP4.

But writing that JSON by hand is painful — 20+ slides, each with typed fields, narration in the right language. This is where the paradigm shifts.

---

## Step 6: Teach the agent `[SKILL]`

Create a `SKILL.md` that defines a conversational workflow: verify setup, get content from the user, ask preferences, generate the script JSON, preview it, then render. No code — just markdown telling Claude *what to do* and *in what order*.

See the [skill packaging guide](/posts/educational-video-pipeline/#step-7-package-it-as-a-claude-code-skill) for the file structure and workflow phases.

**Why Skill:** The *workflow* — what to ask, in what order, how to present the preview — is knowledge, not logic. It changes constantly ("ask about theme first", "add a review loop"). Editing markdown is faster than rewriting an orchestration SDK.

---

## Step 7: Add schema references `[SKILL]`

Drop the JSON schema and slide examples into the skill's `references/` folder. Claude reads these on demand — progressive disclosure keeps idle cost low (~100 tokens to advertise the skill, ~5K when active). **The user never touches JSON.** They say "add a code slide showing the fetch call" and Claude edits the script.

**Why Skill:** Reference docs are knowledge. They don't need to be compiled, tested, or deployed. They need to be accurate and readable.

---

## The Split

| Layer | Paradigm | What |
|-------|----------|------|
| Slide rendering | **SDK** | React + Remotion + TypeScript |
| Audio generation | **SDK** | ElevenLabs API + file I/O |
| Schema & types | **SDK** | TypeScript interfaces |
| Workflow orchestration | **Skill** | SKILL.md — what to ask, in what order |
| Script generation | **Skill** | Claude writes JSON, user speaks English |
| Tool invocation | **Terminal** | `npx`, `node` — no MCP needed |

The SDK parts haven't changed in months. The skill gets edited weekly — new slide types, better prompts, different review flows. That's the point. **Put stability in code, put iteration in markdown.**

---

**Source:** [github.com/nmnhut-it/educational-video-pipeline](https://github.com/nmnhut-it/educational-video-pipeline)

The two-paradigm split is the real takeaway here. Any AI-assisted pipeline has this same decision surface — deterministic work belongs in typed code, conversational workflow belongs in markdown. Knowing which is which before you start building saves you from rewriting one as the other later.
