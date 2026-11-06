// Driver for scripts/speed.sh. Usage: npx tsx scripts/speed.mts take|sets|indep [--frames N] [--out DIR]
// Runs the real capture (runCapture) on scripts/speed-fixture and prints one JSON line: wall seconds and per-step totals.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runCapture} from '../src/capture';
import {AdSpec} from '../src/spec/schema';

const a = process.argv.slice(2);
const val = (n: string, d: string) => { const i = a.indexOf(`--${n}`); return i < 0 ? d : a[i + 1]; };
const frames = Number(val('frames', '90'));
const specDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'speed-fixture');
const keep = a.includes('--out');
const projectDir = val('out', fs.mkdtempSync(path.join(os.tmpdir(), 'adkit-speed-')));
const takeScreen = (name: string, extra: object = {}) => ({name, settleMs: 300, ...extra, steps: [{goto: '/'}, {record: {frames, slow: 0.5, fps: 30, actions: [
  {at: 10, click: '#go', elements: {go: '#go'}, measure: {sheet: '#sheet'}, motion: 20},
  {at: Math.floor(frames / 2), click: '#back', elements: {back: '#back'}, measure: {sheet: '#sheet'}, motion: 20}]}}]});
const mode = a[0] ?? 'take';
const screens = mode === 'indep'
  ? [0, 1, 2, 3].map((i) => takeScreen(`t${i}`, {independent: true}))
  : [{name: 'home', settleMs: 300, steps: [{goto: '/'}]}, takeScreen('take')];
const sets: Record<string, unknown> = {};
for (let i = 0; i < (mode === 'sets' ? 3 : 1); i++) sets[i === 0 ? 'main' : `s${i}`] = {screens};
const spec = AdSpec.parse({brand: {name: 'Speed'}, scenes: [{block: 'whip'}], capture: {
  app: {start: 'node server.mjs {port}', dir: '.', isolate: 'inplace', ready: {path: '/', timeoutSeconds: 20}},
  viewport: {width: 390, height: 844, scale: 3}, inputs: ['server.mjs'], sets}});
const prof: Record<string, {ms: number; n: number}> = {};
(globalThis as any).__adkitProf = prof;
const t = Date.now();
const r = await runCapture({spec, specDir, projectDir, force: true, log: () => {}});
const wall = (Date.now() - t) / 1000;
const sec = (k: string) => +((prof[k]?.ms ?? 0) / 1000).toFixed(2);
console.log(JSON.stringify({wall: +wall.toFixed(2), frames: frames * Object.keys(sets).length * (mode === 'indep' ? 4 : 1), steps: Object.fromEntries(Object.keys(prof).map((k) => [k, {s: sec(k), n: prof[k].n}])), dir: keep ? r.dir : ''}));
if (!keep) fs.rmSync(projectDir, {recursive: true, force: true});
