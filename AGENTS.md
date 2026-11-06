# Agent instructions

To make a product ad video, read `skills/product-ad/SKILL.md` and follow it. The spec format is `schema/ad.schema.json`; the full reference is `README.md`.

- You write `ad.yaml` and `capture.yaml`. The engine does capture, timing, render, audio and checks.
- Loop: `adkit render --draft` -> `adkit check` -> `adkit tile` (look at it) -> fix -> repeat; final `adkit render`.
- Never show real businesses; use a fictional brand with realistic data.
- Before finishing: `npm test`.

## Speed
- Before and after any change in capture or render, run `scripts/speed.sh --vs-base` (exits 1 if a step is >20% slower than `scripts/speed.base.json`). After a real gain, `scripts/speed.sh --save` and commit the base.
- "Why is it slow?" is answered from `.adkit/logs/capture.log`, the timing files and `.speed/speed.log`, never from memory. If there is no number, measure first (`docs/speed.md` has the per-step numbers).
- Paste these rules into every delegated agent prompt that runs capture or render.
- Mark a capture screen `independent: true` (first step a goto, needs no state from earlier screens) so it is shot beside the others in its own browser. Frames inside one take stay in order.
- Check that a speed change keeps the frames: `scripts/speed-same.sh DIR_A DIR_B` (pixel compare). `ADKIT_SLOW_SHOT=1` and `ADKIT_SERIAL=1` switch the fast paths off.
