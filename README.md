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
meta:    {fps: 30, width: 1080, height: 1920, bars: 7.5}   # the tempo is sound.music.bpm
brief:   {audience, message, language, tone}      # for people and agents; not drawn
brand:   {name, tagline, contact, colors, fonts, icon (path or {image})}
capture: capture.yaml                              # or inline; see below
scenes:  [ ...blocks, in order... ]
sound:   {music, sounds, cues, mix, seed}          # see "Sound"
output:  {file: out/ad.mp4, crf: 18}
```

The full reference is the JSON Schema `schema/ad.schema.json` (use it in your editor: `# yaml-language-server: $schema=...`). Errors name the file, line and path: `ad.yaml:42 scenes[1].bars: length 1.3 bars is not a whole number of beats`.

Time is musical. A scene's length is in **bars** (the music's meter, 4 beats in 4/4; 2 s at 120 BPM and 30 fps). Everything inside a scene is placed in **beats** from the scene start. The compiler turns this into frames, puts every cue on a beat or off-beat (`frame % 15` is 0 or 7 at 120 BPM / 30 fps) and fails on off-grid cues, overlapping events, overlapping titles, or a wrong story order.

Text: `*word*` is drawn in the accent colour, anywhere in a line (punctuation may sit outside: `*pay*.`); `_` is a non-breaking space.
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
        steps: [{goto: /}, {click: 'button.accept'}, {wait: 500}]   # goto click fill select wait evaluate scroll record (record: the real animation of a click as a frame sequence; play it with tapFlow transition: live)
        scroll: {to: '#p1', offset: 190}
        elements: {productCard: '#p1', cartIcon: {selector: '#cart', fixed: true}}
  sage: {extends: main, env: {THEME: sage}, theme: {bg, fg, accent}, screens: [...]}
