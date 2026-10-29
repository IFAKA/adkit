import type {Ad, BlockSpec} from '../spec/schema';
import type {Cue, CueKind, Placed, PlacedTitle, Plan, Section} from './plan';

export class CompileError extends Error {
  constructor(public problems: string[]) {
    super(problems.join('\n'));
    this.name = 'CompileError';
  }
}

const PHONE_BLOCKS = new Set(['reveal', 'tapFlow', 'notification', 'statCountUp', 'skins', 'endCard']);

export function compile(spec: Ad): Plan {
  const {fps, bpm} = spec.meta;
  const bf = (fps * 60) / bpm;
  const problems: string[] = [];
  if (!Number.isInteger(bf) || bf < 4) {
    throw new CompileError([`meta: fps ${fps} and bpm ${bpm} give ${bf} frames per beat; it must be a whole number of at least 4 (30 fps at 120 BPM = 15)`]);
  }
  const half = Math.floor(bf / 2);
  const bar = bf * 4;
  /** beats -> frames. A half beat of an odd beat length rounds down (15 f: 7). */
  const fr = (b: number) => Math.floor(b * bf + 1e-9);

  // ---- layout: blocks one after another
  const blocks: Placed[] = [];
  const count: Record<string, number> = {};
  let t = 0;
  spec.scenes.forEach((s, index) => {
    count[s.block] = (count[s.block] ?? 0) + 1;
    const id = s.id ?? (count[s.block] === 1 ? s.block : `${s.block}${count[s.block]}`);
    const len = Math.round(s.bars * bar);
    blocks.push({index, id, kind: s.block, start: t, end: t + len, spec: s, a: {}});
    t += len;
  });
  const total = t;
  const ids = new Set<string>();
  for (const b of blocks) {
    if (ids.has(b.id)) problems.push(`scenes[${b.index}]: duplicate block id "${b.id}"`);
    ids.add(b.id);
  }
  if (spec.meta.bars !== undefined && Math.abs(spec.meta.bars * bar - total) > 0.5) {
    problems.push(`meta.bars is ${spec.meta.bars} but the blocks add up to ${total / bar} bars`);
  }

  // ---- story order
  const kinds = blocks.map((b) => b.kind);
  const at = (k: string) => kinds.indexOf(k as never);
  blocks.forEach((b, i) => {
    if (b.kind === 'iconOpen') {
      if (kinds[i - 1] !== 'chatChaos') problems.push(`scenes[${i}] (iconOpen): must come right after a chatChaos block`);
      if (b.spec.bars !== 0.25) problems.push(`scenes[${i}] (iconOpen): bars must be 0.25 (one beat), got ${b.spec.bars}`);
    }
    if (b.kind === 'chatChaos' && kinds[i + 1] !== 'iconOpen') problems.push(`scenes[${i}] (chatChaos): must be followed by an iconOpen block`);
    if (b.kind === 'whip' && !(PHONE_BLOCKS.has(kinds[i - 1] ?? '') && PHONE_BLOCKS.has(kinds[i + 1] ?? ''))) problems.push(`scenes[${i}] (whip): needs a phone block on both sides`);
    if (b.kind === 'endCard' && i !== blocks.length - 1) problems.push(`scenes[${i}] (endCard): must be the last block`);
    if (PHONE_BLOCKS.has(b.kind) && b.kind !== 'reveal' && (at('reveal') < 0 || at('reveal') > i)) problems.push(`scenes[${i}] (${b.kind}): needs a reveal block before it (that is where the phone appears)`);
    if (b.kind === 'reveal' && kinds.indexOf('reveal') !== i) problems.push(`scenes[${i}] (reveal): only one reveal is allowed`);
    if (b.kind !== 'whip' && b.end - b.start <= 0) problems.push(`scenes[${i}] (${b.kind}): bars must be greater than 0`);
  });
  if (problems.length) throw new CompileError(problems);

  // ---- cues
  const cues: Cue[] = [];
  const titles: PlacedTitle[] = [];
  const push = (b: Placed, local: string, frame: number, kind: CueKind, role: string, extra: Partial<Cue> = {}) => {
    if (frame < 0 || frame > total) problems.push(`${b.id}: cue "${local}" at frame ${frame} is outside the ad (0..${total})`);
    else if (b.kind !== 'whip' && b.id && !local.startsWith('title') && (frame < b.start - bf || frame > b.end + bf)) problems.push(`${b.id}: cue "${local}" at frame ${frame} is far outside its block (${b.start}..${b.end})`);
    cues.push({name: `${b.id}:${local}`, frame, seconds: +(frame / fps).toFixed(4), kind, role, block: b.id, ...(extra.dur ? {dur: extra.dur, durationSeconds: +(extra.dur / fps).toFixed(4)} : {}), ...(extra.strong ? {strong: true} : {}), ...(extra.pan !== undefined ? {pan: extra.pan} : {})});
  };
  const within = (b: Placed, local: string, beat: number) => {
    const f = b.start + fr(beat);
    if (f > b.end && b.kind !== 'whip') problems.push(`${b.id}: ${local} at beat ${beat} is after the end of the block (${(b.end - b.start) / bf} beats)`);
    return f;
  };

  for (const b of blocks) {
    const s = b.spec as BlockSpec;
    const A = b.a;
    A.start = b.start;
    A.end = b.end;
    if (b.kind !== 'whip') push(b, 'cut', b.start, 'cut', 'cut');
    // titles of every block (the chatChaos / skins / endCard ones are single "title" fields)
    const tl = 'titles' in s ? [...s.titles] : [];
    if ('title' in s && s.title) tl.unshift(s.title);
    tl.forEach((ti, n) => {
      const inAt = within(b, `title ${n + 1}`, ti.at);
      const outAt = ti.to !== undefined ? b.start + fr(ti.to) : undefined;
      if (outAt !== undefined && outAt <= inAt) problems.push(`${b.id}: title ${n + 1} leaves (beat ${ti.to}) before it enters (beat ${ti.at})`);
      titles.push({block: b.id, index: n, spec: ti, inAt, outAt, until: b.end});
      const strong = n === 0 && ['reveal', 'tapFlow', 'notification', 'endCard'].includes(b.kind);
      push(b, `title${n + 1}-in`, inAt, 'title', 'title-in', {strong});
      if (outAt !== undefined) push(b, `title${n + 1}-out`, outAt, 'title', 'title-out');
    });

    switch (s.block) {
      case 'chatChaos': {
        const L = b.end - b.start;
        A.flyAt = b.end - fr(s.flyBeats);
        if (A.flyAt <= b.start) problems.push(`${b.id}: flyBeats ${s.flyBeats} is longer than the block`);
        push(b, 'riser', b.start, 'riser', 'riser-chaos', {dur: L});
        const pingBeats = [...new Set([...s.messages.flatMap((m) => (m.beat !== undefined ? [m.beat] : [])), ...s.pings])].sort((x, y) => x - y);
        pingBeats.forEach((pb, k) => push(b, `ping-${String(k + 1).padStart(2, '0')}`, within(b, `ping ${k + 1}`, pb), 'ping', 'ping'));
        push(b, 'bubble-pop-01', A.flyAt, 'pop', 'bubble-pop');
        push(b, 'bubble-pop-02', A.flyAt + half, 'pop', 'bubble-pop');
        push(b, 'bubble-pop-03', b.end, 'pop', 'bubble-pop');
        break;
      }
      case 'iconOpen':
        A.morph = b.start + half;
        push(b, 'icon-morph', A.morph, 'swap', 'icon-morph');
        break;
      case 'reveal':
        push(b, 'drop', b.start, 'hit', 'drop');
        push(b, 'app-open', b.start, 'whoosh', 'app-open', {dur: bf});
        break;
      case 'tapFlow': {
        const seen = new Set<string>();
        let screens = 0;
        let lifted = false;
        s.steps.forEach((st, k) => {
          const f = within(b, `step ${k + 1} (${st.type})`, st.at);
          const key = `${st.type}@${f}`;
          if (seen.has(key)) problems.push(`${b.id}: two "${st.type}" steps at beat ${st.at} overlap`);
          seen.add(key);
          switch (st.type) {
            case 'screen':
              screens++;
              push(b, `screen-${screens}`, f, 'swap', 'screen-swap');
              break;
            case 'tap':
              push(b, `tap-${k + 1}-${st.element}`, f, 'tap', 'tap', st.pan !== undefined ? {pan: st.pan} : {});
              break;
            case 'lift':
              lifted = true;
              push(b, 'lift', f, 'pop', 'lift');
              if (st.tapAt !== undefined) push(b, `tap-${k + 1}-${st.tap ?? st.element}`, within(b, 'lift tap', st.tapAt), 'tap', 'tap');
              break;
            case 'fly':
              if (!lifted) problems.push(`${b.id}: step ${k + 1} (fly) has no lifted element before it`);
              push(b, 'fly', f, 'whoosh', 'fly', {dur: 2 * bf});
              break;
            case 'badge':
              push(b, 'badge', f, 'pop', 'badge');
              break;
            case 'check':
              push(b, 'paid', f, 'chime', 'paid');
              break;
          }
        });
        break;
      }
      case 'whip': {
        const f = b.start;
        push(b, 'whip-out', f - bf + half, 'whoosh', 'whip-out', {dur: half + 1});
        push(b, 'spin', f, 'whoosh', 'whip-spin', {dur: 2 * bf});
        A.out = f - bf + half;
        break;
      }
      case 'notification':
        A.slide = within(b, 'slideAt', s.slideAt);
        A.land = within(b, 'landAt', s.landAt);
        if (A.land < A.slide) problems.push(`${b.id}: landAt must not be before slideAt`);
        push(b, 'swap-screen', b.start, 'swap', 'screen-swap');
        push(b, 'notification', A.slide, 'chime', 'notification');
        push(b, 'order-lands', A.land, 'pop', 'order-lands');
        break;
      case 'statCountUp':
        A.countStart = within(b, 'number.startAt', s.number.startAt);
        A.countDone = within(b, 'number.doneAt', s.number.doneAt);
        if (A.countDone <= A.countStart) problems.push(`${b.id}: number.doneAt must be after number.startAt`);
        push(b, 'swap-screen', b.start, 'swap', 'screen-swap');
        push(b, 'count', A.countStart, 'ping', 'count', {dur: A.countDone - A.countStart});
        push(b, 'count-done', A.countDone, 'chime', 'count-done');
        if (s.chart) {
          A.bars = within(b, 'chart.at', s.chart.at);
          push(b, 'bars', A.bars, 'riser', 'bars-riser', {dur: 2 * bf});
        }
        break;
      case 'skins': {
        A.every = fr(s.every);
        s.variants.forEach((_v, k) => {
          const f = b.start + k * A.every;
          if (f >= b.end) problems.push(`${b.id}: variant ${k + 1} would start after the block ends (${s.variants.length} variants every ${s.every} beats need ${(s.variants.length - 1) * s.every} beats)`);
          A[`v${k}`] = f;
          push(b, `skin-${k + 1}`, f, 'swap', 'skin-swap');
        });
        break;
      }
      case 'endCard':
        push(b, 'cta-whoosh', b.start, 'whoosh', 'cta-whoosh', {dur: 2 * bf});
        A.lockup = within(b, 'lockupAt', s.lockupAt);
        A.contact = within(b, 'contactAt', s.contactAt);
        A.hit = within(b, 'hitAt', s.hitAt);
        push(b, 'lockup', A.lockup, 'pop', 'lockup');
        push(b, 'contact', A.contact, 'title', 'contact');
        push(b, 'final-hit', A.hit, 'hit', 'final-hit');
        break;
    }
    // camera moves with a whoosh
    if ('camera' in s) {
      s.camera.forEach((c, k) => {
        if (c.whoosh) push(b, `macro-${k + 1}`, within(b, `camera ${k + 1}`, c.at), 'whoosh', 'macro', {dur: half + 1});
      });
    }
  }

  // ---- checks: grid, names, overlaps
  const names = new Set<string>();
  for (const c of cues) {
    if (names.has(c.name)) problems.push(`duplicate cue name ${c.name}`);
    names.add(c.name);
    const m = c.frame % bf;
    if (!(m === 0 || m === half)) problems.push(`cue ${c.name} at frame ${c.frame} is off the grid (frame % ${bf} = ${m})`);
  }
  const keyed = new Map<string, Cue>();
  for (const c of cues) {
    if (c.role === 'cut') continue;
    const k = `${c.kind}@${c.frame}@${c.role}`;
    const other = keyed.get(k);
    if (other) problems.push(`cues ${other.name} and ${c.name} are the same event at the same frame (${c.frame}); they overlap`);
    keyed.set(k, c);
  }
  // titles must not overlap in time
  const sortedT = [...titles].sort((x, y) => x.inAt - y.inAt);
  sortedT.forEach((a, i) => {
    const aEnd = a.outAt ?? a.until;
    for (const c of sortedT.slice(i + 1)) {
      if (c.inAt < aEnd) {
        problems.push(`titles ${a.block}#${a.index + 1} (frames ${a.inAt}..${aEnd}) and ${c.block}#${c.index + 1} (from ${c.inAt}) overlap in time`);
      }
    }
  });
  if (problems.length) throw new CompileError(problems);

  cues.sort((a, b) => a.frame - b.frame || a.name.localeCompare(b.name));

  // ---- sections for the music
  const sections: Section[] = [];
  const sec = (role: Section['role'], a: number, b2: number, block?: string) => sections.push({role, startFrame: a, endFrame: b2, startSeconds: +(a / fps).toFixed(4), endSeconds: +(b2 / fps).toFixed(4), ...(block ? {block} : {})});
  for (const b of blocks) {
    if (b.kind === 'chatChaos') sec('chaos', b.start, b.end, b.id);
    if (b.kind === 'iconOpen') sec('breath', b.start, b.end, b.id);
    if (b.kind === 'reveal') sec('drop', b.start, b.start, b.id);
    if (b.kind === 'skins') sec('swaps', b.start, b.end, b.id);
    if (b.kind === 'endCard') sec('final', b.start, b.end, b.id);
  }
  const rv = blocks.find((b) => b.kind === 'reveal');
  const ec = blocks.find((b) => b.kind === 'endCard');
  if (rv) sec('groove', rv.start, ec ? ec.start : total);
  const lifts = blocks.filter((b) => b.kind === 'notification' || b.kind === 'statCountUp');
  if (lifts.length) sec('lift', lifts[0].start, lifts[lifts.length - 1].end);

  return {fps, bpm, beat: bf, bar, total, width: spec.meta.width, height: spec.meta.height, blocks, cues, titles, sections};
}
