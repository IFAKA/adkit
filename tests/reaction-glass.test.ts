import {describe, expect, it} from 'vitest';
import {AdSpec} from '../src/spec/schema';
import {compile} from '../src/engine/compile';
import {buildModel} from '../src/render/model';
import {bannerSurface, reactionLook} from '../src/render/lib/Ui';
import {load} from './helpers';
import {CUE_KINDS} from '../src/engine/cue-roles';

const box = (x: number, y: number, w: number, h: number) => ({x, y, w, h});
const els = {productCard: box(16, 300, 170, 240), addButton: box(140, 490, 40, 40), cartIcon: box(330, 12, 40, 36), timeChip: box(20, 300, 100, 40), payButton: box(20, 700, 350, 54)};
const screen = (n: string) => ({file: `captures/${n}.png`, fullFile: `captures/${n}-full.png`, fullHeight: 1200, scrollY: 0, sha: 'x', elements: els});
const manifest: any = {scale: 1, viewport: {w: 390, h: 844}, sets: {main: {theme: {bg: '#FAF5EE', fg: '#2A211B', accent: '#B4532A'}, screens: Object.fromEntries(['home', 'shop', 'checkout', 'thanks'].map((n) => [n, screen(n)]))}}};

const modelWith = (steps: unknown[]) => {
  const raw = structuredClone(load('minimal').spec) as any;
  raw.scenes[1].steps = steps;
  for (const k of CUE_KINDS) raw.sound.cues[k] ??= 'silent';
  const spec = AdSpec.parse(raw);
  return buildModel({plan: compile(spec), spec, manifest, assetBase: ''});
};

describe('tap reaction', () => {
  it('starts on the tap frame', () => {
    const m = modelWith([{type: 'screen', at: 0.5, screen: 'shop'}, {type: 'tap', at: 2, element: 'addButton', reaction: 'ripple'}]);
    const l = m.layers.find((x) => x.reactions.length)!;
    expect(l.reactions).toHaveLength(1);
    expect(l.reactions[0].at).toBe(m.taps[0].at);
    expect(l.reactions[0].style).toBe('ripple');
  });

  it('is a burst when the author sets nothing', () => {
    const m = modelWith([{type: 'screen', at: 0.5, screen: 'shop'}, {type: 'tap', at: 2, element: 'addButton'}]);
    const rs = m.layers.flatMap((l) => l.reactions);
    expect(rs).toHaveLength(1);
    expect(rs[0].style).toBe('burst');
  });

  it('adds nothing for reaction none', () => {
    const m = modelWith([{type: 'screen', at: 0.5, screen: 'shop'}, {type: 'tap', at: 2, element: 'addButton', reaction: 'none'}]);
    expect(m.layers.every((l) => l.reactions.length === 0)).toBe(true);
  });

  it('burst blends up then back, ripple grows', () => {
    expect(reactionLook('burst', 0).alpha).toBe(0);
    expect(reactionLook('burst', 5).alpha).toBeGreaterThan(reactionLook('burst', 1).alpha);
    expect(reactionLook('burst', 10).alpha).toBe(0);
    expect(reactionLook('ripple', 12).grow).toBeGreaterThan(reactionLook('ripple', 3).grow);
  });
});

describe('glass banner', () => {
  it('changes the banner surface only when glass is on', () => {
    const off = bannerSurface(false);
    const on = bannerSurface(true);
    expect(on).not.toEqual(off);
    expect(on.background).toBe('rgba(255,255,255,0.25)');
    expect(String(on.backdropFilter)).toContain('blur(15px)');
    expect(String(on.border)).toContain('1px solid');
  });

  it('is off by default in the schema', () => {
    const spec = load('horno-lento').spec as any;
    const find = (o: any): any => (o && typeof o === 'object' ? (o.block === 'notification' ? o : Object.values(o).map(find).find(Boolean)) : undefined);
    const b = find(spec);
    expect(b.banner.glass).toBe(false);
  });
});
