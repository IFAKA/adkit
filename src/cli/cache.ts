import type {Manifest} from '../capture/manifest';
import type {Plan} from '../engine/plan';
import type {Ad} from '../spec/schema';
import {canon, sha} from './util';

/** Every `screen: "x"` or `screen: "set/x"` in a value, found by walking it. */
export function screenRefs(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) v.forEach((x) => screenRefs(x, out));
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      if (k === 'screen' && typeof x === 'string') out.add(x);
      else screenRefs(x, out);
    }
  }
  return out;
}

export function splitRef(ref: string): {set: string; screen: string} {
  const i = ref.indexOf('/');
  return i < 0 ? {set: 'main', screen: ref} : {set: ref.slice(0, i), screen: ref.slice(i + 1)};
}

/** Titles are cut out of a neighbour block: editing the title of one scene must not touch the next. */
function noTitles(b: unknown): unknown {
  if (!b || typeof b !== 'object') return b;
  const {titles: _t, title: _s, ...rest} = b as Record<string, unknown>;
  return rest;
}

/**
 * The cache key of one scene's frames. It covers everything the pixels of the scene depend on:
 * the scene spec, its neighbours without their titles (the phone moves on from them),
 * the layout of all scenes (global camera tracks), titles that are on screen in the scene,
 * brand + meta, the captures it shows, and the engine version.
 */
export function segmentKey(spec: Ad, plan: Plan, index: number, manifest: Manifest | undefined, engine: string): string {
  const b = plan.blocks[index];
  const prev = plan.blocks[index - 1];
  const next = plan.blocks[index + 1];
  const ref = new Set<string>();
  for (const x of [b, prev, next]) if (x) screenRefs(x.spec, ref);
  const shots = [...ref].sort().map((r) => {
    const {set, screen} = splitRef(r);
    const s = manifest?.sets[set]?.screens[screen];
    return `${r}=${s ? s.sha : 'missing'}`;
  });
  const titles = plan.titles
    .filter((t) => (t.outAt ?? t.until) > b.start && t.inAt < b.end)
    .map((t) => ({block: t.block, spec: t.spec, inAt: t.inAt, outAt: t.outAt, until: t.until}));
  const slice = {
    meta: spec.meta,
    brand: spec.brand,
    layout: plan.blocks.map((x) => [x.kind, x.start, x.end]),
    range: [b.start, b.end],
    block: b.spec,
    prev: prev && noTitles(prev.spec),
    next: next && noTitles(next.spec),
    titles,
    shots,
    scale: manifest?.scale,
  };
  return sha(canon(slice), engine).slice(0, 20);
}

/** Segments are the non-empty blocks. Frames are [start, end). */
export function segments(plan: Plan): {index: number; id: string; from: number; to: number}[] {
  return plan.blocks.flatMap((b, index) => (b.end > b.start ? [{index, id: b.id, from: b.start, to: b.end - 1}] : []));
}
