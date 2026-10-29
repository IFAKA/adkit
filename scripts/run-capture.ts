// Usage: npx tsx scripts/run-capture.ts <ad.yaml> [--force] [--set NAME] [--screen NAME]
import path from 'node:path';
import {runCapture} from '../src/capture';
import {loadSpec} from '../src/spec/load';

const a = process.argv.slice(2);
const file = a.find((x) => !x.startsWith('--') && a[a.indexOf(x) - 1] !== '--set' && a[a.indexOf(x) - 1] !== '--screen');
if (!file) throw new Error('usage: run-capture.ts <ad.yaml> [--force] [--set NAME] [--screen NAME]');
const val = (n: string) => { const i = a.indexOf(`--${n}`); return i < 0 ? undefined : a[i + 1]; };
const {spec, dir} = loadSpec(file);
const r = await runCapture({spec, specDir: dir, projectDir: dir, force: a.includes('--force'), only: {set: val('set'), screen: val('screen')}, log: (l) => console.log(l)});
console.log(JSON.stringify(r));
