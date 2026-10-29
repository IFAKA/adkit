import fs from 'node:fs';
import path from 'node:path';
import {bundle} from '@remotion/bundler';

/** Bundles the renderer (entry = src/render/index.ts) with `publicDir` as the static folder; returns the bundle folder. */
export async function bundleProject(o: {entry: string; publicDir: string; outDir: string}): Promise<string> {
  fs.mkdirSync(o.publicDir, {recursive: true});
  fs.mkdirSync(path.dirname(o.outDir), {recursive: true});
  return bundle({entryPoint: o.entry, publicDir: o.publicDir, outDir: o.outDir, onProgress: () => {}});
}
