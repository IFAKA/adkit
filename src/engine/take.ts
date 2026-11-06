import type {BlockSpec} from '../spec/schema';

type Scene = BlockSpec & {start?: {screen: string; transition?: string; enter?: string}; steps?: {type: string; at?: number}[]; screen?: string};

/**
 * One take is one page session that is played as ONE video. Blocks only choose which time range of it they show.
 * Rules: (1) a block that starts on a take has no `screen` step (that would be a cut, fade or still inside the take);
 * (2) two consecutive blocks on the same take join with `transition: live` and `enter: cut`, nothing else.
 */
export function sameTakeFindings(scenes: BlockSpec[], isTake: (screenRef: string) => boolean): string[] {
  const bad: string[] = [];
  const ss = scenes as Scene[];
  ss.forEach((b, i) => {
    const ref = b.start?.screen ?? b.screen;
    if (!ref || !isTake(ref)) return;
    const name = `${b.block}#${i + 1}`;
    for (const s of b.steps ?? []) if (s.type === 'screen') bad.push(`${name} is on take "${ref}" but has a \`screen\` step: that is a cut, fade or still inside one take. Use tap steps on the take instead`);
    const prev = ss[i - 1];
    const pref = prev && (prev.start?.screen ?? prev.screen);
    if (b.start && pref === ref) {
      if (b.start.transition !== 'live') bad.push(`${name} follows another block on take "${ref}" with start.transition "${b.start.transition ?? 'fade'}": use "live" so the take plays on without a join`);
      else if ((b.start.enter ?? 'cut') !== 'cut') bad.push(`${name} follows another block on take "${ref}" with enter "${b.start.enter}": use "cut" (nothing happens at the join)`);
    }
  });
  return bad;
}

/** Tap steps of blocks on a take must sit on an action of the take (the finger and the page click agree). */
export function takeSyncFindings(
  blocks: {kind: string; start: number; spec: Scene}[], beat: number, takeActions: (screenRef: string) => number[] | undefined, tol = 6,
): string[] {
  const bad: string[] = [];
  const first = new Map<string, number>();
  for (const b of blocks) {
    const ref = b.spec.start?.screen;
    if (!ref) continue;
    const acts = takeActions(ref);
    if (!acts?.length) continue;
    if (!first.has(ref)) first.set(ref, b.start);
    for (const s of b.spec.steps ?? []) {
      if (s.type !== 'tap') continue;
      const f = b.start + Math.round((s.at ?? 0) * beat) - first.get(ref)!;
      const d = Math.min(...acts.map((a) => Math.abs(a - f)));
      if (d > tol) bad.push(`${b.spec.block} tap at take frame ${f} is ${d} frames from the nearest action (actions at ${acts.join(', ')})`);
    }
  }
  return bad;
}
