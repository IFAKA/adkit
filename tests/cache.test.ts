import {describe, expect, it} from 'vitest';
import {segmentKey, segments, screenRefs, splitRef} from '../src/cli/cache';
import {compile} from '../src/engine/compile';
import type {Manifest} from '../src/capture/manifest';
import {clone, load} from './helpers';

const manifest: Manifest = {
  scale: 3, viewport: {w: 390, h: 844},
  sets: Object.fromEntries(['main', 'sage', 'plum'].map((s) => [s, {theme: {bg: '#fff', fg: '#000', accent: '#f00'}, screens: Object.fromEntries(['home', 'shop', 'checkout', 'thanks'].map((n) => [n, {file: `${s}/${n}.png`, fullFile: `${s}/${n}-full.png`, fullHeight: 1600, scrollY: 0, sha: `${s}-${n}-1`, elements: {}}]))}])),
};
const keys = (spec: any) => { const plan = compile(spec); return segments(plan).map((s) => segmentKey(spec, plan, s.index, manifest, 'e1')); };

describe('segment cache keys', () => {
  it('are stable for the same spec', () => {
    const {spec} = load('minimal');
    expect(keys(clone(spec))).toEqual(keys(clone(spec)));
  });

  it('change only the edited scene when one title changes', () => {
    const {spec} = load('minimal');
    const a = keys(spec);
    const s = clone(spec);
    (s.scenes[1] as any).titles[0].lines = ['Pick any *bag.*'];
    const b = keys(s);
    expect(b.filter((k, i) => k !== a[i]).length).toBe(1);
    expect(b[1]).not.toBe(a[1]);
  });

  it('change only that scene when a later scene title changes', () => {
    const {spec} = load('minimal');
    const a = keys(spec);
    const s = clone(spec);
    (s.scenes[3] as any).title.lines = ['Fresh in *two_days.*'];
    const b = keys(s);
    expect(b.map((k, i) => k !== a[i])).toEqual([false, false, false, true]);
  });

  it('change when the engine version or a capture changes', () => {
    const {spec} = load('minimal');
    const plan = compile(spec);
    const k = (m: Manifest, e: string) => segmentKey(spec, plan, 1, m, e);
    const m2 = structuredClone(manifest);
    m2.sets.main.screens.shop.sha = 'other';
    expect(k(manifest, 'e1')).not.toBe(k(manifest, 'e2'));
    expect(k(manifest, 'e1')).not.toBe(k(m2, 'e1'));
  });

  it('finds screen references with and without a set', () => {
    expect([...screenRefs({a: [{screen: 'home'}, {variants: [{screen: 'sage/home'}]}]})].sort()).toEqual(['home', 'sage/home']);
    expect(splitRef('plum/home')).toEqual({set: 'plum', screen: 'home'});
    expect(splitRef('home')).toEqual({set: 'main', screen: 'home'});
  });
});
