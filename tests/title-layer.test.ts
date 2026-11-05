import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {ROOT} from './helpers';

describe('title layering', () => {
  it('draws titles under the phone so they never show through its screen', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/render/Ad.tsx'), 'utf8');
    const scene = src.slice(src.indexOf('const PhoneScene'), src.indexOf('export const Ad'));
    expect(scene.indexOf('<Titles')).toBeGreaterThan(-1);
    expect(scene.indexOf('<Titles')).toBeLessThan(scene.indexOf('{stage}'));
    expect(scene.indexOf('<Titles')).toBeGreaterThan(scene.indexOf('<SceneBackdrop'));
  });
});
