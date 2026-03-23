+++
date = '2026-03-23'
draft = false
title = 'Workshop: Build an AI Video Pipeline — Skills vs SDK in Practice'
description = 'A hands-on workshop rebuilding an educational video pipeline, labeling each step as Agent SDK (code) or Agent Skill (markdown).'
tags = ['ai', 'llm', 'agents', 'skills', 'sdk', 'remotion', 'workshop']
+++

*Part 2 of [Two Roads to AI Agents](/posts/two-roads-to-ai-agents/). This time we build something real.*

In Part 1, we drew the line between Agent SDKs (code orchestration) and Agent Skills (markdown knowledge). Now let's blur it. We'll build a pipeline that turns any article into a narrated MP4 — and at each step, I'll label whether we're writing **SDK code** or **Skill knowledge**.

The finished product: say "make me a video about TCP/IP" to Claude Code, get a 1080p narrated video back.

---

## Step 1: Scaffold the renderer `[SDK]`

This is pure code. Remotion turns React components into video frames — no LLM involved.

```bash
npm init video -- --template blank
npm install remotion react react-dom
```

Register a composition in `src/Root.tsx`:

```tsx
import { Composition } from 'remotion';
import { EducationalVideo } from './compositions/EducationalVideo';

export const RemotionRoot = () => (
  <Composition
    id="EducationalVideo"
    component={EducationalVideo}
    fps={30}
    width={1920}
    height={1080}
    durationInFrames={300}
  />
);
```

**Why SDK:** Rendering video is deterministic. You need frame-exact timing, typed slide schemas, and React components. No LLM should be improvising your render loop.

---

## Step 2: Define the slide schema `[SDK]`

Every slide is typed. Nine types — title, concept, code, diagram, flow, table, section-header, image, outro:

```typescript
export enum SlideType {
  TITLE = "title",
  CONCEPT = "concept",
  CODE = "code",
  DIAGRAM = "diagram",
  // ...
}

interface SlideBase {
  id: string;          // "slide-01", "slide-02"
  type: SlideType;
  section: string;
  narration: string;   // text sent to ElevenLabs
}
```

**Why SDK:** Schemas are contracts. You want TypeScript catching a missing `narration` field at compile time, not the LLM guessing at runtime.

---

## Step 3: Build slide components `[SDK]`

Each type gets a React component. All wrap in `SlideLayout` for consistent padding, progress bar, and theme:

```tsx
export const ConceptSlide: React.FC<Props> = ({ data, slideIndex, totalSlides }) => (
  <SlideLayout slideIndex={slideIndex} totalSlides={totalSlides}>
    <AnimatedText delay={0}>
      <h2>{data.heading}</h2>
    </AnimatedText>
    {data.bullets.map((b, i) => (
      <AnimatedText key={i} delay={i * 8}>
        <p>• {b}</p>
      </AnimatedText>
    ))}
  </SlideLayout>
);
```

**Why SDK:** Animations need `spring()` functions, staggered delays, frame-level control. This is code territory.

---

## Step 4: Generate audio `[SDK]`

A TypeScript script calls ElevenLabs for each slide's narration, saves MP3s, and writes a timing manifest:

```typescript
const res = await fetch(
  `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`,
  {
    method: 'POST',
    headers: { 'xi-api-key': apiKey },
    body: JSON.stringify({ text: slide.narration, model_id: 'eleven_v3' }),
  }
);
const { audio_base64, alignment } = await res.json();
fs.writeFileSync(`public/audio/${slide.id}.mp3`, Buffer.from(audio_base64, 'base64'));
```

The manifest drives Remotion's `durationInFrames` per slide — audio timing becomes frame timing.

**Why SDK:** API calls, rate limiting (1.5s delays), error handling for 401/429, file I/O. This needs retry logic and deterministic execution.

---

## Step 5: Wire audio to video `[SDK]`

The composition reads the manifest and sequences slides:

```tsx
{slides.map((slide, index) => {
  const duration = slideDurations[index];
  return (
    <Sequence key={slide.id} from={frameOffset} durationInFrames={duration}>
      <SlideRenderer slide={slide} />
      <AudioTrack src={`audio/${slide.id}.mp3`} />
    </Sequence>
  );
})}
```

At this point you have a working pipeline. Feed it a `video-script.json` and it renders an MP4. But writing that JSON by hand is painful — 20+ slides, each with typed fields, narration in the right language. This is where the paradigm shifts.

---

## Step 6: Teach the agent `[SKILL]`

Create `.claude/skills/educational-video/SKILL.md`:

```markdown
---
name: educational-video
description: Turn any content into a narrated educational video
---

## Workflow
1. **Setup check** — verify Node.js, npm packages, ElevenLabs API key
2. **Get content** — user provides URL, file, pasted text, or topic
3. **Preferences** — ask language + light/dark theme
4. **Generate script** — write video-script.json following the schema
5. **Preview** — show slide plan, accept change requests
6. **Render** — run audio generation, then Remotion render
```

No code. Just markdown that tells Claude *what to do* and *in what order*. Claude uses the terminal to execute the SDK scripts:

```bash
npx tsx scripts/generate-audio.ts
npx remotion render EducationalVideo output/video.mp4
```

**Why Skill:** The *workflow* — what to ask, in what order, how to present the preview — is knowledge, not logic. It changes constantly ("ask about theme first", "add a review loop"). Editing markdown is faster than rewriting an orchestration SDK.

---

## Step 7: Add schema references `[SKILL]`

Drop `video-script-schema.json` and `slide-examples.json` into the skill's `references/` folder. Claude reads these on demand — progressive disclosure keeps idle cost low (~100 tokens to advertise the skill, ~5K when active).

The schema ensures Claude generates valid JSON. The examples show one of each slide type. **The user never touches JSON.** They say "add a code slide showing the fetch call" and Claude edits the script.

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

Clone it, install the skill, add your ElevenLabs key. One sentence to a narrated video.
