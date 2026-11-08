import type {Ad} from '../spec/schema';
import type {Plan, PlacedTitle} from './plan';
import {layoutTitle} from '../render/geometry';

/** Frames between one word and the next: a short first gap, then longer ones; the last value repeats. Uneven gaps read as handmade, not mechanical. */
export const WORD_GAPS = [2, 4, 4];
/** Frames the last word needs to settle. `instant` titles do not enter. */
export const SETTLE = 8;

/** Start frame of each word, counted from the title's first frame. */
export function wordStarts(words: number): number[] {
  const out = [0];
  for (let i = 1; i < words; i++) out.push(out[i - 1] + WORD_GAPS[Math.min(i - 1, WORD_GAPS.length - 1)]);
  return out.slice(0, words);
}

export function wordCount(lines: string[]): number {
  return lines.join(' ').split(/[\s_]+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

export type ReadingRow = {block: string; index: number; text: string; words: number; visible: number; needed: number; ok: boolean};

/** For each title: frames at full opacity (after the last word has settled, before it starts to leave) against the frames a reader needs. */
export function readingRows(plan: Plan, spec: Ad): ReadingRow[] {
  const {wordsPerSecond, noticeSeconds} = spec.checks;
  // one title that continues over a block boundary (same words, the first one has no outAt) counts once
  const ts: typeof plan.titles = [];
  for (const t of [...plan.titles].sort((a, b) => a.inAt - b.inAt)) {
    const prev = ts[ts.length - 1];
    if (prev && prev.outAt === undefined && prev.until >= t.inAt && prev.spec.lines.join('|') === t.spec.lines.join('|')) ts[ts.length - 1] = {...prev, outAt: t.outAt, until: t.until};
    else ts.push(t);
  }
  return ts.map((t) => {
    const words = wordCount(t.spec.lines);
    const enter = t.spec.instant ? 0 : (wordStarts(words).pop() ?? 0) + SETTLE;
    const end = t.outAt ?? t.until;
    const visible = Math.max(0, end - (t.inAt + enter));
    const needed = Math.ceil((words / wordsPerSecond + noticeSeconds) * plan.fps);
    return {block: t.block, index: t.index, text: t.spec.lines.join(' ').replace(/[*]/g, '').replace(/_/g, ' '), words, visible, needed, ok: visible >= needed};
  });
}

/** Screens the author pushed the camera into (text that matters) that never hold still for `appTextSeconds`. */
export function movingTextWarnings(plan: Plan, spec: Ad): string[] {
  const need = Math.round(spec.checks.appTextSeconds * plan.fps);
  const SPRING = 18; // frames a camera move takes to settle
  const warns: string[] = [];
  for (const b of plan.blocks) {
    const s = b.spec as {camera?: {at: number; offset?: number; zoom: unknown; focus?: {element?: string}}[]; steps?: {type: string; at: number; screen?: string}[]; start?: {screen: string}};
    if (!s.camera || !s.steps || !s.start) continue;
    const keys = s.camera.map((k) => b.start + Math.round(k.at * plan.beat) + (k.offset ?? 0)).sort((a, c) => a - c);
    const pushes = s.camera.filter((k) => typeof k.zoom === 'object' || k.focus?.element);
    if (!pushes.length) continue;
    // screen lifetimes inside the block
    const swaps = s.steps.filter((x) => x.type === 'screen' && x.screen).map((x) => ({at: b.start + Math.round(x.at * plan.beat), screen: x.screen!}));
    const life = [{at: b.start, screen: s.start.screen}, ...swaps].sort((a, c) => a.at - c.at).map((x, i, all) => ({...x, end: all[i + 1]?.at ?? b.end}));
    for (const l of life) {
      if (l.end - l.at < need) continue;
      // longest stretch with no camera move in progress
      const moves = keys.filter((k) => k < l.end && k + SPRING > l.at).map((k) => [Math.max(l.at, k), Math.min(l.end, k + SPRING)] as const);
      let cur = l.at;
      let best = 0;
      for (const [a, e] of moves) { best = Math.max(best, a - cur); cur = Math.max(cur, e); }
      best = Math.max(best, l.end - cur);
      const touched = pushes.some((k) => { const f = b.start + Math.round(k.at * plan.beat) + (k.offset ?? 0); return f >= l.at - SPRING && f < l.end; });
      if (touched && best < need) warns.push(`${b.id}: screen "${l.screen}" (frames ${l.at}-${l.end}) is never still for ${spec.checks.appTextSeconds}s (longest still stretch ${best} frames)`);
    }
  }
  return warns;
}

type CamKey = {at: number; offset?: number; zoom: unknown; focus?: {element?: string}; why?: string};

/** A push-in is a fit zoom, a zoom of 1.1 or more, or a focus on an element. It must say what is read there (`why`) and hold still long enough to read it. */
export function isPushIn(k: CamKey): boolean {
  return typeof k.zoom === 'object' || (typeof k.zoom === 'number' && k.zoom >= 1.1) || !!k.focus?.element;
}

export function pushInFindings(plan: Plan, spec: Ad): {fails: string[]; warns: string[]; count: number} {
  const need = Math.round(spec.checks.appTextSeconds * plan.fps);
  const SPRING = 18;
  const fails: string[] = [];
  const warns: string[] = [];
  let count = 0;
  for (const b of plan.blocks) {
    const cam = (b.spec as {camera?: CamKey[]}).camera;
    if (!cam?.length) continue;
    const frames = cam.map((k) => ({k, f: b.start + Math.round(k.at * plan.beat) + (k.offset ?? 0)})).sort((a, c) => a.f - c.f);
    frames.forEach(({k, f}, i) => {
      if (!isPushIn(k)) return;
      count++;
      if (!k.why?.trim()) { fails.push(`${b.id}: the camera push-in at frame ${f} has no \`why\` (what does the viewer read there? e.g. reads: "3 min")`); return; }
      const hold = (frames[i + 1]?.f ?? b.end) - (f + SPRING);
      if (hold < need) warns.push(`${b.id}: push-in "${k.why}" at frame ${f} holds still ${Math.max(0, hold)} frames, needs ${need} to be read`);
    });
  }
  return {fails, warns, count};
}

/** Titles on one layer: `above` ones are drawn over the phone (and so over a camera push-in), the others under it. */
export const titlesOnLayer = <T extends {spec: {above?: boolean}}>(titles: T[], above: boolean): T[] => titles.filter((t) => !!t.spec.above === above);

const LOOK_BAND = 220;

/** An `above` title is drawn over the phone, so it must not sit on the spot the camera is pointing at (the focus lands at `qy` on the frame). */
export function aboveTitleWarnings(plan: Plan): string[] {
  const warns: string[] = [];
  const ts = plan.titles.filter((t: PlacedTitle) => t.spec.above);
  if (!ts.length) return warns;
  for (const b of plan.blocks) {
    const cam = (b.spec as {camera?: (CamKey & {qy?: number})[]}).camera;
    if (!cam?.length) continue;
    const keys = cam.map((k) => ({k, f: b.start + Math.round(k.at * plan.beat) + (k.offset ?? 0)})).sort((a, c) => a.f - c.f);
    keys.forEach(({k, f}, i) => {
      if (!isPushIn(k)) return;
      const end = keys[i + 1]?.f ?? b.end;
      const qy = k.qy ?? 1180;
      for (const t of ts) {
        const visEnd = t.outAt ?? t.until;
        if (t.inAt >= end || visEnd <= f) continue;
        const box = layoutTitle(t.spec, plan.width).box;
        if (box.y < qy + LOOK_BAND && box.y + box.h > qy - LOOK_BAND) {
          warns.push(`${t.block}: the title "${t.spec.lines.join(' ')}" is drawn over the phone at y ${box.y}-${box.y + box.h}, where the camera looks (y about ${qy}) during the push-in "${k.why ?? 'at frame ' + f}". Move the title (y) or the camera focus (qy).`);
        }
      }
    });
  }
  return warns;
}
