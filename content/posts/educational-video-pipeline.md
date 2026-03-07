+++
date = '2026-03-07'
draft = false
title = 'Building an AI Video Pipeline: From Text to Narrated MP4 with Remotion and ElevenLabs'
description = 'How I built a pipeline that turns any article, blog post, or PowerPoint into a narrated educational video — and packaged it as a Claude Code skill anyone can use.'
tags = ['ai', 'remotion', 'elevenlabs', 'claude', 'typescript', 'video']
+++

I wanted a way to turn my blog posts into narrated videos without spending hours in video editors. What I ended up building was a full pipeline: give it an article, a URL, or a PowerPoint file — get back a 1080p MP4 with animated slides, syntax-highlighted code blocks, and an AI voiceover in any language.

The whole thing is open source: [github.com/nmnhut-it/educational-video-pipeline](https://github.com/nmnhut-it/educational-video-pipeline).

This post walks through how it works and how you can build your own.

---

## The architecture

Three tools do the heavy lifting:

- **[Remotion](https://remotion.dev)** — renders React components to video frames. You write slides as React components; Remotion turns them into MP4.
- **[ElevenLabs](https://elevenlabs.io)** — generates voice narration from text with character-level timestamps, so the video knows exactly how long each slide's audio lasts.
- **[Claude Code](https://claude.ai/code)** — orchestrates the whole thing conversationally. You say "make me a video about X", Claude writes the slide script, runs the audio generation, and fires the renderer.

The data flow is:

```
source content
  → Claude generates video-script.json
    → ElevenLabs generates per-slide MP3s + timing manifest
      → Remotion renders slides sequenced to audio timing
        → output/<slug>.mp4
```

---

## Step 1: Set up Remotion

Bootstrap a new project:

```bash
npm init video
cd my-video-pipeline
npm install
```

The key file is `src/Root.tsx` — this is where you register your compositions with Remotion:

```tsx
import { Composition } from 'remotion';
import { EducationalVideo } from './compositions/EducationalVideo';
import videoScript from '../content/video-script.json';
import audioManifest from '../public/audio/manifest.json';

export const RemotionRoot = () => (
  <Composition
    id="EducationalVideo"
    component={EducationalVideo}
    fps={30}
    width={1920}
    height={1080}
    durationInFrames={computeTotalFrames(audioManifest)}
    defaultProps={{ audioManifest }}
  />
);
```

The `durationInFrames` is computed from the audio manifest — each slide gets exactly as many frames as its narration takes, plus a small tail padding.

---

## Step 2: Design the slide schema

Define a typed JSON schema for your video scripts. Every slide has a `type`, an `id`, a `section`, and `narration`. Different types add their own fields:

```typescript
export enum SlideType {
  TITLE = "title",
  SECTION_HEADER = "section-header",
  CONCEPT = "concept",
  CODE = "code",
  DIAGRAM = "diagram",
  FLOW = "flow",
  TABLE = "table",
  OUTRO = "outro",
  IMAGE = "image", // for PPTX-sourced slides
}

interface SlideBase {
  id: string;        // "slide-01", "slide-02", ...
  type: SlideType;
  section: string;   // groups slides for transition effects
  narration: string; // text sent to ElevenLabs
}

export interface ConceptSlideData extends SlideBase {
  type: SlideType.CONCEPT;
  heading: string;
  bullets: string[];
  highlight?: string;
}
// ... one interface per slide type
```

A minimal video script looks like:

```json
{
  "title": "How REST APIs Work",
  "slides": [
    {
      "id": "slide-01",
      "type": "title",
      "section": "Introduction",
      "narration": "Welcome. Today we're building a REST API from scratch.",
      "title": "How REST APIs Work",
      "subtitle": "A practical guide"
    },
    {
      "id": "slide-02",
      "type": "concept",
      "section": "Concepts",
      "narration": "REST APIs communicate over HTTP using a few standard verbs.",
      "heading": "The Four HTTP Methods",
      "bullets": ["GET — read", "POST — create", "PUT — update", "DELETE — remove"]
    }
  ]
}
```

---

## Step 3: Build the slide components

Each slide type is a React component that renders into a 1920×1080 canvas. The key pattern is a `SlideLayout` wrapper that handles the background, padding, and progress bar:

```tsx
export const ConceptSlide: React.FC<ConceptSlideProps> = ({
  data, slideIndex, totalSlides,
}) => {
  return (
    <SlideLayout slideIndex={slideIndex} totalSlides={totalSlides}>
      <AnimatedText delay={0}>
        <h2 style={{ fontSize: FONT_SIZES.HEADING, color: COLORS.TEXT_PRIMARY }}>
          {data.heading}
        </h2>
      </AnimatedText>
      {data.bullets.map((bullet, i) => (
        <AnimatedText key={i} delay={i * 8}>
          <p>• {bullet}</p>
        </AnimatedText>
      ))}
    </SlideLayout>
  );
};
```

`AnimatedText` uses Remotion's `spring()` to fade and slide content in with staggered delays. `COLORS` and `FONT_SIZES` come from a central `constants.ts` — never hardcode values in components.

The top-level `EducationalVideo` composition sequences all slides using Remotion's `<Sequence>`:

```tsx
{slides.map((slide, index) => {
  const duration = slideDurations[index]; // from audio manifest
  const offset = frameOffset;
  frameOffset += duration;

  return (
    <Sequence key={slide.id} from={offset} durationInFrames={duration}>
      <SlideRenderer slide={slide} slideIndex={index} totalSlides={totalSlides} />
      <AudioTrack src={`audio/${slide.id}.mp3`} />
    </Sequence>
  );
})}
```

---

## Step 4: Generate voice narration with ElevenLabs

ElevenLabs has a `/text-to-speech/{voiceId}/with-timestamps` endpoint that returns both the MP3 audio and character-level timing data. This is the key to tight audio-video sync.

```typescript
const response = await fetch(
  `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`,
  {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: slide.narration,
      model_id: 'eleven_v3',
      output_format: 'mp3_44100_128',
      voice_settings: { stability: 0.6, similarity_boost: 0.8, style: 0.2 },
    }),
  }
);

const { audio_base64, alignment } = await response.json();
fs.writeFileSync(`public/audio/${slide.id}.mp3`, Buffer.from(audio_base64, 'base64'));

// alignment.character_end_times_seconds[-1] gives total duration
const durationMs = Math.round(alignment.character_end_times_seconds.at(-1) * 1000);
```

After processing all slides, write a manifest:

```json
{
  "totalDurationMs": 423500,
  "slides": [
    { "slideId": "slide-01", "durationMs": 8200 },
    { "slideId": "slide-02", "durationMs": 12400 }
  ]
}
```

Remotion reads this manifest to compute `durationInFrames` per slide: `Math.ceil(durationMs / 1000 * fps) + tailPadding`.

Add a 1.5 second delay between API calls to stay within ElevenLabs rate limits.

---

## Step 5: Add a config system

Hard-coding paths and voice IDs breaks reusability. Add a `video.config.json`:

```json
{
  "narration": {
    "language": "en",
    "voiceId": "",
    "modelId": "eleven_v3",
    "voiceSettings": { "stability": 0.6, "similarityBoost": 0.8, "style": 0.2 }
  },
  "theme": "light",
  "scriptPath": "content/video-script.json",
  "outputPath": "output",
  "audioDir": "public/audio"
}
```

A `config-loader.ts` merges this with defaults and falls back to `.env` for the voice ID. Every script reads config through this loader, never directly from files.

---

## Step 6: Add PowerPoint support

For PPTX files, skip the Remotion components entirely — use the original slide images directly. Export each slide as a PNG, then reference them as `image`-type slides:

```json
{
  "id": "slide-03",
  "type": "image",
  "section": "Architecture",
  "narration": "This diagram shows the three-layer architecture...",
  "imagePath": "pptx-slides/Slide3.PNG"
}
```

**Critical:** Remotion can only serve assets from `public/`. Use `staticFile()` to resolve paths:

```tsx
import { staticFile } from 'remotion';

<img src={staticFile(data.imagePath)} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
```

Export PNGs using LibreOffice (cross-platform, free):
```bash
soffice --headless --convert-to png --outdir public/pptx-slides/ file.pptx
```

Or with PowerShell COM (requires Microsoft Office) — this also extracts speaker notes, which you can use as narration instead of generating new text:

```powershell
$deck = $ppt.Presentations.Open($pptxPath)
$deck.Export($outDir, "PNG")

# Extract speaker notes
foreach ($slide in $deck.Slides) {
  $noteShape = $slide.NotesPage.Shapes |
    Where-Object { $_.PlaceholderFormat.Type -eq 2 } |
    Select-Object -First 1
  $noteText = $noteShape?.TextFrame.TextRange.Text.Trim()
}
```

---

## Step 7: Package it as a Claude Code skill

The whole pipeline becomes dramatically more useful when Claude orchestrates it. A Claude Code skill is just a `SKILL.md` file that tells Claude when to activate and exactly what to do.

Install location:
```
~/.claude/plugins/educational-video/
  .claude-plugin/plugin.json   # metadata and trigger phrases
  skills/educational-video/
    SKILL.md                   # the full workflow instructions
    references/
      video-script-schema.json # Claude uses this when generating scripts
      slide-examples.json      # one example per slide type
```

The `SKILL.md` defines a 7-phase conversational flow:

1. **Resolve pipeline location** — check env var, current dir, saved config, common paths, or ask
2. **Setup check** — Node.js, npm packages, API key, voice ID (guide through any gaps)
3. **Get content** — URL, file, PPTX, pasted text, or topic description
4. **Ask two questions** — narration language + light/dark theme
5. **Generate script** — Claude writes `video-script.json` using the schema; user never touches JSON
6. **Preview + review loop** — show slide plan and full script; accept plain-language change requests
7. **Generate audio + render** — run in background, poll logs for progress, show plain-English errors

The key design principle: **Claude does the JSON**. The user never sees `video-script.json` unless they want to. They just say what they want in natural language.

One important detail — never hardcode the pipeline path in `SKILL.md`. Use a `$PIPELINE_DIR` variable resolved at runtime, and save it to `~/.claude/plugins/educational-video/config.json` after first use so it is never asked again.

---

## The result

Once set up, creating a video from any Claude Code session is just:

> "Make me a video about how TCP/IP works"

Claude finds the pipeline, generates a 20-slide script, asks for language preference, shows a preview, then runs audio generation and rendering — reporting frame progress the whole time.

The full pipeline with PPTX support, speaker notes extraction and write-back, config system, and Claude skill is at:

**[github.com/nmnhut-it/educational-video-pipeline](https://github.com/nmnhut-it/educational-video-pipeline)**

Clone it, install the skill, add your ElevenLabs API key, and you're one sentence away from a narrated video.
