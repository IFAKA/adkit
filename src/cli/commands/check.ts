import fs from 'node:fs';
import path from 'node:path';
import type {Manifest} from '../../capture/manifest';
import {layoutBoxes} from '../../render/geometry';
import {screenRefs, splitRef} from '../cache';
import {readManifest, type Project} from '../project';
import {fmt, run} from '../util';
import {capture} from './capture';

export const SAFE_TOP = 250;
export const SAFE_BOTTOM = 400;
export const MIN_TITLE_PX = 64;

export type Finding = {check: string; ok: boolean; msg: string; warn?: boolean};

async function probe(file: string) {
  const out = await run('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate,nb_read_frames,duration', '-of', 'json', file], {capture: true});
  const s = JSON.parse(out).streams[0];
  const [n, d] = String(s.r_frame_rate).split('/').map(Number);
  return {width: +s.width, height: +s.height, fps: n / (d || 1), frames: +s.nb_read_frames};
}

export async function loudness(file: string): Promise<{lufs: number; truePeak: number}> {
  const out = await run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-vn', '-af', 'ebur128=peak=true', '-f', 'null', '-'], {capture: true});
  const tail = out.slice(out.lastIndexOf('Summary:'));
  const i = /I:\s+(-?[\d.]+)\s+LUFS/.exec(tail);
  const tp = /Peak:\s+(-?[\d.]+)\s+dBFS/.exec(tail);
  if (!i || !tp) throw new Error('could not read loudness from ffmpeg');
  return {lufs: +i[1], truePeak: +tp[1]};
}

/** Mean colour saturation (0-255 scale) of one frame per `every` seconds. */
async function saturation(file: string, every: number): Promise<{t: number; sat: number}[]> {
  const out = await run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-vf', `fps=1/${every},signalstats,metadata=print:key=lavfi.signalstats.SATAVG`, '-an', '-f', 'null', '-'], {capture: true});
  return [...out.matchAll(/pts_time:([\d.]+)[\s\S]*?SATAVG=([\d.]+)/g)].map((m) => ({t: +m[1], sat: +m[2]}));
}

export function checkCaptures(p: Project, manifest: Manifest, capDir: string): Finding[] {
  const f: Finding[] = [];
  const missing: string[] = [];
  const bad: string[] = [];
  for (const ref of [...screenRefs(p.spec.scenes)].sort()) {
    const {set, screen} = splitRef(ref);
    const s = manifest.sets[set]?.screens[screen];
    if (!s) { missing.push(`screen "${ref}" is not in the captures`); continue; }
    for (const file of [s.file, s.fullFile]) if (file && !fs.existsSync(path.join(capDir, file))) missing.push(`file ${file} (screen ${ref}) is missing`);
    for (const [name, b] of Object.entries(s.elements)) {
      const w = manifest.viewport.w;
      const h = Math.max(s.fullHeight, manifest.viewport.h);
      if (b.w <= 0 || b.h <= 0 || b.x < -1 || b.y < -1 || b.x + b.w > w + 1 || b.y + b.h > h + 1) bad.push(`${ref}.${name} box ${JSON.stringify(b)} is outside ${w}x${h}`);
    }
  }
  f.push({check: 'captures', ok: !missing.length, msg: missing.length ? missing.join('; ') : 'every screen and file the spec uses exists'});
  f.push({check: 'boxes', ok: !bad.length, msg: bad.length ? bad.slice(0, 5).join('; ') : 'all element boxes are inside their page'});
  return f;
}

export async function check(p: Project, opts: {video?: string; warm?: boolean} = {}) {
  const t0 = Date.now();
  const cap = await capture(p, {});
  const manifest = readManifest(p, cap.key);
  const capDir = path.join(p.adkit, 'captures', cap.key);
  const out: Finding[] = [];
  const { plan, spec } = p;

  // cues are on the grid (the compiler already fails otherwise; this re-checks the written plan)
  const off = plan.cues.filter((c) => { const m = c.frame % plan.beat; return !(m === 0 || m === Math.floor(plan.beat / 2)); });
  out.push({check: 'cues', ok: !off.length, msg: off.length ? `off grid: ${off.map((c) => c.name).join(', ')}` : `${plan.cues.length} cues on the beat grid`});

  out.push(...checkCaptures(p, manifest, capDir));

  // titles: size and Instagram safe zones, from the real layout boxes
  const boxes = layoutBoxes(plan, spec, manifest);
  const H = plan.height;
  const unsafe = boxes.filter((b) => b.box.y < SAFE_TOP || b.box.y + b.box.h > H - SAFE_BOTTOM);
  const small = boxes.filter((b) => b.fontSize < MIN_TITLE_PX);
  out.push({check: 'safe-zone', ok: !unsafe.length, msg: unsafe.length ? `text inside the top ${SAFE_TOP}px / bottom ${SAFE_BOTTOM}px at frames ${[...new Set(unsafe.map((b) => b.frame))].slice(0, 6).join(', ')} (${unsafe[0].block})` : `no text in the top ${SAFE_TOP}px or bottom ${SAFE_BOTTOM}px (${boxes.length} title boxes)`});
  out.push({check: 'title-size', ok: !small.length, msg: small.length ? `title font ${small[0].fontSize}px < ${MIN_TITLE_PX}px in ${small[0].block}` : `all titles >= ${MIN_TITLE_PX}px`});

  // the video file
  const video = path.resolve(p.dir, opts.video ?? spec.output.file);
  if (!fs.existsSync(video)) {
    out.push({check: 'video', ok: false, msg: `${path.relative(process.cwd(), video)} does not exist: run "adkit render"`});
  } else {
    const v = await probe(video);
    const okV = v.width === plan.width && v.height === plan.height && Math.abs(v.fps - plan.fps) < 0.01 && v.frames === plan.total;
    out.push({check: 'video', ok: okV, msg: `${v.width}x${v.height} ${v.fps}fps ${v.frames} frames (want ${plan.width}x${plan.height} ${plan.fps}fps ${plan.total} frames)`});
    const l = await loudness(video);
    const target = spec.sound.loudness;
    out.push({check: 'loudness', ok: Math.abs(l.lufs - target.lufs) <= 0.5, msg: `${l.lufs} LUFS (target ${target.lufs} +-0.5)`});
    out.push({check: 'true-peak', ok: l.truePeak <= -1, msg: `${l.truePeak} dBTP (limit -1.0)`});
    if (opts.warm !== false) {
      const sats = await saturation(video, 1);
      const warm = plan.sections.filter((s) => ['groove', 'drop', 'lift', 'final'].includes(s.role));
      const grey = sats.filter((s) => s.sat < 3 && warm.some((w) => s.t >= w.startSeconds && s.t < w.endSeconds));
      out.push({check: 'warm', ok: !grey.length, warn: true, msg: grey.length ? `grey frames at ${grey.map((g) => g.t + 's').join(', ')}` : 'no grey frames in warm sections'});
    }
  }

  let failed = 0;
  for (const c of out) {
    if (!c.ok && !c.warn) failed++;
    p.rep.line('check', `${c.ok ? 'ok  ' : c.warn ? 'warn' : 'FAIL'} ${c.check.padEnd(11)} ${c.msg}`);
    p.rep.detail('check', `${c.ok ? 'ok' : 'fail'} ${c.check}: ${c.msg}`);
  }
  p.rep.line('check', `${failed ? `${failed} failed` : 'all passed'} (${fmt((Date.now() - t0) / 1000)})`);
  return {findings: out, failed};
}
