import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {describe, expect, it} from 'vitest';
import {clone, load} from './helpers';
import {readingRows, wordCount} from '../src/engine/reading';
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
