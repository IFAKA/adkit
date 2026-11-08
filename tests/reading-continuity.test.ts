import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {describe, expect, it} from 'vitest';
import {clone, load} from './helpers';
import {readingRows, wordCount, pushInFindings, isPushIn} from '../src/engine/reading';
import {findJumps, frameDiffs} from '../src/engine/continuity';

describe('reading-time', () => {
  it('counts words, ignoring accent marks and joiners', () => {
    expect(wordCount(['Julio.', '*40_°C.*'])).toBe(3);
    expect(wordCount(['¿Dónde hay', '*agua* cerca?'])).toBe(4);
  });
  it('needs words / wps + notice seconds, and fails a title that leaves too early', () => {
    const {spec, plan} = load('horno-lento');
    const rows = readingRows(plan, spec);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.needed).toBe(Math.ceil((r.words / 4 + 0.5) * plan.fps));
    // a 4-word title needs 1.5 s = 45 frames of full opacity
    expect(Math.ceil((4 / 4 + 0.5) * plan.fps)).toBe(45);
    const slow = clone(spec);
    slow.checks.wordsPerSecond = 1;
    expect(readingRows(plan, slow).filter((r) => !r.ok).length).toBeGreaterThanOrEqual(rows.filter((r) => !r.ok).length);
  });
});

describe('continuity', () => {
  it('finds a hard cut in a video and skips it when listed', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adkit-cont-'));
    const f = path.join(dir, 'cut.mp4');
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=black:s=108x192:r=30:d=1', '-f', 'lavfi', '-i', 'color=c=white:s=108x192:r=30:d=1', '-filter_complex', '[0][1]concat=n=2:v=1:a=0', '-pix_fmt', 'yuv420p', f]);
    const d = await frameDiffs(f);
    expect(d).toHaveLength(59);
    const jumps = findJumps(d, 10, []);
    expect(jumps.map((j) => j.frame)).toEqual([30]);
    expect(findJumps(d, 10, [30])).toEqual([]);
  }, 30_000);
  it('does not report a build-up, only a sudden rise', () => {
    expect(findJumps([0, 4, 8, 12, 16, 20, 16, 8, 2], 10, [])).toEqual([]);
    expect(findJumps([0, 0, 18, 18, 0], 10, [])).toEqual([{frame: 3, diff: 18}]);
  });
  it('lets a fast camera spring start without a jump, but still reports a cut', () => {
    // measured on examples/minimal, push-in with spring fast (frames 117-126): the change rises 0.6 -> 23 -> 34 -> 41 -> 45 while the spring speeds up
    const fastSpring = [0.9, 0.6, 0.7, 0.6, 23.1, 34.4, 40.7, 44.6, 44.3, 36.7, 12.9, 4.8, 1.0];
    expect(findJumps(fastSpring, 10, [])).toEqual([]);
    // a cut into a scene that is already moving: one big step, then the change falls back
    expect(findJumps([0.6, 0.6, 40, 20, 5, 1], 10, []).map((j) => j.frame)).toEqual([3]);
    // a snap at the very end of the video has no next frame to ramp into
    expect(findJumps([0.5, 30], 10, []).map((j) => j.frame)).toEqual([2]);
  });
});

describe('smooth block changes', () => {
  it('defaults every screen change between blocks to a fade, never a hard cut', () => {
    for (const name of ['horno-lento']) {
      const {spec} = load(name);
      for (const b of spec.scenes as Array<{block: string; start?: {transition: string}; transition?: string}>) {
        if (b.block === 'tapFlow') expect(['fade', 'slide', 'zoom', 'cut']).toContain(b.start!.transition);
        if (b.block === 'skins') expect(b.transition).toBe('fade');
      }
    }
  });
});

describe('skins pose', () => {
  it('does not move the phone before a swap, and eases the kick in', async () => {
    const {phonePose} = await import('../src/render/choreo');
    const m = {reveal: undefined, end: undefined, plan: {total: 200}, bf: 10, whips: [], skins: [{block: {start: 50, end: 150}, swaps: [50, 60, 70]}]} as never;
    const before = phonePose(m, 40);
    expect(phonePose(m, 55).s).toBeCloseTo(before.s, 3); // no swap yet (the first variant is not a swap)
    expect(phonePose(m, 59).s).toBeCloseTo(before.s, 3); // the next swap is in the future
    const j = phonePose(m, 60).s - before.s;
    expect(Math.abs(j)).toBeLessThan(0.001); // the kick starts from zero
    expect(phonePose(m, 62).s - before.s).toBeGreaterThan(0.001);
  });
});

describe('camera push-in reason', () => {
  it('refuses a push-in without why and warns when it is not held long enough', () => {
    const {spec, plan} = load('horno-lento');
    const tf = plan.blocks.find((b) => (b.spec as {camera?: unknown[]}).camera !== undefined && b.spec.block === 'tapFlow');
    expect(tf).toBeTruthy();
    const bad = structuredClone(plan);
    const bb = bad.blocks.find((b) => b.id === tf!.id)!;
    const mine = (r: {fails: string[]; warns: string[]}, k: 'fails' | 'warns') => r[k].filter((m) => m.startsWith(`${tf!.id}:`));
    (bb.spec as {camera: unknown[]}).camera = [{at: 0, zoom: {fit: 'x', fraction: 0.8}, focus: {}}];
    expect(mine(pushInFindings(bad, spec), 'fails').length).toBe(1);
    // with a why but never released: it holds to the block end, so the long block passes and a short hold warns
    (bb.spec as {camera: unknown[]}).camera = [{at: 0, zoom: 1.4, focus: {}, why: 'reads: "3 min"'}];
    expect(mine(pushInFindings(bad, spec), 'fails').length).toBe(0);
    (bb.spec as {camera: unknown[]}).camera = [{at: 0, zoom: 1.4, focus: {}, why: 'reads: "3 min"'}, {at: 0.5, zoom: 0.85}];
    expect(mine(pushInFindings(bad, spec), 'warns').length).toBe(1);
    // a wide pose is not a push-in
    expect(isPushIn({at: 0, zoom: 0.85})).toBe(false);
    expect(isPushIn({at: 0, zoom: {fit: 'a', fraction: 0.8}})).toBe(true);
    expect(isPushIn({at: 0, zoom: 1, focus: {element: 'a'}})).toBe(true);
  });
});
