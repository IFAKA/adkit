# Speed

Measured with `scripts/speed.sh` on the fixture `scripts/speed-fixture` (390x844 at scale 3 = 1170x2532 frames, 60-frame takes, 12-core shared Mac at load 5-13; wall seconds are noisy, CPU less so). Base: `scripts/speed.base.json`.

## Where capture time goes (before any change)
One take (61 shots): 28.7 s wall. Per step:
- screenshot: 19.7 s = 0.32 s per frame (76% of the take)
- settle waits (fixed waits + networkidle): 3.2 s for 6 calls; prescroll 2.0 s; full-page shot 1.6 s
- page clock step 0.8 ms/frame, animation sync 0.5 ms/frame, disk write 0.5 ms/frame: nothing
Real ad (zaragoza, `.adkit/logs/capture.log`): capture 390 s in one set: take 261 s (960 frames = 0.27 s/frame), map screens 11 s each, hook screens 3.8 s each. Render was 86 s. So capture, not render, is the long part; the screenshot is the cost.
Sets already ran in parallel (3 sets: 29.6 s wall, same as 1). Screens inside a set ran one after the other.

## Changes
| step (wall s / cpu s) | before | after |
|---|---|---|
| take (1 take) | 28.9 / 30.6 | 14.9 / 15.9 |
| sets (3 sets) | 29.6 / 92.1 | 15.7 / 47.8 |
| indep (4 independent takes) | 96.8 / 113.8 | 14.2 / 61.3 |

Kept:
1. Fast PNG per take frame (Chrome `optimizeForSpeed`, CDP `Page.captureScreenshot`): 0.32 -> 0.09 s per frame. Same pixels on static and scrolled pages (0 px differ). On the moving fixture dot up to 17 of 3M px differ by <=2/255 (Playwright and raw CDP render sub-pixel edges slightly differently). Files are ~2x bigger (2.3 MB vs 1.3 MB). The capture sha (hash of frame bytes) changes once, so cached renders are redone once. `ADKIT_SLOW_SHOT=1` restores Playwright's screenshot.
2. `independent: true` screens run in parallel, one browser each, at most cores/2 browsers in the process (sets and chains together). Browsers die with the parent. Opt-in: an independent screen starts a fresh browser, so it no longer inherits the page clock left by an earlier take (the old behaviour made its animations depend on earlier screens). The first screen is pixel-identical to a serial run; later ones start from a clean clock. Not split when a step uses `evaluate.save` (variables carry over). `ADKIT_SERIAL=1` turns it off.

Rejected or not done:
- JPEG frames: not lossless, frames would change (CDP jpeg q100 was 0.067 s vs 0.101 s fast PNG: not worth it).
- Skip settle/prescroll waits: 5.2 s of a 14 s take, but they wait on real-time page animations; cannot prove the frame is unchanged. Not touched.
- Waiting less per frame in a take: clock + animation sync total 0.05 s per 60 frames; nothing to gain.
- Writing frames in a worker: write is 0.03 s per 61 frames.
- `--preview` (half size capture): not built yet; `render --draft` exists. Next round: capture with scale 1 into a separate folder.
