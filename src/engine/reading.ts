import type {Ad} from '../spec/schema';
import type {Plan} from './plan';

/** Frames a title takes to enter: words come in 3 frames apart, then the last one settles. `instant` titles do not enter. */
export const STAGGER = 3;
export const SETTLE = 8;
export const FADE_OUT = 8;

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
    const enter = t.spec.instant ? 0 : (words - 1) * STAGGER + SETTLE;
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
