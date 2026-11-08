import {describe, expect, it} from 'vitest';
import {setFps, track, CAM_SPRINGS, type Key} from '../src/render/lib/anim';
import {wordStarts, readingRows, SETTLE} from '../src/engine/reading';
import {CameraKey, Title} from '../src/spec/schema';
import {load} from './helpers';

const sample = (key: 'snappy' | 'drift') => {
  setFps(30);
  const keys: Key[] = [[0, 0], [10, 1, CAM_SPRINGS[key]]];
  return Array.from({length: 61}, (_, i) => track(10 + i, keys));
};
const speeds = (v: number[]) => v.slice(1).map((x, i) => x - v[i]);

describe('camera feels', () => {
  it('snappy reaches its peak speed early (no jump on the first frame) and settles', () => {
    const v = sample('snappy');
    const s = speeds(v);
    const settle = v.findIndex((x) => x > 0.99);
    expect(settle).toBeGreaterThan(5);
    expect(s.indexOf(Math.max(...s))).toBeLessThan(settle / 3);
    expect(s[0]).toBeLessThan(0.05);
    expect(v[v.length - 1]).toBeCloseTo(1, 2);
  });
  it('drift slows down but still moves at the end of the move', () => {
    const v = sample('drift');
    const s = speeds(v);
    const end = CAM_SPRINGS.drift.frames!;
    expect(v[end]).toBeCloseTo(1, 2);
    expect(s[end - 1]).toBeGreaterThan(0.005);
    expect(s[0]).toBeLessThan(0.03);
    expect(s[end - 1]).toBeLessThan(Math.max(...s));
    expect(v[v.length - 1]).toBeCloseTo(1, 5);
  });
  it('offers only snappy and drift, and snappy is the default of a camera key', () => {
    expect(Object.keys(CAM_SPRINGS).sort()).toEqual(['drift', 'snappy']);
    expect(CameraKey.parse({at: 1, zoom: 1.5}).spring).toBe('snappy');
    expect(() => CameraKey.parse({at: 1, zoom: 1.5, spring: 'fast'})).toThrow();
  });
});

describe('title stagger', () => {
  it('uses the built-in uneven gaps (2, then 4, 4 ...) in order and repeats the last one', () => {
    expect(wordStarts(5)).toEqual([0, 2, 6, 10, 14]);
    expect(wordStarts(2)).toEqual([0, 2]);
    expect(wordStarts(1)).toEqual([0]);
  });
  it('has no stagger option any more', () => {
    expect(() => Title.parse({lines: ['a b'], stagger: [2, 4]})).toThrow();
  });
  it('reading time counts the built-in entrance', () => {
    const a = load('minimal');
    const t = a.plan.titles[0];
    const row = readingRows(a.plan, a.spec).find((r) => r.block === t.block && r.index === t.index)!;
    const enter = wordStarts(row.words).pop()! + SETTLE;
    expect(row.visible).toBe((t.outAt ?? t.until) - (t.inAt + enter));
  });
});
