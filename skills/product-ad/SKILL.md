---
name: product-ad
description: Make a professional motion-design product ad video for any app with adkit. Use when asked for a promo/ad/launch video, reel or story ad of a web app or site. You write one spec file (ad.yaml); the engine captures the app, places everything on a beat grid, renders, mixes sound and checks the result.
---

# Make a product ad with adkit

adkit does all repeated work (capture, timing, camera, render, audio, checks). You decide the creative parts and write `ad.yaml`. Read `README.md` (spec reference, blocks) and use `schema/ad.schema.json` for exact fields.

## You decide
1. **Brief**: who watches, the one sentence they must remember, language, tone.
2. **Story** in blocks, in this order: problem (`chatChaos`) -> `iconOpen` -> `reveal` -> proof (`tapFlow`, `notification`, `statCountUp`) -> `skins` -> `endCard`. A 15 s ad needs only `reveal`, `tapFlow`, `endCard`.
3. **Brand and demo data**: invent a fictional brand and fake data. Never use a real client name, real customers, or real photos you do not have the right to use.
4. **Copy**: short lines, 2-4 words per line, one idea per title, `*word*` for the accent word, `_` for a non-breaking space.
5. **Motif**: pick `sound.key`, `progression` and the 4-note `motif` that fit the tone.
6. **Capture**: the screens and named elements the video points at (`capture.yaml`).

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
