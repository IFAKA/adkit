// Run inside a COPY of the shop app (cwd = the copy). Installs the demo shop "horno-lento" into it.
//   HL_PALETTE=teal|plum|navy   optional colour variant
// Needs the photos: run scripts/fetch-photos.mjs once first.
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const demo = path.resolve(here, '../demo-shop');
const app = process.cwd();
const slug = 'horno-lento';
const PALETTES = {
  teal: {brand: '#1f6f6b', brandInk: '#16524f', blush: '#dcefec', cream: '#f5fbfa', ink: '#10282a', muted: '#4f6f6e', line: '#d3e6e3'},
  plum: {brand: '#6b2d5c', brandInk: '#4f1f43', blush: '#f1e1ed', cream: '#fbf6fa', ink: '#2a1426', muted: '#735a6c', line: '#e8d8e3'},
  navy: {brand: '#23395b', brandInk: '#182a45', blush: '#dfe7f2', cream: '#f5f8fc', ink: '#121d30', muted: '#5a6a82', line: '#d9e1ee'},
};
const palName = process.env.HL_PALETTE;
if (palName && !PALETTES[palName]) throw new Error(`unknown HL_PALETTE "${palName}"`);
if (!fs.existsSync(path.join(demo, 'assets/products'))) throw new Error('demo-shop/assets/products is missing: run node scripts/fetch-photos.mjs first');

const shopDir = path.join(app, 'shops', slug);
const pubDir = path.join(app, 'public', 'shops', slug);
fs.rmSync(shopDir, {recursive: true, force: true});
fs.rmSync(pubDir, {recursive: true, force: true});
fs.mkdirSync(shopDir, {recursive: true});
let ts = fs.readFileSync(path.join(demo, 'shop.ts'), 'utf8').replace('../../shops/types', '../types');
if (palName) {
  const theme = `theme: {\n${Object.entries(PALETTES[palName]).map(([k, v]) => `    ${k}: "${v}",`).join('\n')}\n  },`;
  ts = ts.replace(/theme: \{[^}]*\},/, theme);
}
fs.writeFileSync(path.join(shopDir, 'shop.ts'), ts);
fs.copyFileSync(path.join(demo, 'menu.json'), path.join(shopDir, 'menu.json'));
fs.cpSync(path.join(demo, 'assets'), pubDir, {recursive: true});
const r = spawnSync('node', ['scripts/select-shop.mjs'], {cwd: app, env: {...process.env, SHOP: slug}, stdio: 'inherit'});
if (r.status !== 0) process.exit(r.status ?? 1);
console.log(`installed shop ${slug}${palName ? ` (${palName})` : ''}`);
