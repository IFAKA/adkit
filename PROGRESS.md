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

## Decisions
- GPU Chrome is not byte-stable (blurred shadows differ by one level). Default is CPU raster + single raster thread + fixed 30-frame chunks. GPU only for --draft.
- Scenes are encoded one by one and joined with -c copy; audio is mastered against the AAC round trip (true peak went from +0.5 to -4.3 on minimal before this fix).
- The audio venv is shared in ~/.cache/adkit/venv.

## Not built yet
- One-title edit in a long scene is 50 s (target 30 s): CPU raster costs about 1 core-second per frame.
- Hold-frame detection (skip identical frames), hardware (VideoToolbox) encode, a persistent warm browser between runs, an esbuild-bundled CLI to replace tsx.
- Schema fields: brand.photo, reveal camera shots, chart region, chat bubble style. Only 1080x1920.
- The audio was measured, not listened to.
