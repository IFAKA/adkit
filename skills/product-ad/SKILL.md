---
name: product-ad
description: Make a professional motion-design product ad video for any app with adkit. Use when asked for a promo/ad/launch video, reel or story ad of a web app or site. You write one spec file (ad.yaml); the engine captures the app, places everything on a beat grid, renders, mixes sound and checks the result.
---

# Make a product ad with adkit

adkit does all repeated work (capture, timing, camera, render, audio, checks). You decide the creative parts and write `ad.yaml`. Read `README.md` (spec reference, blocks) and use `schema/ad.schema.json` for exact fields.

## You decide
1. **Brief**: who watches, the one sentence they must remember, language, tone.
2. **Story**: pick the blocks that fit this app. Rules: `chaos` (a problem pile-up, optional) first; `endCard` last; one `reveal` before the first phone block; `iconOpen` only after a `chaos` with `into: icon`. Everything else is free. A 15 s ad needs only `reveal`, `tapFlow`, `endCard`. Do not copy an example's story: chaos `look` (bubbles, cards, tabs, toasts), the `tapFlow` steps (tap, pop, type, pulse, swipe, lift, fly, badge, check, screen with a `transition`) and the proof blocks should come from what this app really does.
3. **Brand and demo data**: invent a fictional brand and fake data. Never use a real client name, real customers, or real photos you do not have the right to use.
4. **Copy**: short lines, 2-4 words per line, one idea per title, `*word*` for the accent word, `_` for a non-breaking space.
5. **Sound** (no default sounds exist; a sound the product does not own is a failure):
   - Write a **sound map** first: for each cue role (README "Sound" lists them), pick an object in this product's world and say why (a coffee ad: bag set down, steam wand, counter bell). Put it in `sound.yaml` as `sounds:` (each with a `meaning` of 4+ words) and `cues:`. Say `silent` on purpose where no sound helps.
   - Write **music per ad** in `music.json`: pick a meter (4/4, 3/4, 6/8), a BPM that gives a whole number of frames per beat, a key and instruments that mean something for this brand (a guitar and cajon for a cafe). No chiptune or synth pop unless it means something here.
   - Run `adkit check`, then **Read the spectrogram PNGs** it prints (`.adkit/audio/mix.png`, `music.png`, `sounds/*.png`): look for a sound that is a flat blur, clipped, or buried.
   - You cannot hear it. **Ask the human to listen** (`.adkit/audio/sounds/NAME.wav`, the mix in `out/`) and fix what they say.
6. **Capture**: the screens and named elements the video points at (`capture.yaml`). For `pop` capture the final state and, if the background has texture, a second capture without the elements (`under`). For `type` capture the input empty. For a `sheet` transition capture the page with the sheet open.
7. **Brand extras**: `brand.icon` may be an image path; `endCard.note` is one small line of fine print.

## Camera and screens need a reason
- Every camera move and every screen change has a visible cause (a tap, a typed word, a result appearing) and a purpose (to read something that just appeared). No zoom just because.
- A push-in (a `fit` zoom, a zoom of 1.1 or more, or a focus on an element) must carry `why: 'reads: "3 min"'`. `adkit check` fails a push-in without `why` (check `camera-why`) and warns when it holds still for less than the reading time (`checks.appTextSeconds`). Hold it about 1.5 s, then pull back to the wide pose.
- When the story is about a map, keep the map in view: the phone shows the map in at least the top 40 % the whole time. Never open a bottom sheet to full height in the ad; use the half (peek) state. Show one interaction the way a person does it, in one phone: tap the tab, tap the pin, the card opens; do not fade to a different full-screen page. adkit cannot see the sheet state, so check this by looking at the tile.
- Several services in a row: give each at least 0.8 s (24 frames) with its tab tap visible and its map with pins visible. Make the montage longer rather than faster.

## Real transitions, not cross-fades
- A tap that changes the screen (a tab, a pin, a sheet) is not two pictures with a fade between them. Capture the real animation: a capture screen with a `record` step (`{record: {click: '#tab', elements: {tab: '#tab'}, before: 5, frames: 24}}`) steps the page clock and every CSS/Web animation 1/30 s at a time and keeps one screenshot per frame. In `tapFlow` use `{type: screen, screen: NAME, transition: live}`: the frames play from `at`, then the final capture holds. Screens may follow each other without a `goto`: the page keeps its state, so one drawer or one map stays one continuous thing across the whole story.
- `record.elements` are measured just before the action: point the `tap` step at them. `before` still frames are the finger touching; align the `tap` step with the screen step.
- Real UI motion is short (a 150 ms page fade is 5 frames, a 300 ms ease 9) and reads as a cut at 30 fps. `record.slow` (default 0.5) records at half speed: each frame advances the page clock by slow/fps s, so the in-between states are real (no blending) and the motion lasts 2x longer. `frames` counts output frames. The `live-smooth` check fails a recording with fewer than 8 moving frames (`checks.minMotionFrames`) or one frame holding more than 60 % of the change (`checks.maxSpike`). Record only as many frames as the motion needs (about 24 for a page turn); the held final capture does the rest.
- Keep `fade` for a change that is really a new scene, never for a step inside one interaction. Add motion only on top of the real one: tap, press, camera.

## Recordings and blocks are separate ideas: use a take
- A **take** is ONE page session recorded in ONE go: a capture screen with `record: {frames: N, actions: [{at: FRAME, click: SEL, elements: {...}, measure: {...}, motion: 24}, ...]}`. The page clock is stepped 1/30 s per output frame (slow motion `record.slow` only inside an action's `motion` window, normal speed everywhere else, so pauses are just more frames). No reload, no reset, no still between actions: the drawer, the map and the ripple carry on from one action to the next.
- A **block** (tapFlow) does not own a recording. It chooses a time range of the take: `start: {screen: TAKE, transition: live}` and tap steps placed at the beats of the actions. Its title, camera and sound cues are its own. The renderer plays the take as one video across block borders; only the camera, titles and end card sit on top. A second block on the same take starts with `transition: live` and `enter: cut`, nothing else.
- A transition (fade, slide, zoom) belongs only between two DIFFERENT takes. Checks: `same-take` (no `screen` step inside a take; same-take blocks join live), `take-sync` (every tap step sits within 6 frames of an action), `live-smooth` (no frame pair of the take jumps above `checks.maxJump`; each action's motion window flows), `unmocked` (below).
- Mock everything the take shows: `capture.routes` answers each live request with a fixed `file`, or a `cache` folder (map tiles, fonts: fetched once, then served from disk). `timezone`, `clock`, `geolocation` are fixed, service workers are blocked. The values in the mock files (e.g. "3 min", "7 bikes") are chosen to match the titles and the camera `why`. The `unmocked` check fails a take that asked the network for anything no route answered, and lists the URLs.

## You must NOT do by hand
- No frame numbers, no pixel positions for the phone or camera, no video editing, no manual audio or loudness work. Give lengths in bars and times in beats; the compiler places and checks them.
- Do not edit generated files in `.adkit/` or `out/`.

## Loop
```
adkit capture ad.yaml     # photograph the app (cached)
adkit render ad.yaml      # only changed scenes re-render
adkit check ad.yaml       # fix every FAIL
adkit tile ad.yaml        # then LOOK at .adkit/tiles/sheet.png (Read the PNG)
adkit tile ad.yaml --from 120 --to 240   # zoom on one part
```
Review the tile like a viewer: is the first second a hook, is each title readable and off the top 250 px / bottom 400 px, does every scene show one thing, does the end card hold long enough. Fix the spec, re-render (cached, fast), look again. Stop when the check passes and the tile looks professional.
