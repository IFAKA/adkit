import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {ensureBrowser, openBrowser, renderFrames as remotionFrames, renderStill, selectComposition} from '@remotion/renderer';

/** Workers: all cores but two, at most 10 (measured: more gives nothing, the machine stays usable). */
export const defaultConcurrency = () => Number(process.env.ADKIT_WORKERS) || Math.max(1, Math.min(10, os.cpus().length - 2));
const name = (n: number) => `frame-${String(n).padStart(6, '0')}.jpg`;
/**
 * Render modes (env ADKIT_GL):
 *  - "cpu" (default): Chrome draws on the CPU, one raster thread, no partial raster. Measured byte-stable:
 *    6 runs of 180 frames gave 0 differing frames. Without those two flags a few frames differed.
 *  - "swiftshader", "angle": Chrome draws through a software or real GPU stack. Faster for "angle", but on blurred
 *    shadows a few pixels differ by one level between runs, so cached scenes would not equal a fresh render.
 */
export type Mode = 'cpu' | 'swiftshader' | 'swangle' | 'angle';
export const GL = (process.env.ADKIT_GL ?? 'cpu') as Mode;
const chrome = (gl: Mode) => ({gl: (gl === 'cpu' ? 'swiftshader' : gl) as 'swiftshader' | 'swangle' | 'angle', disableWebSecurity: true});
const CHROME = chrome(GL);

let browserPath: string | null | undefined;
/** The Chrome to run: ADKIT_CHROME, or in "cpu" mode a tiny wrapper around Remotion's headless shell that turns the GPU off. */
async function browser(gl: Mode = GL): Promise<string | null> {
  if (process.env.ADKIT_CHROME) return process.env.ADKIT_CHROME;
  if (gl !== 'cpu') return null;
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

/** Frames per chunk. A chunk is drawn in order by one tab, and the chunk grid starts at the scene start, so it never depends on timing. */
export const CHUNK = 10;

export type SegJob = {id: string; dir: string; from: number; to: number};

/**
 * Renders the frames of many scenes with one pool of workers. Each worker keeps one browser for the whole run and
 * opens a fresh tab per chunk of CHUNK frames, so the pixels do not depend on which worker drew a chunk or when.
 * Frames are frame-%06d.jpg (absolute frame numbers, JPEG quality 95) in each job's dir.
 * `scale` 0.5 is for drafts. onSegment is called when all chunks of a scene are on disk.
 */
export async function renderSegments(o: {
  serveUrl: string;
  inputProps: Record<string, unknown>;
  jobs: SegJob[];
  workers?: number;
  scale?: number;
  /** Draw mode; drafts use the GPU (about 5x faster, not byte-stable). */
  gl?: Mode;
  onSegment?: (job: SegJob, seconds: number) => void;
}): Promise<void> {
  if (!o.jobs.length) return;
  const mode = o.gl ?? GL;
  const CH = chrome(mode);
  const exe = await browser(mode);
  const composition = await selectComposition({serveUrl: o.serveUrl, id: 'Ad', inputProps: o.inputProps, chromiumOptions: CH, browserExecutable: exe});
  type Chunk = {job: SegJob; a: number; b: number};
  const left = new Map<string, number>();
  const started = new Map<string, number>();
  const chunks: Chunk[] = [];
  // longest scenes first: the pool stays busy to the end
  for (const job of [...o.jobs].sort((x, y) => (y.to - y.from) - (x.to - x.from))) {
    fs.mkdirSync(job.dir, {recursive: true});
    let n = 0;
    for (let a = job.from; a <= job.to; a += CHUNK) { chunks.push({job, a, b: Math.min(a + CHUNK - 1, job.to)}); n++; }
    left.set(job.id, n);
  }
  let next = 0;
  const workers = Math.max(1, Math.min(o.workers ?? defaultConcurrency(), chunks.length));
  const worker = async () => {
    const exeArg = exe;
    const instance = await openBrowser('chrome', {browserExecutable: exeArg, chromiumOptions: CH, forceDeviceScaleFactor: o.scale ?? 1});
    try {
      while (next < chunks.length) {
        const {job, a, b} = chunks[next++];
        if (!started.has(job.id)) started.set(job.id, Date.now());
        await remotionFrames({
          serveUrl: o.serveUrl,
          composition,
          inputProps: o.inputProps,
          frameRange: [a, b],
          concurrency: 1,
          scale: o.scale ?? 1,
          imageFormat: 'jpeg',
          jpegQuality: o.scale && o.scale < 1 ? 80 : 95,
          outputDir: null,
          puppeteerInstance: instance,
          chromiumOptions: CH, browserExecutable: exeArg,
          onFrameBuffer: (buf, frame) => { fs.writeFileSync(path.join(job.dir, name(frame)), buf); },
          onStart: () => {},
          onFrameUpdate: () => {},
        });
        const rest = left.get(job.id)! - 1;
        left.set(job.id, rest);
        if (rest === 0) o.onSegment?.(job, (Date.now() - started.get(job.id)!) / 1000);
      }
    } finally {
      await instance.close({silent: true}).catch(() => {});
    }
  };
  await Promise.all(Array.from({length: workers}, worker));
}

/** One frame as a JPEG file. */
export async function stillFrame(o: {serveUrl: string; inputProps: Record<string, unknown>; frame: number; out: string}): Promise<void> {
  const exe = await browser();
  const composition = await selectComposition({serveUrl: o.serveUrl, id: 'Ad', inputProps: o.inputProps, chromiumOptions: CHROME, browserExecutable: exe});
  fs.mkdirSync(path.dirname(o.out), {recursive: true});
  await renderStill({serveUrl: o.serveUrl, composition, inputProps: o.inputProps, frame: o.frame, output: o.out, imageFormat: 'jpeg', jpegQuality: 95, chromiumOptions: CHROME, browserExecutable: exe});
}

/** One range of frames into one folder (used by tests and tools). */
export async function renderFrames(o: {serveUrl: string; inputProps: Record<string, unknown>; from: number; to: number; outDir: string; concurrency?: number; scale?: number; onProgress?: (done: number, total: number) => void}): Promise<void> {
  await renderSegments({serveUrl: o.serveUrl, inputProps: o.inputProps, jobs: [{id: 'range', dir: o.outDir, from: o.from, to: o.to}], workers: o.concurrency, scale: o.scale});
}
