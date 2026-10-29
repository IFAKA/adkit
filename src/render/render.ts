import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {ensureBrowser, renderFrames as remotionFrames, renderStill, selectComposition} from '@remotion/renderer';

export const defaultConcurrency = () => Math.max(1, Math.min(6, Math.floor(os.cpus().length / 2)));
const name = (n: number) => `frame-${String(n).padStart(6, '0')}.jpg`;
/**
 * Render modes (env ADKIT_GL):
 *  - "cpu" (default): Chrome draws on the CPU, one raster thread, no partial raster. Measured byte-stable:
 *    6 runs of 180 frames gave 0 differing frames. Without those two flags a few frames differed.
 *  - "swiftshader", "angle": Chrome draws through a software or real GPU stack. Faster for "angle", but on blurred
 *    shadows a few pixels differ by one level between runs, so cached scenes would not equal a fresh render.
 */
export const GL = (process.env.ADKIT_GL ?? 'cpu') as 'cpu' | 'swiftshader' | 'swangle' | 'angle';
const CHROME = {gl: (GL === 'cpu' ? 'swiftshader' : GL) as 'swiftshader' | 'swangle' | 'angle', disableWebSecurity: true};

let browserPath: string | null | undefined;
/** The Chrome to run: ADKIT_CHROME, or in "cpu" mode a tiny wrapper around Remotion's headless shell that turns the GPU off. */
async function browser(): Promise<string | null> {
  if (process.env.ADKIT_CHROME) return process.env.ADKIT_CHROME;
  if (GL !== 'cpu') return null;
  if (browserPath !== undefined) return browserPath;
  await ensureBrowser();
  const req = createRequire(import.meta.url);
  const root = path.join(path.dirname(req.resolve('@remotion/renderer/package.json')), '..', '..', '.remotion', 'chrome-headless-shell');
  const found: string[] = [];
  const walk = (d: string, depth: number) => {
    if (depth > 4 || !fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, {withFileTypes: true})) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f, depth + 1);
      else if (e.name === 'chrome-headless-shell' || e.name === 'chrome-headless-shell.exe') found.push(f);
    }
  };
  walk(root, 0);
  if (!found.length) return (browserPath = null);
  if (process.platform === 'win32') return (browserPath = found[0]);
  const wrapper = path.join(os.tmpdir(), `adkit-chrome-cpu-${process.getuid?.() ?? 0}.sh`);
  fs.writeFileSync(wrapper, `#!/bin/sh\nexec "${found[0]}" "$@" --disable-gpu --disable-gpu-compositing --disable-gpu-rasterization --num-raster-threads=1 --disable-partial-raster\n`, {mode: 0o755});
  return (browserPath = wrapper);
}

/** Frames per chunk. A chunk is always rendered in order by one browser tab, so its pixels never depend on timing. */
export const CHUNK = 30;

/**
 * Renders frames [from, to] (inclusive) as frame-%06d.jpg (absolute frame numbers) in outDir. JPEG quality 95, no audio.
 * Why chunks: Chrome keeps raster state between frames of one tab, so a frame can differ by one level depending on
 * which frames the tab drew before. Remotion hands frames to tabs by timing, so a plain render is not repeatable.
 * Here every chunk of CHUNK frames gets its own browser and is drawn in order, so the result is the same on every run
 * and for any `concurrency` (the number of chunks drawn at the same time).
 */
export async function renderFrames(o: {
  serveUrl: string;
  inputProps: Record<string, unknown>;
  from: number;
  to: number;
  outDir: string;
  concurrency?: number;
  onProgress?: (done: number, total: number) => void;
}): Promise<void> {
  fs.mkdirSync(o.outDir, {recursive: true});
  const exe = await browser();
  const composition = await selectComposition({serveUrl: o.serveUrl, id: 'Ad', inputProps: o.inputProps, chromiumOptions: CHROME, browserExecutable: exe});
  const total = o.to - o.from + 1;
  let done = 0;
  const chunks: [number, number][] = [];
  for (let a = o.from; a <= o.to; a += CHUNK) chunks.push([a, Math.min(a + CHUNK - 1, o.to)]);
  let next = 0;
  const worker = async () => {
    while (next < chunks.length) {
      const [a, b] = chunks[next++];
      await remotionFrames({
        serveUrl: o.serveUrl,
        composition,
        inputProps: o.inputProps,
        frameRange: [a, b],
        concurrency: 1,
        imageFormat: 'jpeg',
        jpegQuality: 95,
        outputDir: null,
        chromiumOptions: CHROME, browserExecutable: exe,
        onFrameBuffer: (buf, frame) => {
          fs.writeFileSync(path.join(o.outDir, name(frame)), buf);
          o.onProgress?.(++done, total);
        },
        onStart: () => {},
        onFrameUpdate: () => {},
      });
    }
  };
  await Promise.all(Array.from({length: Math.max(1, Math.min(o.concurrency ?? defaultConcurrency(), chunks.length))}, worker));
}

/** One frame as a JPEG file. */
export async function stillFrame(o: {serveUrl: string; inputProps: Record<string, unknown>; frame: number; out: string}): Promise<void> {
  const exe = await browser();
  const composition = await selectComposition({serveUrl: o.serveUrl, id: 'Ad', inputProps: o.inputProps, chromiumOptions: CHROME, browserExecutable: exe});
  fs.mkdirSync(path.dirname(o.out), {recursive: true});
  await renderStill({serveUrl: o.serveUrl, composition, inputProps: o.inputProps, frame: o.frame, output: o.out, imageFormat: 'jpeg', jpegQuality: 95, chromiumOptions: CHROME, browserExecutable: exe});
}