```

adkit never changes your app folder when `isolate: copy` (it works in `.adkit/work/`). Each screen is saved as a viewport image, a full-page image and the boxes of the named elements; the video points the camera, taps and lifts at those names.

### Blocks

| block | what it shows |
| --- | --- |
| `chaos` | Dark scene where the problem piles up faster and faster. `items` (text, optional emoji `icon`, `side`, `beat` or `frame`) in a `look`: `bubbles` (chat), `cards`, `tabs` or `toasts`. A red `counter` climbs (or `counter: false`). A title shakes in. `into: icon` flies the items into an icon (an `iconOpen` block must follow); `into: center` collapses them to one point and cuts to the next block. `flyBeats` sets when they fly. Must be the first block, if used. |
| `iconOpen` | The icon morphs into your app icon (`brand.icon`, or `brand.icon.image`). Only right after a `chaos` with `into: icon`. |
| `reveal` | Warm light blooms, the phone opens from the icon (or rises), push-in, 1-2 titles |
| `tapFlow` | Ordered steps on the captured app (see below), plus camera keys with zoom / focus on elements. A camera key's `at` may be any beat (e.g. 4.75); only a key with `whoosh: true` must sit on a whole or half beat |
| `whip` | Whip-pan from one phone to the next (zero length) |
| `notification` | A banner drops in and a card slides into the screen. `banner.glass: true` makes the banner frosted glass (15 px blur of the screen behind, 25 % white, 1 px white stroke); default is the plain white banner |
| `statCountUp` | A number counts up with a ring and chart bars |
| `skins` | The same screen in other colour variants every N beats |
| `endCard` | Promise line, brand lockup, contact, optional `note` (a small line under the contact, kept out of the bottom 400 px), final hit |

Story order: `chaos` (optional) first, `endCard` last, `iconOpen` only right after a `chaos` with `into: icon`, one `reveal` before any other phone block. Everything else is free. A 15 s ad needs only `reveal`, `tapFlow`, `endCard`.

**Camera feel.** A camera key has `spring:` `snappy` (default) or `drift`. `snappy` starts very fast and has a long soft tail, then rests. `drift` slows down but is still moving when it ends: use it for a move that is followed by another move or a held frame, so the camera never stops dead between them.

**Title words.** The words of a title always enter with uneven gaps: 2 frames after the first word, then 4, 4 and so on. The reading-time check counts that entrance.

**Title layer.** A title is drawn under the phone, so a title that is still fading out while the phone moves is hidden by it. A camera push-in covers the title too. Set `above: true` on a title to draw it over the phone instead (keep it clear of the spot the camera looks at: `adkit check` warns as `title-above` when the title overlaps the camera's focus band, `qy` plus or minus 220 px).

#### tapFlow steps

| step | fields | what it does (cue) |
| --- | --- | --- |
| `screen` | `at`, `screen`, `transition` (`slide` default, `cut`, `fade`, `zoom`, `sheet`), `sheetHeight`, `scroll`, `sticky` | Shows another captured screen. `sheet`: the bottom `sheetHeight` px of the new capture rises over the old screen (capture the page with the sheet open and pinned to the bottom). (swap, or whoosh for sheet) |
| `tap` | `at`, `element`, `x`, `radius`, `press`, `highlight`, `reaction` | Finger tap with highlight (tap). The tapped element always answers on the tap frame: `reaction: burst` (default) flashes it in the accent colour and settles (~10 frames); `reaction: ripple` grows a ring out of it; `reaction: none` gives no answer (the `action-reaction` check then wants a `press` or a screen change). No new sound: it reuses the tap cue. |
| `lift` / `fly` | `element`, `tap`, `tapAt` / `to` | A card pops out, then flies to a target (pop, whoosh) |
| `badge` | `element`, `count` | A count badge lands on an element (pop) |
| `check` | `size` | Success check (chime) |
| `pop` | `at`, `elements[]`, `stagger` (beats, default 0.5), `style` (`pin` / `ring` / `scale`), `under` | The elements are hidden, then appear one after another. The capture shows them in their final place. `under` is a capture of the same page without them; needed on textured backgrounds such as a map. (one pop per element) |
| `type` | `at`, `element`, `text`, `beats`, `fontSize`, `color` | Types text into an input that is empty in the capture, with a caret (a tick every half beat) |
| `pulse` | `at`, `element`, `color`, `count` | Rings grow from an element, one per beat (ping) |
| `swipe` | `at`, `from`, `to`, `beats`, `scroll` | A finger drags from one element to another. With `scroll` (px) the page scrolls and the finger stays on the same content (whoosh) |

Examples: `examples/minimal/ad.yaml` (15 s), `examples/horno-lento/ad.yaml` (30 s, a shop app, most blocks) and `examples/steps/ad.yaml` (20 s, a fake map app: chaos `cards`, `type`, `pop` with `under`, `pulse`, `sheet` and `fade` transitions, `swipe` with scroll, `endCard.note`).

### Background and title accents

- Every scene sits on a soft gradient of blurred blobs that wander slowly, plus film grain (`drift` 0.2, `grain` 0.7). `background: {gradient: [4 hex colours], drift, grain}` (spec level; a scene can set its own) only tunes it. Without `gradient` it is built from the brand colours. `drift` 0 holds still; `grain` 0 is clean, 0.5 is subtle, 0.7 is the usual look, 1 is harsh. It is deterministic, and a change re-renders the scenes.
- A title may have `markers: true` (or `{size: 26, color: "#hex"}`) adds four small squares on the corners of the title. They flicker on with an uneven frame pattern, each square a few frames apart, then hold. They are decoration: the safe-zone and title-size checks use the text box only, so keep the title away from the edges.

## Sound

adkit has **no default sounds and no default song**. Every ad carries its own music and its own sounds, written for that product, as data in `ad.yaml` (or a `sound.yaml` it points to). The sounds are synthesised, so nothing is licensed.

```yaml
sound: sound.yaml          # or inline
```
```yaml
# sound.yaml
music: {file: music.json}   # a MUSIC object (or inline): bpm, meter, key, instruments, patterns, sections
sounds:                      # what each sound IS, in this product's world
  bag_thump:
    meaning: "A paper bag of beans set down on the counter, because the ad sells bagged coffee"   # required, 4+ words
    layers: [{model: kick, params: {tune: 0.75}, gain: -4}]
    fx: [{type: lowpass, hz: 900}]
    # tune: chord          # follow the chord playing at the cue time (notes are written in the music's key)
cues:                        # which sound plays at which cue
  tap: bag_thump             # a sound name
  paid: {sound: counter_bell, gain: -3, pan: 0.2, duck: 3}
  cut: silent                # "silent" = on purpose no sound
