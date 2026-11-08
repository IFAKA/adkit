import {describe, expect, it} from 'vitest';
import {setFps, track, CAM_SPRINGS, type Key} from '../src/render/lib/anim';
import {wordStarts, readingRows} from '../src/engine/reading';
import {Title} from '../src/spec/schema';
import {load} from './helpers';

const sample = (key: 'snappy' | 'drift') => {
  setFps(30);
  const keys: Key[] = [[0, 0], [10, 1, CAM_SPRINGS[key]]];
  return Array.from({length: 61}, (_, i) => track(10 + i, keys));
};
const speeds = (v: number[]) => v.slice(1).map((x, i) => x - v[i]);

describe('camera feels', () => {
  it('snappy has its peak speed in the first fifth of the move and settles', () => {
    const v = sample('snappy');
    const s = speeds(v);
    const settle = v.findIndex((x) => x > 0.99);
    expect(settle).toBeGreaterThan(5);
    expect(s.indexOf(Math.max(...s))).toBeLessThan(settle / 5);
    expect(v[v.length - 1]).toBeCloseTo(1, 2);
  });
  it('drift slows down but still moves at the end of the move', () => {
    const v = sample('drift');
    const s = speeds(v);
    const end = CAM_SPRINGS.drift.frames!;
    expect(v[end]).toBeCloseTo(1, 2);
    expect(s[end - 1]).toBeGreaterThan(0.005);
    expect(s[end - 1]).toBeLessThan(s[0]);
    expect(v[v.length - 1]).toBeCloseTo(1, 5);
  });
  it('keeps the old spring names working', () => {
    for (const k of ['soft', 'fast', 'tap', 'slow', 'snap']) expect(CAM_SPRINGS).toHaveProperty(k);
  });
});

describe('title stagger', () => {
  it('uses the frame gaps in order and repeats the last one', () => {
    expect(wordStarts(5, [2, 4, 4])).toEqual([0, 2, 6, 10, 14]);
    expect(wordStarts(4, [2, 5])).toEqual([0, 2, 7, 12]);
  });
  it('defaults to 3 frames between words', () => {
    expect(wordStarts(3)).toEqual([0, 3, 6]);
  });
  it('accepts only whole frame gaps', () => {
    expect(() => Title.parse({lines: ['a b'], stagger: [2, 4]})).not.toThrow();
    expect(() => Title.parse({lines: ['a b'], stagger: [0.5]})).toThrow();
    expect(() => Title.parse({lines: ['a b'], stagger: []})).toThrow();
  });
  it('reading time counts the longer entrance', () => {
    const a = load('minimal');
    const base = readingRows(a.plan, a.spec).map((r) => r.visible);
    const plan = {...a.plan, titles: a.plan.titles.map((x) => ({...x, spec: {...x.spec, stagger: [10]}}))};
    const more = readingRows(plan, a.spec).map((r) => r.visible);
    expect(more.some((v, i) => v < base[i])).toBe(true);
  });
});
