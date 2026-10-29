# adkit: product ad video generator from one YAML file

**Make professional motion-design app ad videos (vertical 9:16, 1080x1920, with original music and sound effects) from a single `ad.yaml`. Built for AI agents like Claude Code, and for humans.**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Node 20+](https://img.shields.io/badge/node-20%2B-brightgreen)
![Remotion](https://img.shields.io/badge/built%20on-Remotion-0b84f3)

[![adkit preview: phone app ad with kinetic titles](docs/poster.png)](docs/preview.mp4)

*Click the image to play the 7 s preview. The full 30 s example is `examples/horno-lento`.*

adkit turns a running web app into a finished Instagram Reels / TikTok / App Store style ad: a 3D phone, camera moves, kinetic titles, real screenshots of your app, tuned sound design and a loudness-mastered mix (-14 LUFS).

## Why adkit

- **One spec file.** You (or an AI agent) write the story, copy and brand. The engine does everything repetitive.
- **Deterministic.** The same spec and the same captures give the same frames and the same audio. No stock music or samples: all sound is synthesised, so there is nothing to license.
- **Fast.** Content-hash caching: nothing changed re-runs in under 1 s; editing one scene re-renders only that scene; `--draft` renders half size in about 35 s.
- **Checked automatically.** Frame count, beat-grid timing, loudness and true peak, Instagram safe zones, title size and capture files.
- **Made for AI agents.** Ships a `product-ad` skill (`skills/product-ad/SKILL.md`) that says what the agent must decide and what the engine already does.

**Keywords:** product video, app promo video, motion graphics, Remotion, Playwright, programmatic video, AI video generation, Claude Code skill, Reels, TikTok, App Store preview.

## Install

Needs Node 20+, `ffmpeg` and `ffprobe` on the PATH, and Python 3 (for the audio; adkit creates its own venv in `.adkit/venv`).

```bash
git clone https://github.com/IFAKA/adkit && cd adkit
npm install
npx playwright install chromium
```

## Quick start

```bash
node bin/adkit.mjs render examples/minimal/ad.yaml     # capture + audio + video, 15 s
node bin/adkit.mjs check  examples/minimal/ad.yaml
node bin/adkit.mjs tile   examples/minimal/ad.yaml     # contact sheet to look at
```

Your own project:

```bash
adkit init my-ad            # writes ad.yaml + capture.yaml
# edit capture.yaml (where your app runs, which screens and elements) and ad.yaml (story and copy)
adkit capture my-ad && adkit render my-ad && adkit check my-ad && adkit tile my-ad
```

Output: `out/ad.mp4` next to `ad.yaml`. Logs: `.adkit/logs/`.

## The spec

```yaml
meta:    {fps: 30, width: 1080, height: 1920, bpm: 120, bars: 7.5}
brief:   {audience, message, language, tone}      # for people and agents; not drawn
brand:   {name, tagline, contact, colors, fonts, icon}
capture: capture.yaml                              # or inline; see below
scenes:  [ ...blocks, in order... ]
sound:   {key, progression, chords, motif, sfx, seed, loudness}
output:  {file: out/ad.mp4, crf: 18}
```

The full reference is the JSON Schema `schema/ad.schema.json` (use it in your editor: `# yaml-language-server: $schema=...`). Errors name the file, line and path: `ad.yaml:42 scenes[1].bars: length must be a multiple of 0.25 bars`.

Time is musical. A scene's length is in **bars** (4 beats; 2 s at 120 BPM and 30 fps). Everything inside a scene is placed in **beats** from the scene start. The compiler turns this into frames, puts every cue on a beat or off-beat (`frame % 15` is 0 or 7 at 120 BPM / 30 fps) and fails on off-grid cues, overlapping events, overlapping titles, or a wrong story order.

Text: `*word*` is drawn in the accent colour; `_` is a non-breaking space.
Environment variables in the spec: `${APP_DIR:-/default/path}`.

### Capture

```yaml
app:      {dir: ../my-app, isolate: copy, setup: [npm ci], build: [npm run build], start: "npm start -- -p {port}", ready: {path: /}}
          # or just {url: http://localhost:3000}
viewport: {width: 390, height: 844, scale: 3}
clock:    '2026-03-10T10:00:00Z'        # freezes dates so shots are stable
inputs:   [demo-data]                    # files that change what the app shows (part of the cache key)
sets:
  main:
    screens:
      - name: shop
        steps: [{goto: /}, {click: 'button.accept'}, {wait: 500}]   # goto click fill select wait evaluate scroll
        scroll: {to: '#p1', offset: 190}
        elements: {productCard: '#p1', cartIcon: {selector: '#cart', fixed: true}}
  sage: {extends: main, env: {THEME: sage}, theme: {bg, fg, accent}, screens: [...]}
```

adkit never changes your app folder when `isolate: copy` (it works in `.adkit/work/`). Each screen is saved as a viewport image, a full-page image and the boxes of the named elements; the video points the camera, taps and lifts at those names.

### Blocks

| block | what it shows |
| --- | --- |
| `chatChaos` | Dark scene, message bubbles pile up faster and faster, counter climbs, a title shakes in, bubbles fly into the chat icon |
| `iconOpen` | The chat icon morphs into your app icon |
| `reveal` | Warm light blooms, the phone opens from the icon (or rises), push-in, 1-2 titles |
| `tapFlow` | Ordered steps on the captured app: `screen`, `tap`, `lift` (card pops out), `fly` (card flies to a target), `badge`, `check`; camera keys with zoom / focus on elements |
| `whip` | Whip-pan from one phone to the next (zero length) |
| `notification` | A banner drops in and a card slides into the screen |
| `statCountUp` | A number counts up with a ring and chart bars |
| `skins` | The same screen in other colour variants every N beats |
| `endCard` | Promise line, brand lockup, contact, final hit |

Examples: `examples/minimal/ad.yaml` (15 s) and `examples/horno-lento/ad.yaml` (30 s, all blocks).

## CLI

```
adkit init <dir>        starter ad.yaml + capture.yaml
adkit capture [spec]    photograph the app          --force --set NAME --screen NAME
adkit build   [spec]    compile; write .adkit/plan.json + cues.json; synthesise audio
adkit render  [spec]    capture + build + render changed scenes + encode   --out FILE --force
adkit check   [spec]    verify video + spec; exit code 1 on failure
adkit tile    [spec]    contact sheet (1 frame per second) or --from F --to T [--count N]
adkit studio  [spec]    Remotion Studio on the compiled plan
```

One line per step on screen; full output in `.adkit/logs/<step>.log`; non-zero exit on failure.

### Checks

Duration, frame count, size, fps; every cue on the grid; loudness within 0.5 LU of the target (default -14 LUFS) and true peak at or below -1 dBTP; no title text in the Instagram unsafe zones (top 250 px, bottom 400 px), computed from the real layout boxes; minimum title size (64 px); no grey frames in warm sections (warning); every capture file present and every element box inside its page.

## Determinism and caching

- Same spec + same captures gives byte-identical video. No clocks, no `Math.random`; grain uses seeded random per frame; audio is synthesised with a fixed seed (numpy, no samples).
- Chrome draws on the CPU (one raster thread, no partial raster) in fixed 30-frame chunks, each in a fresh tab. Measured: 6 runs of 180 frames gave 0 differing frames, at any worker count. The GPU path (`ADKIT_GL=angle`) is faster but a few pixels differ by one level between runs, so it is used only for `--draft`.
- **Captures** are cached by hash(committed files of the app folder + uncommitted diff + inputs + capture spec). The capture sets run side by side.
- **Audio** is cached by hash(cues + sound spec + synth code). The limiter is checked after an AAC round trip, so the true peak holds in the final file.
- **Render** is cached per scene by hash(scene spec + neighbours without titles + layout + titles on screen + brand + the captures it shows + engine version). Each scene is encoded to its own file as soon as its frames exist, and the files are joined without re-encoding. A one-title edit rebuilds one scene; `scripts/cache-proof.sh` proves that the partial render is byte-identical to a render from scratch.
- Frames go through one pool of workers (all cores but two, at most 10; `ADKIT_WORKERS` overrides).

## Speed

Measured on an Apple M-series Mac with 12 cores (other jobs were running), horno-lento, 30 s, 900 frames:

| Run | Time |
| --- | --- |
| Cold, everything (capture 104 s incl. 4 app builds + frames 106 s + mux) | 211 s |
| Cold frames only (capture cached) | 112 s |
| Nothing changed | 0.8 s |
| One title changed in the longest scene (240 frames) | 50 s |
| `--draft` (half size, no motion blur, GPU), all scenes | 35 s |

minimal (15 s): cold 49 s, one-title edit 28 s, draft 30 s. Each run prints a one-line timing and writes `.adkit/logs/timing.json`. Other options: `--scene NAME`, `--frames A-B` (video only).

Quality against the approved ad: mean SSIM 0.973 (1 frame per beat), loudness -14.1 vs -14.0 LUFS. The remaining difference is demo data and the fictional contact number.

## Use it with AI agents (Claude Code and others)

adkit ships an agent skill, [`skills/product-ad/SKILL.md`](skills/product-ad/SKILL.md). It tells the agent what to decide (audience, one-sentence message, story, fictional brand and demo data, copy, sound-logo notes, which blocks) and what never to do by hand (capture, timing, camera, render, audio, checks: the engine does them).

**Install the skill in Claude Code**

```bash
git clone https://github.com/IFAKA/adkit ~/adkit && cd ~/adkit && npm install && npx playwright install chromium
mkdir -p ~/.claude/skills && cp -r skills/product-ad ~/.claude/skills/product-ad
```

**Then just ask**

> Make a 30 s vertical ad for my app in `~/code/my-app` for café owners, in Spanish. Use adkit.

The agent writes `ad.yaml` and `capture.yaml`, runs `adkit capture`, `adkit render --draft`, `adkit check` and `adkit tile`, looks at the contact sheet, fixes the copy or timing, and re-renders. Because of caching, each fix takes seconds, not minutes.

**Other agents** (Codex, Cursor, Gemini CLI, etc.): point them at `AGENTS.md`, which links the same skill and the spec schema (`schema/ad.schema.json`) for exact fields.

## Tests

```bash
npm test
```

## License

MIT. See `LICENSE`.
