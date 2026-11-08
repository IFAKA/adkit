import {describe, expect, it} from 'vitest';
import {AdSpec} from '../src/spec/schema';
import {compile} from '../src/engine/compile';
import {buildModel} from '../src/render/model';
import {load} from './helpers';
import {CUE_KINDS} from '../src/engine/cue-roles';

const box = (x: number, y: number, w: number, h: number) => ({x, y, w, h});
const els = {productCard: box(16, 300, 170, 240), addButton: box(140, 490, 40, 40), cartIcon: box(330, 12, 40, 36), timeChip: box(20, 300, 100, 40), payButton: box(20, 700, 350, 54)};
const screen = (n: string) => ({file: `captures/${n}.png`, fullFile: `captures/${n}-full.png`, fullHeight: 1200, scrollY: 0, sha: 'x', elements: els});
const manifest: any = {scale: 1, viewport: {w: 390, h: 844}, sets: {main: {theme: {bg: '#FAF5EE', fg: '#2A211B', accent: '#B4532A'}, screens: Object.fromEntries(['home', 'shop', 'checkout', 'thanks'].map((n) => [n, screen(n)]))}}};

/** The minimal example with the steps after its check removed (no screen follows the check). */
const modelWith = (steps: unknown[]) => {
  const raw = structuredClone(load('minimal').spec) as any;
  raw.scenes[1].steps = steps;
  for (const k of CUE_KINDS) raw.sound.cues[k] ??= 'silent';
  const spec = AdSpec.parse(raw);
  return buildModel({plan: compile(spec), spec, manifest, assetBase: ''});
};

describe('check step', () => {
  it('has a finite fade time when no screen step follows it (it stays until the block ends)', () => {
    const m = modelWith([
      {type: 'screen', at: 0.5, screen: 'checkout'},
      {type: 'check', at: 3},
    ]);
    const checks = m.layers.filter((l) => l.check).map((l) => l.check!);
    expect(checks).toHaveLength(1);
    expect(Number.isFinite(checks[0].fadeAt)).toBe(true);
  });

  it('still fades 2 frames after the next screen when one follows', () => {
    const m = modelWith([
      {type: 'screen', at: 0.5, screen: 'checkout'},
      {type: 'check', at: 3},
      {type: 'screen', at: 5, screen: 'thanks'},
    ]);
    const c = m.layers.find((l) => l.check)!.check!;
    const thanks = m.layers.find((l) => l.ref.name === 'thanks')!.at;
    expect(c.fadeAt).toBe(thanks + 2);
  });
});
