import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {bundleProject} from '../../render/bundle';
import {renderFrames} from '../../render/render';
import {segmentKey, segments} from '../cache';
import {engineVersion, PKG_ROOT, readManifest, type Project} from '../project';
import {fmt, run, sha} from '../util';
import {capture} from './capture';
import {build} from './build';

export type RenderResult = {out: string; rebuilt: string[]; reused: string[]; seconds: number; frames: string};

export async function render(p: Project, flags: {force?: boolean; recapture?: boolean; out?: string} = {}): Promise<RenderResult> {
  const t0 = Date.now();
  const cap = await capture(p, {});
  const manifest = readManifest(p, cap.key);
  const {wav} = await build(p);
  const engine = engineVersion();

  // 1. the Remotion bundle, cached by render sources + captures
  const bundleKey = sha(engine, cap.key).slice(0, 16);
  const bundleDir = path.join(p.adkit, 'bundle', bundleKey);
  if (!fs.existsSync(path.join(bundleDir, 'index.html'))) {
    const tb = Date.now();
    fs.rmSync(path.join(p.adkit, 'bundle'), {recursive: true, force: true});
    await bundleProject({entry: path.join(PKG_ROOT, 'src', 'render', 'index.ts'), publicDir: path.join(p.adkit, 'public'), outDir: bundleDir});
    p.rep.line('bundle', `built ${bundleKey.slice(0, 8)} (${fmt((Date.now() - tb) / 1000)})`);
  }

  // 2. frames per scene, cached by the scene's slice
  const inputProps = {plan: p.plan, spec: p.spec, manifest, assetBase: ''};
  const rebuilt: string[] = [];
  const reused: string[] = [];
  const concurrency = Math.max(1, Math.min(6, Math.floor(os.cpus().length / 2)));
  const segs = segments(p.plan).map((s) => ({...s, key: segmentKey(p.spec, p.plan, s.index, manifest, engine)}));
  for (const s of segs) {
    const dir = path.join(p.adkit, 'frames', s.key);
    const done = path.join(dir, '.done');
    const label = `${s.id}[${s.from}-${s.to}]`;
    if (!flags.force && fs.existsSync(done)) { reused.push(label); continue; }
    const ts = Date.now();
    fs.rmSync(dir, {recursive: true, force: true});
    fs.mkdirSync(dir, {recursive: true});
    await renderFrames({serveUrl: bundleDir, inputProps, from: s.from, to: s.to, outDir: dir, concurrency, onProgress: () => {}});
    fs.writeFileSync(done, String(Date.now()));
    rebuilt.push(label);
    p.rep.line('render', `scene ${label} rendered ${s.to - s.from + 1} frames (${fmt((Date.now() - ts) / 1000)})`);
  }

  // 3. one lossless chain: link every frame in order, encode once
  const seq = path.join(p.adkit, 'seq');
  fs.rmSync(seq, {recursive: true, force: true});
  fs.mkdirSync(seq, {recursive: true});
  for (const s of segs) {
    const dir = path.join(p.adkit, 'frames', s.key);
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.jpg')).sort();
    if (files.length !== s.to - s.from + 1) throw new Error(`scene ${s.id}: expected ${s.to - s.from + 1} frames, found ${files.length}`);
    files.forEach((f, i) => fs.symlinkSync(path.join(dir, f), path.join(seq, `frame-${String(s.from + i).padStart(6, '0')}.jpg`)));
  }
  const out = path.resolve(p.dir, flags.out ?? p.spec.output.file);
  fs.mkdirSync(path.dirname(out), {recursive: true});
  const te = Date.now();
  await run('ffmpeg', [
    '-y', '-v', 'error', '-framerate', String(p.plan.fps), '-i', path.join(seq, 'frame-%06d.jpg'), '-i', wav,
    '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'medium', '-crf', String(p.spec.output.crf), '-pix_fmt', 'yuv420p',
    '-threads', '4', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest', '-movflags', '+faststart',
    '-fflags', '+bitexact', '-flags:v', '+bitexact', '-flags:a', '+bitexact', '-map_metadata', '-1', out,
  ], {logFile: p.rep.logFile('render')});
  const seconds = (Date.now() - t0) / 1000;
  p.rep.line('render', `${path.relative(process.cwd(), out)}: rebuilt ${rebuilt.length}/${segs.length} scenes [${rebuilt.join(', ') || 'none'}], encode ${fmt((Date.now() - te) / 1000)}, total ${fmt(seconds)}`);
  return {out, rebuilt, reused, seconds, frames: seq};
}
