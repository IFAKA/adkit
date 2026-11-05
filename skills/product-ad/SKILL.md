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
5. **Sound**: pick `sound.key`, `progression` and the 4-note `motif` that fit the tone. (Deeper sound tailoring comes later.)
6. **Capture**: the screens and named elements the video points at (`capture.yaml`). For `pop` capture the final state and, if the background has texture, a second capture without the elements (`under`). For `type` capture the input empty. For a `sheet` transition capture the page with the sheet open.
7. **Brand extras**: `brand.icon` may be an image path; `endCard.note` is one small line of fine print.

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