mix: {loudness: {lufs: -14, truePeak: -1.5}, duckMusic: 1.5}
```

A cue key is a cue name (`block:cue`, strongest), a role, or a kind (weakest). Cue fields: `sound`, `gain` (dB), `pan` (-1..1), `duck` (dB the music dips), `variations` (default 3: seeds rotate per occurrence so repeats do not sound the same), `align: end` (a sound with a duration, like a riser, ends when the cue ends), `reason` (why two roles share one sound). `mix.duckMusic` is the default duck; `mix.musicGain` shifts the music (dB).

**Cue roles.** Each is one kind, so you can map by kind (`tap`, `pop`, `whoosh`, `hit`, `chime`, `ping`, `riser`, `swap`, `tick`, `title`, `cut`) as a shortcut, but a sound per role is better.

| role | kind | when |
|---|---|---|
| `cut` | cut | hard cut at the start of every block (optional: needs no sound) |
| `title-in` | title | a title appears (needs a sound only for the first title of a phone block, "strong") (optional: needs no sound) |
| `title-out` | title | a title leaves (optional: needs no sound) |
| `riser-chaos` | riser | chaos block: the build-up over the whole block (has a duration) |
| `ping` | ping | chaos block: an item arrives |
| `bubble-pop` | pop | chaos block: the pile bursts or collapses (3 cues) |
| `icon-morph` | swap | iconOpen: the pile turns into the app icon |
| `drop` | hit | reveal: the first beat of the phone scene |
| `app-open` | whoosh | reveal: the phone rises in |
| `screen-swap` | swap | the app screen changes |
| `sheet-up` | whoosh | tapFlow: a sheet slides up |
| `pop-in` | pop | tapFlow pop step: an element pops out |
| `type-tick` | tick | tapFlow type step: one character group typed (every half beat) |
| `pulse` | ping | tapFlow pulse step: an element pulses |
| `swipe` | whoosh | tapFlow swipe step |
| `tap` | tap | a finger taps an element (pan from the step) |
| `lift` | pop | tapFlow: an element lifts off the page |
| `fly` | whoosh | tapFlow: the lifted element flies away (2 beats) |
| `badge` | pop | tapFlow: a count badge appears |
| `paid` | chime | tapFlow check step: the success tick |
| `whip-out` | whoosh | whip: the old scene leaves |
| `whip-spin` | whoosh | whip: the spin into the next scene (2 beats) |
| `notification` | chime | notification: the banner slides in |
| `order-lands` | pop | notification: the new item lands in the list |
| `count` | ping | statCountUp: the number counts up (has a duration) |
| `count-done` | chime | statCountUp: the number arrives |
| `bars-riser` | riser | statCountUp: the chart bars grow (2 beats) |
| `skin-swap` | swap | skins: the look changes to the next variant |
| `macro` | whoosh | camera move with `whoosh: true` |
| `cta-whoosh` | whoosh | endCard: the end card enters (2 beats) |
| `lockup` | pop | endCard: the brand lockup lands |
| `contact` | title | endCard: the contact line appears |
| `final-hit` | hit | endCard: the last beat |

**The genericness check** (in `adkit build`, and again in `adkit check`) FAILS when: a cue that is emitted has no sound (map it, or say `silent`); a sound has no `meaning` or one under 4 words; there is no `music`; the music is shorter than the ad; a cue points at a sound that is not defined (a name from the old built-in palette such as `tap` or `payment_ding` gets a clear message). It WARNS when two cue keys share one sound with no `reason`, a cue key matches nothing, a sound is unused, or the music is longer than the ad. `adkit check` also writes spectrogram PNGs to `.adkit/audio/` (`mix.png`, `music.png`, `sounds/NAME.png` and `.wav`) and prints their paths: look at them.

**Meter.** The grid comes from `music.meter` and `music.bpm`. A bar has `meter.beats` beats. The beat is a quarter in x/4 and an eighth in x/8 (3/4 works, and 6/8 is six eighths). For 6/8, 9/8 and 12/8 the BPM counts dotted quarters (override: `meter.bpm_counts`). Frames per beat (`fps * seconds per beat`) must be a whole number of at least 4, else the compile fails and lists nearby valid BPM values (30 fps: 3/4 at 180 BPM is 10 frames per beat). The off-beat is half a beat, rounded down to a frame (`floor`; 15 frames per beat gives 7). Scene lengths must be a whole number of beats.

**Audio build.** `audio/build.py` renders the music (`score.py`), renders every cue at its time (`sounddesign.py`), ducks the music, then masters to -14 LUFS with the true peak checked after an AAC round trip. Music and sounds are cached by content hash. Details: `audio/README.md`.

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

Motion rules over the compiled plan (no pixels; each is a key under `checks:`, `false` turns it off). All warn, except `camera-dead-stop`, which fails the check (`cameraDeadStop.level: warn` turns it into a warning):

| Check | Catches | Config (default) |
| --- | --- | --- |
| `camera-dead-stop` | a camera move that ends at zero speed and the next move starts more than N frames after it settles, or none follows while later blocks go on. The pull-out to a wide pose (zoom below 1.1), the last move and the moves the renderer adds itself are not reported. Use spring `drift` before a next move. | `cameraDeadStop: {frames: 6, level: fail}` |
| `same-frame-start` | 3 or more titles (not `instant`), title `markers` or tap `reaction`s starting on one frame | `sameFrameStart: {count: 3}` |
| `even-stagger` | 4 or more items with one identical gap in a `pop` step (title words already use uneven gaps) | `evenStagger: {count: 4}` |
| `action-reaction` | a `tap` with `reaction: none`, no `press` and no `screen` or `check` step within 3 frames | `actionReaction: {frames: 3}` |
| `flat-background` | a scene over 60 frames whose background has `drift: 0` and `grain: 0` | `flatBackground: {frames: 60}` |
| `motion-density` | more than 6 elements (titles, markers, camera moves, tapFlow steps; not chaos) starting to move within 10 frames | `motionDensity: {max: 6, window: 10}` |

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

---

## Support

If this project is useful to you, you can support my work:

[![Support me on Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/zfaka)
