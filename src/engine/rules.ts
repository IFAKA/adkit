import type {Ad, CameraKey} from '../spec/schema';
import type {Plan} from './plan';
import {wordCount, wordStarts} from './reading';
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

type Step = {type: string; element?: string; at: number; reaction?: string; press?: boolean; stagger?: number; elements?: string[]; screen?: string};
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

/** Items that arrive one after another with exactly one gap look mechanical. Counts a `pop` step and a title whose `stagger` the author wrote (the default 3 frame gap is not reported: every long title has it). */
export function evenStaggers(plan: Plan, spec: Ad): string[] {
  const cfg = spec.checks.evenStagger;
  if (!cfg) return [];
  const same = (starts: number[], tol = 0) => starts.length >= cfg.count && starts.every((v, i) => i < 2 || Math.abs(v - starts[i - 1] - (starts[1] - starts[0])) <= tol);
  const warns: string[] = [];
  for (const t of plan.titles) {
    if (!t.spec.stagger || t.spec.instant) continue;
    const starts = wordStarts(wordCount(t.spec.lines), t.spec.stagger);
    if (same(starts)) warns.push(`${t.block}#${t.index + 1}: the ${starts.length} words of "${t.spec.lines.join(' ').replace(/[*_]/g, '')}" all come ${starts[1]} frames apart. Vary \`stagger\`, e.g. [2, 4, 4].`);
  }
  for (const b of plan.blocks) stepsOf(b).forEach((s, i) => {
    if (s.type !== 'pop' || !s.elements) return;
    // beats round to whole frames, so a gap may differ by one frame
    const starts = s.elements.map((_, e) => Math.round((s.at + e * s.stagger!) * plan.beat));
    if (same(starts, 1)) warns.push(`${b.id}: the ${starts.length} elements of pop step ${i + 1} all appear ${starts[1] - starts[0]} frames apart. Split the step in two, or change \`stagger\` and the order.`);
  });
  return warns;
}

/** A tap needs an answer the viewer sees: a press dip, a `reaction`, or a screen change or check within `frames` after it. (The default tap highlight is a ring, not an answer.) */
export function actionReactions(plan: Plan, spec: Ad): string[] {
  const cfg = spec.checks.actionReaction;
  if (!cfg) return [];
  const warns: string[] = [];
  for (const b of plan.blocks) {
    const steps = stepsOf(b);
    const frame = (s: Step) => b.start + Math.round(s.at * plan.beat);
    for (const s of steps) {
      if (s.type !== 'tap' || s.press || (s.reaction && s.reaction !== 'none')) continue;
      const f = frame(s);
      if (steps.some((x) => (x.type === 'screen' || x.type === 'check') && frame(x) >= f && frame(x) <= f + cfg.frames)) continue;
      warns.push(`${b.id}: the tap on "${s.element}" at frame ${f} has no reaction within ${cfg.frames} frames. Add \`press: true\` or \`reaction: ripple\`/\`burst\`.`);
    }
  }
  return warns;
}

/** The studio backdrop (key light, three drifting blobs, vignette) always moves, so only a `background` with drift 0 and grain 0 is flat. Chaos scenes draw their own. */
export function flatBackgrounds(plan: Plan, spec: Ad): string[] {
  const cfg = spec.checks.flatBackground;
  if (!cfg) return [];
  return plan.blocks.flatMap((b) => {
    const bg = (b.spec as {background?: Ad['background']}).background ?? spec.background;
    if (b.kind === 'chaos' || b.end - b.start <= cfg.frames || !bg || bg.drift > 0 || bg.grain > 0) return [];
    return [`${b.id}: ${b.end - b.start} frames on a background that never moves (drift 0, grain 0). Give it a little \`drift\` and \`grain\` (0.2 and 0.7 are the defaults).`];
  });
}

/** Frames where something starts to move: titles and their markers, camera moves, and every tapFlow step (a pop counts each element; a tap counts its press and reaction). Chaos piles up on purpose and is left out. */
export function motionStarts(plan: Plan): {f: number; what: string}[] {
  const out: {f: number; what: string}[] = [];
  for (const t of plan.titles) {
    if (plan.blocks.find((b) => b.id === t.block)?.kind === 'chaos') continue;
    out.push({f: t.inAt, what: `title "${t.spec.lines.join(' ').replace(/[*_]/g, '')}"`});
    if (t.spec.markers) out.push({f: t.inAt, what: 'title markers'});
  }
  for (const m of cameraMoves(plan)) if (m.own) out.push({f: m.f, what: 'camera move'});
  for (const b of plan.blocks) for (const s of stepsOf(b)) {
    const f = b.start + Math.round(s.at * plan.beat);
    if (s.type === 'pop') s.elements?.forEach((e, i) => out.push({f: b.start + Math.round((s.at + i * s.stagger!) * plan.beat), what: `pop ${e}`}));
    else out.push({f, what: s.type === 'tap' ? `tap ${s.element}` : s.type});
    if (s.type === 'tap') {
      if (s.press) out.push({f, what: 'press'});
      if (s.reaction && s.reaction !== 'none') out.push({f, what: s.reaction});
    }
  }
  return out.sort((a, c) => a.f - c.f);
}

/** Too many things beginning to move together (more than `max` within `window` frames) leaves the eye nowhere to go. */
export function motionDensity(plan: Plan, spec: Ad): string[] {
  const cfg = spec.checks.motionDensity;
  if (!cfg) return [];
  const starts = motionStarts(plan);
  const warns: string[] = [];
  for (let i = 0; i < starts.length;) {
    const group = starts.filter((s) => s.f >= starts[i].f && s.f < starts[i].f + cfg.window);
    if (group.length > cfg.max) {
      warns.push(`${group.length} elements start to move within ${cfg.window} frames from frame ${starts[i].f} (${group.map((g) => g.what).join(', ')}). Spread them out or drop the least important (max ${cfg.max}).`);
      i += group.length;
    } else i++;
  }
  return warns;
}
