import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadSpec} from '../src/spec/load';
import {compile} from '../src/engine/compile';
import type {Ad} from '../src/spec/schema';

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const example = (name: string) => path.join(ROOT, 'examples', name, 'ad.yaml');
export function load(name: string) {
  const r = loadSpec(example(name), {});
  return {...r, plan: compile(r.spec)};
}
/** A deep copy of a loaded spec that a test can change. */
export const clone = (s: Ad): Ad => structuredClone(s);
