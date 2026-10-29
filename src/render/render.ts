import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {renderFrames as remotionFrames, renderStill, selectComposition} from '@remotion/renderer';

export const defaultConcurrency = () => Math.max(1, Math.min(6, Math.floor(os.cpus().length / 2)));
const name = (n: number) => `frame-${String(n).padStart(6, '0')}.jpg`;
const CHROME = {gl: 'angle' as const, disableWebSecurity: true};

/** Renders frames [from, to] (inclusive) as frame-%06d.jpg (absolute frame numbers) in outDir. JPEG quality 95, no audio. */
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
  const composition = await selectComposition({serveUrl: o.serveUrl, id: 'Ad', inputProps: o.inputProps, chromiumOptions: CHROME});
  const total = o.to - o.from + 1;
  let done = 0;
  await remotionFrames({
    serveUrl: o.serveUrl,
    composition,
    inputProps: o.inputProps,
    frameRange: [o.from, o.to],
    concurrency: o.concurrency ?? defaultConcurrency(),
    imageFormat: 'jpeg',
    jpegQuality: 95,
    outputDir: null,
    chromiumOptions: CHROME,
    onFrameBuffer: (buf, frame) => {
      fs.writeFileSync(path.join(o.outDir, name(frame)), buf);
      o.onProgress?.(++done, total);
    },
    onStart: () => {},
    onFrameUpdate: () => {},
  });
}

/** One frame as a JPEG file. */
export async function stillFrame(o: {serveUrl: string; inputProps: Record<string, unknown>; frame: number; out: string}): Promise<void> {
  const composition = await selectComposition({serveUrl: o.serveUrl, id: 'Ad', inputProps: o.inputProps, chromiumOptions: CHROME});
  fs.mkdirSync(path.dirname(o.out), {recursive: true});
  await renderStill({serveUrl: o.serveUrl, composition, inputProps: o.inputProps, frame: o.frame, output: o.out, imageFormat: 'jpeg', jpegQuality: 95, chromiumOptions: CHROME});
}
