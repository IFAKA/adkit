import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {describe, expect, it} from 'vitest';
import {bundleProject} from '../src/render/bundle';
import {renderFrames} from '../src/render/render';
import {load, ROOT} from './helpers';

const md5 = (f: string) => crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex');

describe('renderer', () => {
  it('renders the same frames byte for byte twice', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'adkit-render-'));
    const pub = path.join(tmp, 'public');
    fs.mkdirSync(pub);
    const {spec, plan} = load('minimal');
    // no captures: screens fall back to plain colours, which is enough to check determinism
    const box = (x: number, y: number, w: number, h: number) => ({x, y, w, h});
    const els = {productCard: box(16, 300, 170, 240), addButton: box(140, 490, 40, 40), cartIcon: box(330, 12, 40, 36), timeChip: box(20, 300, 100, 40), payButton: box(20, 700, 350, 54)};
    const screen = (n: string) => ({file: `captures/${n}.png`, fullFile: `captures/${n}-full.png`, fullHeight: 1200, scrollY: 0, sha: 'x', elements: els});
    const set = (accent: string) => ({theme: {bg: '#FAF5EE', fg: '#2A211B', accent}, screens: Object.fromEntries(['home', 'shop', 'checkout', 'thanks'].map((n) => [n, screen(n)]))});
    const manifest = {scale: 1, viewport: {w: 390, h: 844}, sets: {main: set('#B4532A'), sage: set('#4C6B4F'), plum: set('#6B2D5C')}};
    const bundle = await bundleProject({entry: path.join(ROOT, 'src/render/index.ts'), publicDir: pub, outDir: path.join(tmp, 'bundle')});
    const frames = [0, Math.floor(plan.total / 2), plan.total - 1];
    const hashes: string[][] = [];
    for (const run of [1, 2]) {
      const dir = path.join(tmp, `r${run}`);
      for (const f of frames) await renderFrames({serveUrl: bundle, inputProps: {plan, spec, manifest, assetBase: ''}, from: f, to: f, outDir: dir, concurrency: 2});
      hashes.push(fs.readdirSync(dir).sort().map((n) => md5(path.join(dir, n))));
    }
    expect(hashes[0]).toHaveLength(3);
    expect(hashes[1]).toEqual(hashes[0]);
  }, 110_000);
});
