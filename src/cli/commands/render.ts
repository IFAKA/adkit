import fs from 'node:fs';
import path from 'node:path';
import {bundleProject} from '../../render/bundle';
import {CHUNK, GL, defaultConcurrency, renderSegments, type SegJob} from '../../render/render';
import {segmentKey, segments} from '../cache';
import {CliError, fmt, run, sha} from '../util';
import {engineVersion, PKG_ROOT, readManifest, type Project} from '../project';
import {capture} from './capture';
import {build} from './build';

export type RenderFlags = {
  force?: boolean;
  out?: string;
  /** Half size, no motion blur, every scene: for the review loop. */
  draft?: boolean;
  /** Only this scene (video only, no sound). */
  scene?: string;
  /** Only these frames, "A-B" (video only, no sound). */
  frames?: string;
};
export type RenderResult = {out: string; rebuilt: string[]; reused: string[]; seconds: number; timing: Record<string, number>};

/** Same encoder settings for every scene, so the scene files can be joined without re-encoding. */
const X264 = ['-c:v', 'libx264', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-threads', '3', '-video_track_timescale', '15360', '-fflags', '+bitexact', '-flags:v', '+bitexact', '-map_metadata', '-1'];

export async function render(p: Project, flags: RenderFlags = {}): Promise<RenderResult> {
  const t0 = Date.now();
  const timing: Record<string, number> = {};
  const stage = async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
    const t = Date.now();
    try { return await fn(); } finally { timing[name] = (Date.now() - t) / 1000; }
  };
  const draft = !!flags.draft;
  const partial = !!flags.scene || !!flags.frames;

  const cap = await stage('capture', () => capture(p, {}));
  const manifest = readManifest(p, cap.key);
  const {wav, key: audioKey} = await stage('audio', () => build(p));
  const engine = `${engineVersion()}-k${CHUNK}-${draft ? 'draft' : GL}`;
  const crf = String(p.spec.output.crf);

  // which scenes are needed
  const all = segments(p.plan).map((s) => ({...s, key: segmentKey(p.spec, p.plan, s.index, manifest, engine)}));
  type Seg = (typeof all)[number];
  let want = all;
  let range: [number, number] | undefined;
  if (flags.scene) {
    want = all.filter((s) => s.id === flags.scene);
    if (!want.length) throw new CliError(`no scene "${flags.scene}" (scenes: ${all.map((s) => s.id).join(', ')})`);
    range = [want[0].from, want[0].to];
  }
  if (flags.frames) {
    const m = /^(\d+)-(\d+)$/.exec(flags.frames);
    if (!m || +m[1] > +m[2] || +m[2] >= p.plan.total) throw new CliError(`--frames wants A-B inside 0-${p.plan.total - 1}, got "${flags.frames}"`);
    range = [+m[1], +m[2]];
    want = all.filter((s) => s.to >= range![0] && s.from <= range![1]);
  }

  // 1. the Remotion bundle, cached by render sources + captures
  const bundleKey = sha(engineVersion(), cap.key).slice(0, 16);
  const bundleDir = path.join(p.adkit, 'bundle', bundleKey);
  await stage('bundle', async () => {
    if (fs.existsSync(path.join(bundleDir, 'index.html'))) return;
    fs.rmSync(path.join(p.adkit, 'bundle'), {recursive: true, force: true});
    await bundleProject({entry: path.join(PKG_ROOT, 'src', 'render', 'index.ts'), publicDir: path.join(p.adkit, 'public'), outDir: bundleDir});
  });

  // 2. per scene: frames (one pool of workers for all scenes) and a video file (encoded as soon as its frames exist)
  const framesDir = (key: string) => path.join(p.adkit, 'frames', key);
  const encDir = path.join(p.adkit, 'enc');
  fs.mkdirSync(encDir, {recursive: true});
  const encFile = (key: string) => path.join(encDir, `${sha(key, crf, X264.join(' '), draft ? 'draft' : 'full').slice(0, 20)}.mp4`);
  const encodeScene = async (s: Seg) => {
    const out = encFile(s.key);
    const tmp = `${out}.tmp-${process.pid}.mp4`;
    await run('ffmpeg', [
      '-y', '-v', 'error', '-framerate', String(p.plan.fps), '-start_number', String(s.from), '-i', path.join(framesDir(s.key), 'frame-%06d.jpg'),
      '-frames:v', String(s.to - s.from + 1), ...X264, '-crf', crf, '-g', '60', tmp,
    ], {logFile: p.rep.logFile('render'), nice: true});
    fs.renameSync(tmp, out);
  };
  const framesDone = (s: Seg) => fs.existsSync(path.join(framesDir(s.key), '.done'));
  const needFrames = (s: Seg) => !!flags.force || (!framesDone(s) && (partial || !fs.existsSync(encFile(s.key))));
  const wantEnc = (s: Seg) => !partial && (!!flags.force || !fs.existsSync(encFile(s.key)));
  const rebuilt: string[] = [];
  const reused: string[] = [];
  const encodes: Promise<void>[] = [];
  const jobs: SegJob[] = [];
  const bySeg = new Map<string, Seg>();
  for (const s of want) {
    const label = `${s.id}[${s.from}-${s.to}]`;
    if (needFrames(s)) {
      fs.rmSync(framesDir(s.key), {recursive: true, force: true});
      jobs.push({id: s.id, dir: framesDir(s.key), from: s.from, to: s.to});
      bySeg.set(s.id, s);
      rebuilt.push(label);
    } else reused.push(label);
  }
  await stage('frames', async () => {
    const inputProps = {plan: p.plan, spec: p.spec, manifest, assetBase: '', draft};
    await renderSegments({
      serveUrl: bundleDir, inputProps, jobs, scale: draft ? 0.5 : 1, gl: draft ? 'angle' : undefined,
      onSegment: (job, sec) => {
        const s = bySeg.get(job.id)!;
        fs.writeFileSync(path.join(job.dir, '.done'), String(Date.now()));
        p.rep.line('render', `scene ${job.id}[${job.from}-${job.to}] ${job.to - job.from + 1} frames (${fmt(sec)})`);
        if (wantEnc(s)) encodes.push(encodeScene(s));
      },
    });
    // scenes whose frames were already there but whose video file is missing
    for (const s of want) if (!bySeg.has(s.id) && wantEnc(s) && framesDone(s)) encodes.push(encodeScene(s));
    await Promise.all(encodes);
  });

  const base = path.resolve(p.dir, flags.out ?? p.spec.output.file);

  // 3a. one scene or a frame range: video only, straight from the frames
  if (partial) {
    const [a, b] = range!;
    const out = flags.out ? base : base.replace(/\.mp4$/, `.${flags.scene ?? `frames-${a}-${b}`}${draft ? '.draft' : ''}.mp4`);
    await stage('encode', async () => {
      const seq = path.join(p.adkit, 'seq');
      fs.rmSync(seq, {recursive: true, force: true});
      fs.mkdirSync(seq, {recursive: true});
      for (const s of want) for (let f = s.from; f <= s.to; f++) {
        const n = `frame-${String(f).padStart(6, '0')}.jpg`;
        fs.symlinkSync(path.join(framesDir(s.key), n), path.join(seq, n));
      }
      fs.mkdirSync(path.dirname(out), {recursive: true});
      await run('ffmpeg', ['-y', '-v', 'error', '-framerate', String(p.plan.fps), '-start_number', String(a), '-i', path.join(seq, 'frame-%06d.jpg'), '-frames:v', String(b - a + 1), ...X264, '-crf', crf, out], {logFile: p.rep.logFile('render'), nice: true});
    });
    return finish(p, t0, timing, out, rebuilt, reused, want.length, all.length);
  }

  // 3b. the whole ad: join the scene files (no re-encode) and add the sound
  const out = draft && !flags.out ? base.replace(/\.mp4$/, '.draft.mp4') : base;
  await stage('mux', async () => {
    const m4a = wav.replace(/\.wav$/, '.m4a');
    if (!fs.existsSync(m4a)) {
      await run('ffmpeg', ['-y', '-v', 'error', '-i', wav, '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-fflags', '+bitexact', '-flags:a', '+bitexact', '-map_metadata', '-1', `${m4a}.tmp.m4a`], {logFile: p.rep.logFile('render')});
      fs.renameSync(`${m4a}.tmp.m4a`, m4a);
    }
    const stamp = path.join(p.adkit, 'final', `${sha(out).slice(0, 16)}.json`);
    const finalKey = sha(all.map((s) => encFile(s.key)).join('|'), audioKey);
    if (!flags.force && fs.existsSync(out) && fs.existsSync(stamp) && JSON.parse(fs.readFileSync(stamp, 'utf8')).key === finalKey) return;
    const list = path.join(p.adkit, 'concat.txt');
    fs.writeFileSync(list, all.map((s) => `file '${encFile(s.key)}'`).join('\n') + '\n');
    fs.mkdirSync(path.dirname(out), {recursive: true});
    const tmp = `${out}.tmp.mp4`;
    await run('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-i', m4a, '-map', '0:v', '-map', '1:a', '-c', 'copy', '-shortest', '-movflags', '+faststart', '-fflags', '+bitexact', '-map_metadata', '-1', '-f', 'mp4', tmp], {logFile: p.rep.logFile('render')});
    fs.renameSync(tmp, out);
    fs.mkdirSync(path.dirname(stamp), {recursive: true});
    fs.writeFileSync(stamp, JSON.stringify({key: finalKey}));
  });
  return finish(p, t0, timing, out, rebuilt, reused, want.length, all.length);
}

function finish(p: Project, t0: number, timing: Record<string, number>, out: string, rebuilt: string[], reused: string[], n: number, total: number): RenderResult {
  const seconds = (Date.now() - t0) / 1000;
  timing.total = seconds;
  fs.mkdirSync(p.rep.logsDir, {recursive: true});
  fs.writeFileSync(path.join(p.rep.logsDir, 'timing.json'), JSON.stringify({at: new Date().toISOString(), rebuilt, reused, workers: defaultConcurrency(), seconds: Object.fromEntries(Object.entries(timing).map(([k, v]) => [k, Math.round(v * 100) / 100]))}, null, 2));
  const parts = Object.entries(timing).filter(([k]) => k !== 'total').map(([k, v]) => `${k} ${fmt(v)}`).join(' | ');
  p.rep.line('render', `${path.relative(process.cwd(), out)}: rebuilt ${rebuilt.length}/${n}${n < total ? ` of ${total}` : ''} scenes [${rebuilt.join(', ') || 'none'}]`);
  p.rep.line('timing', `${parts} | total ${fmt(seconds)}`);
  return {out, rebuilt, reused, seconds, timing};
}
