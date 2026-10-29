// Test-only converter: the hand-made ad's captures (video/public/captures) -> the new capture manifest format.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {load} from '../helpers';
import type {Manifest} from '../../src/capture/manifest';

export const ORIG = '/Users/faka/code/contributions/sasha/video/public';
const SETS: Record<string, string> = {demo: 'main', demoTeal: 'teal', demoPlum: 'plum', demoNavy: 'navy'};

export function originalProps(tmp = '/tmp/adkit-orig') {
  const raw = JSON.parse(fs.readFileSync(path.join(ORIG, 'captures/manifest.json'), 'utf8'));
  const sets: Manifest['sets'] = {};
  for (const [shop, v] of Object.entries<any>(raw.shops)) {
    const screens: Record<string, any> = {};
    for (const [name, sc] of Object.entries<any>(v.screens)) {
      const elements = structuredClone(sc.elements);
      if (name === 'catalog' && elements.cartIcon) elements.cartIcon.y -= sc.scrollY; // fixed element: viewport coordinates
      screens[name] = {file: sc.file, fullFile: sc.fullFile, fullHeight: sc.fullHeight, scrollY: sc.scrollY, sha: 'orig', elements};
    }
    sets[SETS[shop]] = {theme: v.theme, screens};
  }
  const manifest: Manifest = {scale: raw.scale, viewport: raw.viewport, sets};
  const pub = path.join(tmp, 'public');
  if (!fs.existsSync(path.join(pub, 'bg-bakery.jpg'))) {
    fs.mkdirSync(pub, {recursive: true});
    execFileSync('cp', ['-R', path.join(ORIG, 'captures'), path.join(pub, 'captures')]);
    fs.copyFileSync(path.join(ORIG, 'bg-bakery.jpg'), path.join(pub, 'bg-bakery.jpg'));
  }
  const {spec, plan} = load('horno-lento');
  return {pub, props: {plan, spec, manifest, assetBase: '', photo: 'bg-bakery.jpg'}};
}
