# Agent instructions

To make a product ad video, read `skills/product-ad/SKILL.md` and follow it. The spec format is `schema/ad.schema.json`; the full reference is `README.md`.

- You write `ad.yaml` and `capture.yaml`. The engine does capture, timing, render, audio and checks.
- Loop: `adkit render --draft` -> `adkit check` -> `adkit tile` (look at it) -> fix -> repeat; final `adkit render`.
- Never show real businesses; use a fictional brand with realistic data.
- Before finishing: `npm test`.
