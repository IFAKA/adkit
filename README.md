# adkit

Make professional motion-design product ad videos (vertical 1080x1920, 30 fps, with sound) for any web app from **one spec file**, `ad.yaml`.

A deterministic engine does the repeated work: it photographs your app, places every cue on a beat grid, moves a phone and camera across scenes, renders, synthesises the music and sound effects, and checks the result. A human or an AI agent only writes the creative parts: the story, the copy and the brand.

![preview](docs/preview.gif)

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

- Same spec + same captures gives byte-identical frames: no clocks, no `Math.random`; film grain uses seeded random per frame; audio is synthesised with a fixed seed (numpy, no samples).
- **Captures** are cached by hash(app git HEAD + uncommitted diff + inputs + capture spec).
- **Audio** is cached by hash(cues + sound spec + synth code).
- **Render** is cached per scene by hash(scene spec + its neighbours without titles + layout + titles on screen + brand + the captures it shows + engine version). Frames of all scenes are linked in order and encoded once, so a partial render is identical to a full one. Changing one title re-renders one scene.

## For AI agents

`skills/product-ad/SKILL.md` is a Claude Code skill: what the agent decides (brief, story, fictional brand and data, copy, motif, blocks), what it must not do by hand, and the review loop (tile, fix, re-render from cache).

## Tests

```bash
npm test
```

## License

MIT. See `LICENSE`.
