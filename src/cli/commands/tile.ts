import fs from 'node:fs';
import path from 'node:path';
import type {Project} from '../project';
import {run} from '../util';

/** A contact sheet: one frame per second (or `count` frames between `from` and `to`) in one PNG to look at. */
export async function tile(p: Project, flags: {video?: string; out?: string; from?: number; to?: number; count?: number; cols?: number; width?: number}) {
  const video = path.resolve(p.dir, flags.video ?? p.spec.output.file);
  if (!fs.existsSync(video)) throw new Error(`${video} does not exist: run "adkit render" first`);
  const fps = p.plan.fps;
  const range = flags.from !== undefined || flags.to !== undefined;
  const from = flags.from ?? 0;
  const to = Math.min(flags.to ?? p.plan.total - 1, p.plan.total - 1);
  const count = range ? flags.count ?? Math.min(12, to - from + 1) : Math.ceil(p.plan.total / fps);
  const cols = flags.cols ?? (range ? Math.min(6, count) : 10);
  const rows = Math.ceil(count / cols);
  const w = flags.width ?? (range ? 270 : 216);
  const out = path.resolve(p.dir, flags.out ?? path.join('.adkit', 'tiles', range ? `frames-${from}-${to}.png` : 'sheet.png'));
  fs.mkdirSync(path.dirname(out), {recursive: true});
  const step = range ? Math.max(1, Math.floor((to - from + 1) / count)) : fps;
  const sel = `select='gte(n\\,${from})*lte(n\\,${to})*not(mod(n-${from}\\,${step}))'`;
  await run('ffmpeg', ['-y', '-v', 'error', '-i', video, '-vf', `${sel},scale=${w}:-2,tile=${cols}x${rows}:padding=6:margin=6:color=0x202020`, '-frames:v', '1', out], {logFile: p.rep.logFile('tile')});
  p.rep.line('tile', `${path.relative(process.cwd(), out)} (${count} frames, ${cols}x${rows})`);
  return out;
}
