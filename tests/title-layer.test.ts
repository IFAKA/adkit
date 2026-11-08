import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {ROOT} from './helpers';
import {parseLine} from '../src/render/geometry';

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
