# adkit progress

Status log. Newest decisions last. `BLOCKED:` lines mark steps that failed three different ways.

- [x] spec: zod schema, loader (file:line errors), JSON Schema export
- [x] engine: compiler (beat grid, cue overlap checks), plan/cues
- [x] audio: numpy synth driven by the plan (matches golden loudness within 0.1 LU)
- [x] CLI: init, capture, build, render (per-scene cache), check, tile, studio
- [x] examples: minimal (static demo page), horno-lento (reproduces the approved ad)
- [x] capture runner (sets run in parallel)
- [x] renderer (Remotion) and golden comparison: SSIM 0.9733, -14.1 vs -14.0 LUFS
- [x] cache proof (b.mp4 == c.mp4, scripts/cache-proof.sh), determinism proof (CPU raster, fixed chunks)
- [x] README, docs/preview.mp4, docs/poster.png
- [x] generic blocks: `chaos` (replaces chatChaos; looks bubbles/cards/tabs/toasts, into icon/center), relaxed story order, tapFlow screen transitions (cut/fade/zoom/sheet) and steps pop/type/pulse/swipe, brand.icon.image, endCard.note, examples/steps
- audio tailoring: phase 2 (kit, instruments, palette not built; a later step rebuilds audio)

## Decisions
- GPU Chrome is not byte-stable (blurred shadows differ by one level). Default is CPU raster + single raster thread + fixed 30-frame chunks. GPU only for --draft.
- Scenes are encoded one by one and joined with -c copy; audio is mastered against the AAC round trip (true peak went from +0.5 to -4.3 on minimal before this fix).
- The audio venv is shared in ~/.cache/adkit/venv.

## Not built yet
- One-title edit in a long scene is 50 s (target 30 s): CPU raster costs about 1 core-second per frame.
- Hold-frame detection (skip identical frames), hardware (VideoToolbox) encode, a persistent warm browser between runs, an esbuild-bundled CLI to replace tsx.
- Schema fields: brand.photo, reveal camera shots, chart region, chat bubble style. Only 1080x1920.
- The audio was measured, not listened to.

## Sound kit (phase 2a)
- [x] `audio/synth/` physical-model synthesis (modal, pluck, liquid, particles, noise, FM/subtractive, drums, sample layer, fx), numpy only
- [x] `audio/sounddesign.py` (SOUND json, `meaning` required), `audio/score.py` (MUSIC json, real 3/4 and 6/8 grids, cues.json), `audio/tools/spectrogram.py` (PNG + stats)
- [x] demos (tram bell, water drop, cierzo, spoon/cup, oven ding, 3/4 jota) and `npm run test:audio`
- Decisions: scipy is not in the venv, so filters are causal biquads built from the closed-form pole response + FFT convolution, and Karplus-Strong runs one numpy step per string period. Models return peak 0.5; levels are set by layer gain in dB. Samples need license CC0/own/public-domain. Meter: pattern positions are in units of the unit note; bpm counts dotted quarters for 6/8, 9/8, 12/8.
- Not built yet (phase 2b): wiring sounds and music into `ad.yaml`, a "genericness check" (flag sounds that do not match their `meaning`), mixing the new sounds into `audio/build.py` and the loudness master, SFX snapping to `cues.json`.
- The sounds were looked at (spectrograms), not listened to.
