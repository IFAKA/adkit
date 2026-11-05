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
