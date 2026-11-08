import type {Ad, CameraKey} from '../spec/schema';
import type {Plan} from './plan';
import {CAM_SPRINGS, settle} from '../render/lib/anim';

type Move = {block: string; f: number; spring: keyof typeof CAM_SPRINGS; wide: boolean; own: boolean};

const isWide = (k: Pick<CameraKey, 'zoom' | 'focus'>) => typeof k.zoom === 'number' && k.zoom < 1.1 && !k.focus?.element;

/** Every camera move: the author's keys, and the ones the renderer adds itself (end card pull-out, skins). */
export function cameraMoves(plan: Plan): Move[] {
  const out: Move[] = [];
  for (const b of plan.blocks) {
    const cam = (b.spec as {camera?: CameraKey[]}).camera ?? [];
    for (const k of cam) out.push({block: b.id, f: b.start + Math.round(k.at * plan.beat) + (k.offset ?? 0), spring: k.spring ?? 'soft', wide: isWide(k), own: true});
    if (b.kind === 'endCard') out.push({block: b.id, f: b.start, spring: 'slow', wide: true, own: false});
    if (b.kind === 'skins' && !cam.length) out.push({block: b.id, f: b.start, spring: 'soft', wide: false, own: false}, {block: b.id, f: b.end - 3, spring: 'slow', wide: false, own: false});
  }
  return out.sort((a, c) => a.f - c.f);
}

/** A camera move that ends at zero speed and is followed by a long still gap (or by nothing while the ad goes on) reads as a dead stop. The pull-out to a wide pose and the last move are exempt. */
export function cameraDeadStops(plan: Plan, spec: Ad): string[] {
  const cfg = spec.checks.cameraDeadStop;
  if (!cfg) return [];
  const moves = cameraMoves(plan);
  const warns: string[] = [];
  moves.forEach((a, i) => {
    const s = settle(CAM_SPRINGS[a.spring], plan.fps);
    if (!a.own || a.wide || s.endSpeed >= 0.01) return;
    const settled = a.f + s.frames;
    const next = moves.slice(i + 1).find((m) => m.f > a.f);
    if (next) {
      if (!next.wide && next.f - settled > cfg.frames) warns.push(`${a.block}: the camera move at frame ${a.f} (spring ${a.spring}) ends at zero speed and the next move starts ${next.f - settled} frames after it settles (max ${cfg.frames}). Use spring drift on it, or start the next move sooner.`);
    } else {
      const later = plan.blocks.find((b) => b.start > settled && b.id !== a.block);
      if (later) warns.push(`${a.block}: the camera move at frame ${a.f} (spring ${a.spring}) ends at zero speed and no move follows while ${later.id} goes on. Add a move there or use spring drift.`);
    }
  });
  return warns;
}

type Step = {type: string; at: number; reaction?: string; press?: boolean; stagger?: number; elements?: string[]; screen?: string};
const stepsOf = (b: {spec: unknown}) => ((b.spec as {steps?: Step[]}).steps ?? []);

/** Accent items that begin on one frame look like one blob, not a sequence: titles (not `instant`), their markers and tap reactions. */
export function sameFrameStarts(plan: Plan, spec: Ad): string[] {
  const cfg = spec.checks.sameFrameStart;
  if (!cfg) return [];
  const at = new Map<number, string[]>();
  const add = (f: number, what: string) => at.set(f, [...(at.get(f) ?? []), what]);
  for (const t of plan.titles) {
    if (!t.spec.instant) add(t.inAt, `title "${t.spec.lines.join(' ').replace(/[*_]/g, '')}"`);
    if (t.spec.markers) add(t.inAt, 'title markers');
  }
  for (const b of plan.blocks) for (const s of stepsOf(b)) if (s.type === 'tap' && s.reaction && s.reaction !== 'none') add(b.start + Math.round(s.at * plan.beat), `${b.id} tap ${s.reaction}`);
  return [...at].filter(([, v]) => v.length >= cfg.count).sort((a, c) => a[0] - c[0]).map(([f, v]) => `${v.length} items start on frame ${f} (${v.join(', ')}). Move them 3-4 frames apart, or make a title \`instant\`.`);
}
