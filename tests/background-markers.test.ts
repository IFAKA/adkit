import {describe, expect, it} from 'vitest';
import {Background, Title} from '../src/spec/schema';
import {gradientLayers} from '../src/render/lib/gradient';
import {markerOpacity, markerBoxes, MARKER_OFFSETS, layoutTitle} from '../src/render/geometry';
import {segmentKey} from '../src/cli/cache';
import {clone, load} from './helpers';

const COLORS = ['#112233', '#445566', '#778899', '#AABBCC'];

describe('gradient background', () => {
  it('gives the same layers for the same inputs', () => {
    const a = gradientLayers({gradient: COLORS, drift: 0.2, grain: 0.7}, 41);
    expect(gradientLayers({gradient: COLORS, drift: 0.2, grain: 0.7}, 41)).toEqual(a);
  });
  it('drift 0 gives the same blobs at two times', () => {
    const bg = {gradient: COLORS, drift: 0, grain: 0.7};
    expect(gradientLayers(bg, 3).blobs).toEqual(gradientLayers(bg, 300).blobs);
  });
  it('drift moves the blobs', () => {
    const bg = {gradient: COLORS, drift: 0.5, grain: 0};
    expect(gradientLayers(bg, 3).blobs).not.toEqual(gradientLayers(bg, 300).blobs);
  });
  it('grain 0 adds no noise layer, grain 0.7 does', () => {
    expect(gradientLayers({gradient: COLORS, drift: 0.2, grain: 0}, 5).grain).toBeNull();
    expect(gradientLayers({gradient: COLORS, drift: 0.2, grain: 0.7}, 5).grain!.opacity).toBeGreaterThan(0);
  });
  it('grain moves from frame to frame', () => {
    const bg = {gradient: COLORS, drift: 0, grain: 0.7};
    expect(gradientLayers(bg, 5).grain).not.toEqual(gradientLayers(bg, 6).grain);
  });
  it('is always on: drift 0.2 and grain 0.7 unless the author tunes them', () => {
    const { spec } = load('minimal');
    expect(spec.background).toMatchObject({drift: 0.2, grain: 0.7});
    expect(spec.background.gradient).toBeUndefined();
    expect(Background.parse({})).toMatchObject({drift: 0.2, grain: 0.7});
    expect(Background.parse({drift: 0, grain: 0})).toMatchObject({drift: 0, grain: 0});
  });
  it('changes the scene cache key', () => {
    const { spec, plan } = load('minimal');
    const s = clone(spec);
    s.background = Background.parse({grain: 0.5});
    expect(segmentKey(s, plan, 0, undefined, 'e')).not.toBe(segmentKey(spec, plan, 0, undefined, 'e'));
  });
});

describe('flicker markers', () => {
  const pattern = (start: number, n = 16) => Array.from({length: n}, (_, i) => markerOpacity(start + i, start));
  it('follows the course pattern for the first square', () => {
    // 100; +1f 0; +1f 100; +2f 0; +1f 100; +3f 0; +2f 100; +1f 0; +1f 100, then hold
    expect(pattern(10, 14)).toEqual([1, 0, 1, 1, 0, 1, 1, 1, 0, 0, 1, 0, 1, 1]);
  });
  it('is hidden before the start and holds on afterwards', () => {
    expect(markerOpacity(9, 10)).toBe(0);
    expect(markerOpacity(500, 10)).toBe(1);
  });
  it('offsets each square so they do not flicker together', () => {
    const per = MARKER_OFFSETS.map((o) => Array.from({length: 16}, (_, f) => markerOpacity(f, o)).join(''));
    expect(new Set(per).size).toBe(4);
    expect(MARKER_OFFSETS.map((o) => markerOpacity(100, o))).toEqual([1, 1, 1, 1]);
  });
  it('has no corner marks unless asked, and they do not change the title box', () => {
    const t = Title.parse({lines: ['Hello there']});
    expect(t.markers).toBe(false);
    const on = Title.parse({lines: ['Hello there'], markers: true});
    expect(layoutTitle(on, 1080)).toEqual(layoutTitle(t, 1080));
    expect(markerBoxes(layoutTitle(on, 1080).box, 24)).toHaveLength(4);
  });
});
