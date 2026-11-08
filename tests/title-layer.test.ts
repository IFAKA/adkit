import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {ROOT, load} from './helpers';
import {parseLine} from '../src/render/geometry';
import {aboveTitleWarnings, titlesOnLayer} from '../src/engine/reading';

describe('title layering', () => {
  it('draws titles under the phone so they never show through its screen', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/render/Ad.tsx'), 'utf8');
    const scene = src.slice(src.indexOf('const PhoneScene'), src.indexOf('export const Ad'));
    expect(scene.indexOf('<Titles')).toBeGreaterThan(-1);
    expect(scene.indexOf('<Titles')).toBeLessThan(scene.indexOf('{stage}'));
    expect(scene.indexOf('<Titles')).toBeGreaterThan(scene.indexOf('<SceneBackdrop'));
  });
});

describe('accent words', () => {
  const show = (line: string) => parseLine(line).map((w) => w.map((p) => (p.accent ? `[${p.text}]` : p.text)).join(''));
  it('marks *word* at the end, in the middle and with punctuation outside', () => {
    expect(show('Tap *pay.*')).toEqual(['Tap', '[pay.]']);
    expect(show('Fresh *beans.* ')).toEqual(['Fresh', '[beans.]', '']);
    expect(show('a *b* c')).toEqual(['a', '[b]', 'c']);
    expect(show('Tap *pay*.')).toEqual(['Tap', '[pay].']);
    expect(show('Tap (*pay*)')).toEqual(['Tap', '([pay])']);
    expect(show('*two words* here')).toEqual(['[two]', '[words]', 'here']);
    expect(show('5 * 3')).toEqual(['5', '*', '3']);
  });
});

describe('title above the phone', () => {
  it('draws an `above` title after the stage, and a normal title before it', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/render/Ad.tsx'), 'utf8');
    const scene = src.slice(src.indexOf('const PhoneScene'), src.indexOf('export const Ad'));
    expect(scene.indexOf('<Titles m={m} above={false}')).toBeLessThan(scene.indexOf('{stage}'));
    expect(scene.lastIndexOf('<Titles m={m} above={true}')).toBeGreaterThan(scene.indexOf('{stage}'));
  });
  it('selects titles by their `above` flag', () => {
    const ts = [{spec: {above: true}}, {spec: {}}, {spec: {above: false}}] as never;
    expect(titlesOnLayer(ts, true)).toHaveLength(1);
    expect(titlesOnLayer(ts, false)).toHaveLength(2);
  });
  it('warns when an above title sits where the camera looks during a push-in', () => {
    const {plan} = load('minimal');
    expect(aboveTitleWarnings(plan)).toEqual([]);
    const p = structuredClone(plan);
    const t = p.titles.find((x) => (p.blocks.find((b) => b.id === x.block)!.spec as {camera?: unknown[]}).camera?.length)!;
    t.spec.above = true;
    t.spec.y = 1100;
    t.outAt = undefined;
    t.until = p.total;
    const w = aboveTitleWarnings(p);
    expect(w.length).toBeGreaterThan(0);
    expect(w[0]).toContain('camera');
    t.spec.y = 270;
    expect(aboveTitleWarnings(p)).toEqual([]);
  });
});
