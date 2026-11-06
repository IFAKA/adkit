import type {Plan, Placed} from '../engine/plan';
import type {Ad, BlockSpec} from '../spec/schema';
import type {CaptureManifest, RenderProps} from './types';
import {CAM, CAM_FAST, CAM_SLOW, CAM_SNAP, CAM_SPRINGS, setFps, type Key, type Spring} from './lib/anim';

export const SCREEN_W = 390;
export const SCREEN_H = 844;
/** Room for the status bar: captured pages start below it. */
export let INSET = 46;
/** A capture shot with safeArea already holds the status-bar area (and the home-indicator area): nothing is pushed down then. */
export function setInset(n: number) { INSET = n; }
/** frames a popped element is drawn on top of its cover */
export const POP_DUR = 24;
export const BASE_S = 1.5; // phone scale at rest
export const BASE_Y = 270; // phone centre offset at rest
export const W = 1080;
export const H = 1920;

export type Box = {x: number; y: number; w: number; h: number};
export type Ref = {set: string; name: string; key: string};
export type Theme = {bg: string; fg: string; accent: string};
/** A colour that the browser reads from the captured image (the page background around a box). */
export type ColorReq = {id: string; ref: Ref; box: Box; mode: 'inside' | 'outside'};

export type Transition = 'slide' | 'cut' | 'fade' | 'sheet' | 'zoom' | 'live';
export type Pop = {at: number; box: Box; style: 'pin' | 'ring' | 'scale'; under?: Ref; cover: ColorReq};
export type TypeItem = {at: number; dur: number; box: Box; text: string; fontSize: number; color?: string; mask: ColorReq};

export type Hole = {box: Box; radius: number; color: string | ColorReq; opacity: (f: number) => number};
export type Layer = {
  index: number;
  at: number;
  transition: Transition;
  sheetHeight: number;
  /** a sheet layer keeps the screen under it visible until this frame */
  holdUntil: number;
  ref: Ref;
  /** transition live: the recorded frames of the screen, one per video frame from `at`; after the last one the final capture is shown */
  seq?: string[];
  /** transition live: how the layer appears over the previous one */
  enter?: Transition;
  scroll: Key[];
  sticky: number;
  holes: Hole[];
  highlights: {at: number; box: Box; radius: number}[];
  press: {at: number; box: Box; radius: number}[];
  check?: {at: number; size: number; fadeAt: number};
  count?: {box: Box; startAt: number; doneAt: number; from: number; to: number; prefix: string; suffix: string; thousands: string; decimals: number; fontSize: number; weight: number; color?: string; maskColor: ColorReq};
  ring?: {box: Box; at: number};
  pops: Pop[];
  types: TypeItem[];
  pulses: {at: number; box: Box; color?: string; count: number; every: number}[];
  swipes: {at: number; dur: number; from: Box; to: Box; fromFixed: boolean; scrolls: boolean}[];
  bars?: {hole: Box; chart: Box; at: number; color: ColorReq};
  bg: ColorReq;
  /** frame when the next layer shows (Infinity for the last) */
  next: number;
  nextSlides: boolean;
  nextTransition: Transition;
};

export type TapItem = {kind: 'tap'; at: number; layer: Layer; box: Box; xfrac: number; fixed: boolean};
export type LiftItem = {kind: 'lift'; layer: Layer; card: Box; tapBox?: Box; liftAt: number; tapAt?: number; flyAt?: number; to?: {x: number; y: number}; until: number};
export type BadgeItem = {kind: 'badge'; at: number; layer: Layer; cx: number; cy: number; count: number};
export type Notif = {block: Placed; layer: Layer; box: Box; slideAt: number; landAt: number; banner: {title: string; body: string; time: string}; startAt: number; endAt: number};

export type Shot = {f: number; zoom: number; sx: number; sy: number; qy: number; spring: Spring};

export type Model = {
  plan: Plan;
  spec: Ad;
  manifest: CaptureManifest;
  bf: number;
  layers: Layer[];
  taps: TapItem[];
  lifts: LiftItem[];
  badges: BadgeItem[];
  notifs: Notif[];
  shots: Shot[];
  roll: Key[];
  colorReqs: ColorReq[];
  /** key moments */
  chaos?: {block: Placed; icon?: Placed; into: 'icon' | 'center'; look: 'bubbles' | 'cards' | 'tabs' | 'toasts'; size?: number; pileTop?: number; tile?: {glyph: string | false; color?: string}; flyAt: number; counter: {start: number; rise: number; cap: number; label?: string} | false; items: {at: number; side: 'in' | 'out'; text: string; icon?: string}[]};
  reveal?: Placed;
  openFromIcon: boolean;
  end?: Placed;
  whips: {out: number; spin: number}[];
  skins: {block: Placed; swaps: number[]; variants: {ref: Ref; theme: Theme}[]}[];
  sheenGroups: number[];
  themeOf: (set: string) => Theme;
  mainTheme: Theme;
  /** Safe-area insets of the capture (0 when it was shot without safeArea). */
  safe: {top: number; bottom: number};
  /** Time shown in the phone's status bar. */
  statusTime: string;
  imageUrl: (p: string) => string;
  photo?: string;
};

export const parseRef = (s: string): Ref => {
  const i = s.indexOf('/');
  const set = i < 0 ? 'main' : s.slice(0, i);
  const name = i < 0 ? s : s.slice(i + 1);
  return {set, name, key: `${set}/${name}`};
};

export const unionBox = (a: Box, b: Box): Box => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y};
};

export function buildModel(props: RenderProps): Model {
  const {plan, spec, manifest} = props;
  setFps(plan.fps);
  const safe = manifest.safeArea ?? {top: 0, bottom: 0};
  setInset(manifest.safeArea ? 0 : 46);
  const bf = plan.beat;
  const fr = (b: number) => Math.floor(b * bf + 1e-9);
  const sc = bf / 15; // scale of the fixed frame counts that were tuned at 15 frames per beat

  const fallbackTheme: Theme = {bg: spec.brand.colors.paper, fg: spec.brand.colors.ink, accent: spec.brand.colors.accent};
  const themeOf = (set: string): Theme => manifest.sets[set]?.theme ?? fallbackTheme;
  const info = (ref: Ref) => manifest.sets[ref.set]?.screens[ref.name];
  const pageH = (ref: Ref) => {
    const i = info(ref);
    return i?.fullFile ? i.fullHeight : SCREEN_H;
  };
  const isFixed = (ref: Ref, el: string): boolean => {
    const sets = spec.capture?.sets as Record<string, {screens: {name?: string; elements: Record<string, unknown>}[]}> | undefined;
    const scr = sets?.[ref.set]?.screens.find((s) => s.name === ref.name);
    const e = scr?.elements[el];
    return !!e && typeof e === 'object' && (e as {fixed?: boolean}).fixed === true;
  };
  const boxOf = (ref: Ref, el: string): Box => {
    const parts = el.split('+').map((s) => s.trim());
    const get = (n: string): Box => {
      const b = info(ref)?.elements[n];
      if (!b) throw new Error(`screen "${ref.key}" has no element "${n}" in the capture manifest`);
      return b;
    };
    return parts.map(get).reduce((a, b) => unionBox(a, b));
  };
  const scrollFor = (ref: Ref, el: string, y: number) => {
    const b = boxOf(ref, el);
    const max = Math.max(0, pageH(ref) - SCREEN_H + INSET);
    return Math.min(max, Math.max(0, b.y + b.h / 2 + INSET - y));
  };
  const imageUrl = (p: string) => {
    const base = props.assetBase;
    if (/^https?:/.test(base)) return `${base.replace(/\/$/, '')}/${p}`;
    return `@static:${base ? `${base.replace(/\/$/, '')}/` : ''}${p}`;
  };

  const m: Model = {
    plan, spec, manifest, bf, layers: [], taps: [], lifts: [], badges: [], notifs: [], shots: [], roll: [], colorReqs: [],
    openFromIcon: false, whips: [], skins: [], sheenGroups: [], themeOf, mainTheme: themeOf('main'), safe, statusTime: manifest.statusTime ?? '9:41', imageUrl,
  };
  if (props.photo) m.photo = imageUrl(props.photo);
  const req = (ref: Ref, box: Box, mode: 'inside' | 'outside', tag: string): ColorReq => {
    const r = {id: `${tag}:${ref.key}:${box.x},${box.y},${box.w},${box.h}:${mode}`, ref, box, mode};
    if (!m.colorReqs.find((c) => c.id === r.id)) m.colorReqs.push(r);
    return r;
  };

  const pushLayer = (b: Placed, at: number, transition: Transition, ref: Ref, scroll: Key[], sticky = 0, sheetHeight = 520, enter: Transition = 'cut'): Layer => {
    const l: Layer = {index: m.layers.length, at, transition, sheetHeight, holdUntil: -1, ref, scroll, sticky, pops: [], types: [], pulses: [], swipes: [], holes: [], highlights: [], press: [], bg: req(ref, {x: 0, y: 0, w: SCREEN_W, h: 60}, 'inside', 'bg'), next: Infinity, nextSlides: false, nextTransition: 'cut'};
    if (transition === 'live') {
      const fr = manifest.sets[ref.set]?.screens[ref.name]?.frames;
      if (!fr?.length) throw new Error(`screen ${ref.key}: transition live needs a capture screen with a record step (no recorded frames)`);
      l.seq = fr.map((p) => imageUrl(p));
      l.enter = enter;
    }
    const entry: Transition = transition === 'live' ? enter : transition;
    const prev = m.layers[m.layers.length - 1];
    if (prev) {
      prev.next = at;
      prev.nextSlides = entry !== 'cut';
      prev.nextTransition = entry;
      if (prev.transition === 'sheet' && m.layers.length >= 2) m.layers[m.layers.length - 2].holdUntil = at;
    }
    m.layers.push(l);
    return l;
  };
  const targetScroll = (l: Layer, f: number) => {
    let v = l.scroll[0][1];
    for (const k of l.scroll) if (k[0] <= f) v = k[1];
    return v;
  };
  const SOFT_SWIPE: Spring = {damping: 26, stiffness: 110, mass: 1};
  const SLOW: Spring = {damping: 26, stiffness: 55, mass: 1.5};
  const blocks = plan.blocks;

  blocks.forEach((b, bi) => {
    const s = b.spec as BlockSpec;
    const prev = blocks[bi - 1];
    switch (s.block) {
      case 'chaos': {
        m.chaos = {
          block: b, icon: s.into === 'icon' ? blocks[bi + 1] : undefined, into: s.into, look: s.look, size: s.size, pileTop: s.pileTop, tile: s.tile, flyAt: b.a.flyAt, counter: s.counter,
          items: s.items.map((x) => ({at: b.start + (x.frame !== undefined ? x.frame : fr(x.beat!)), side: x.side, text: x.text, icon: x.icon})),
        };
        break;
      }
      case 'reveal': {
        m.reveal = b;
        m.openFromIcon = s.open === 'icon' || (s.open === 'auto' && prev?.kind === 'iconOpen');
        pushLayer(b, b.start, 'cut', parseRef(s.screen), [[0, 0], [b.start + Math.round(50 * sc), s.scroll]]);
        break;
      }
      case 'tapFlow': {
        const startRef = parseRef(s.start.screen);
        let cur = m.layers[m.layers.length - 1];
        if (cur && cur.ref.key === startRef.key) {
          if (targetScroll(cur, b.start) !== s.start.scroll) cur.scroll = [...cur.scroll, [b.start, s.start.scroll]];
        } else cur = pushLayer(b, b.start, m.layers.length ? s.start.transition : 'cut', startRef, [[0, s.start.scroll]], 0, 520, s.start.enter);
        const stepF = (st: {at: number}) => b.start + fr(st.at);
        const screenSteps = s.steps.filter((x) => x.type === 'screen');
        const nextScreenAt = (f: number) => {
          const n = screenSteps.map(stepF).find((x) => x > f);
          return n ?? Infinity;
        };
        let lastLift: LiftItem | undefined;
        for (const st of s.steps) {
          const f = stepF(st);
          switch (st.type) {
            case 'screen': {
              const ref = parseRef(st.screen);
              let target = 0;
              if (typeof st.scroll === 'number') target = st.scroll;
              else if (st.scroll) target = scrollFor(ref, st.scroll.element, st.scroll.y);
              const nxt = nextScreenAt(f);
              const animate = s.steps.some((x) => x.type === 'lift' && stepF(x) > f && stepF(x) < nxt);
              cur = pushLayer(b, f, st.transition, ref, !target ? [[0, 0]] : animate ? [[0, 0], [f + 6, target, SLOW]] : [[0, target]], st.sticky ?? 0, st.sheetHeight, st.enter);
              break;
            }
            case 'tap': {
              const box = boxOf(cur.ref, st.element);
              if (st.highlight) cur.highlights.push({at: f, box, radius: st.radius});
              if (st.press) cur.press.push({at: f, box, radius: st.radius});
              m.taps.push({kind: 'tap', at: f, layer: cur, box, xfrac: st.x, fixed: isFixed(cur.ref, st.element)});
              break;
            }
            case 'lift': {
              const card = boxOf(cur.ref, st.element);
              lastLift = {kind: 'lift', layer: cur, card, tapBox: st.tap ? boxOf(cur.ref, st.tap) : undefined, liftAt: f, tapAt: st.tapAt !== undefined ? b.start + fr(st.tapAt) : undefined, until: nextScreenAt(f)};
              m.lifts.push(lastLift);
              const L = lastLift;
              cur.holes.push({box: card, radius: 4, color: req(cur.ref, card, 'outside', 'hole'), opacity: (ff) => (ff < L.liftAt ? 0 : L.flyAt === undefined ? 1 : ff < L.flyAt + 8 ? 1 : 1 - Math.min(1, Math.max(0, (ff - L.flyAt - 8) / 10)))});
              break;
            }
            case 'fly': {
              if (lastLift) {
                const to = boxOf(cur.ref, st.to);
                const fixed = isFixed(cur.ref, st.to);
                lastLift.flyAt = f;
                lastLift.to = {x: to.x + to.w - 6, y: to.y + 8 + INSET - (fixed ? 0 : targetScroll(cur, f))};
              }
              break;
            }
            case 'badge': {
              const to = boxOf(cur.ref, st.element);
              const fixed = isFixed(cur.ref, st.element);
              m.badges.push({kind: 'badge', at: f, layer: cur, cx: to.x + to.w - 6, cy: to.y + 8 + INSET - (fixed ? 0 : targetScroll(cur, f)), count: st.count});
              if (lastLift) lastLift.until = Math.min(lastLift.until, f + 6);
              break;
            }
            case 'pop': {
              const under = st.under ? parseRef(st.under) : undefined;
              st.elements.forEach((el, e) => {
                const box = boxOf(cur.ref, el);
                const at = b.start + fr(st.at + e * st.stagger);
                const cover = req(cur.ref, box, 'outside', 'pop');
                cur.pops.push({at, box, style: st.style, under, cover});
                if (!under) cur.holes.push({box, radius: 0, color: cover, opacity: (ff) => (ff < at + POP_DUR ? 1 : 0)});
              });
              break;
            }
            case 'type': {
              const box = boxOf(cur.ref, st.element);
              const mask = req(cur.ref, box, 'inside', 'type');
              cur.types.push({at: f, dur: fr(st.beats), box, text: st.text, fontSize: st.fontSize ?? Math.round(box.h * 0.45), color: st.color, mask});
              cur.holes.push({box, radius: 0, color: mask, opacity: (ff) => (ff >= f ? 1 : 0)});
              break;
            }
            case 'pulse':
              cur.pulses.push({at: f, box: boxOf(cur.ref, st.element), color: st.color, count: st.count, every: bf});
              break;
            case 'swipe': {
              const dur = Math.max(1, fr(st.beats));
              cur.swipes.push({at: f, dur, from: boxOf(cur.ref, st.from), to: boxOf(cur.ref, st.to), fromFixed: isFixed(cur.ref, st.from), scrolls: st.scroll !== undefined});
              if (st.scroll !== undefined) cur.scroll = [...cur.scroll, [f, targetScroll(cur, f) + st.scroll, SOFT_SWIPE]];
              break;
            }
            case 'check':
              cur.check = {at: f, size: st.size, fadeAt: nextScreenAt(f) + 2};
              break;
          }
        }
        break;
      }
      case 'notification': {
        const ref = parseRef(s.screen);
        const slide: Transition = prev && prev.kind !== 'whip' ? 'slide' : 'cut';
        const l = pushLayer(b, b.start, slide, ref, [[0, 0]]);
        const box = boxOf(ref, [s.element, ...s.also].join('+'));
        l.holes.push({box, radius: 20, color: req(ref, box, 'outside', 'hole'), opacity: () => 1});
        m.notifs.push({block: b, layer: l, box, slideAt: b.a.slide, landAt: b.a.land, banner: s.banner, startAt: b.start, endAt: b.end + 6});
        break;
      }
      case 'statCountUp': {
        const ref = parseRef(s.screen);
        const slide: Transition = prev && prev.kind !== 'whip' ? 'slide' : 'cut';
        const l = pushLayer(b, b.start, slide, ref, [[0, s.scroll.from], [b.a.countDone, s.scroll.to, {damping: 22, stiffness: 90, mass: 1}]]);
        const nb = boxOf(ref, s.number.element);
        const mask = req(ref, nb, 'inside', 'num');
        l.holes.push({box: nb, radius: 0, color: mask, opacity: (ff) => (ff < b.a.countDone ? 1 : 0)});
        l.count = {box: nb, startAt: b.a.countStart, doneAt: b.a.countDone, from: s.number.from, to: s.number.to, prefix: s.number.prefix, suffix: s.number.suffix, thousands: s.number.thousands, decimals: s.number.decimals, fontSize: s.number.fontSize, weight: s.number.weight, color: s.number.color, maskColor: mask};
        if (s.card) l.ring = {box: boxOf(ref, s.card), at: b.a.countDone};
        if (s.chart) {
          const chart = boxOf(ref, s.chart.element);
          const hole = {x: chart.x + 30, y: chart.y + chart.h * 0.2, w: chart.w - 38, h: chart.h * 0.58};
          const color = req(ref, hole, 'inside', 'bars');
          l.bars = {hole, chart, at: b.a.bars, color};
          l.holes.push({box: hole, radius: 0, color, opacity: (ff) => (ff >= b.a.bars + 40 ? 0 : 1)});
        }
        break;
      }
      case 'skins': {
        const variants = s.variants.map((v) => ({ref: parseRef(v.screen), theme: themeOf(parseRef(v.screen).set)}));
        const swaps = s.variants.map((_, k) => b.a[`v${k}`]);
        s.variants.forEach((v, k) => pushLayer(b, swaps[k], k === 0 && !m.layers.length ? 'cut' : s.transition, variants[k].ref, [[0, v.scroll]], v.sticky));
        m.skins.push({block: b, swaps, variants});
        break;
      }
      case 'endCard':
        m.end = b;
        pushLayer(b, b.start, m.layers.length ? 'fade' : 'cut', parseRef(s.screen), [[0, s.scroll]]);
        break;
      case 'whip':
        m.whips.push({out: b.a.out, spin: b.start});
        break;
    }
  });

  // sheen groups: every phone block starts one, except a count-up that follows a notification
  blocks.forEach((b, i) => {
    if (!['reveal', 'tapFlow', 'notification', 'statCountUp', 'skins', 'endCard'].includes(b.kind)) return;
    if (b.kind === 'statCountUp' && blocks[i - 1]?.kind === 'notification') return;
    m.sheenGroups.push(b.start);
  });

  // ---- camera
  const layerAt = (f: number) => {
    let r = m.layers[0];
    for (const l of m.layers) if (l.at <= f) r = l;
    return r;
  };
  const shots: Shot[] = [];
  const ownReveal = m.reveal && (m.reveal.spec as {camera: unknown[]}).camera.length > 0;
  if (m.reveal && !ownReveal) {
    shots.push({f: 0, zoom: 1.12, sx: 195, sy: 422, qy: 1270, spring: CAM});
    shots.push({f: m.reveal.start + Math.round(85 * sc), zoom: 1.33, sx: 195, sy: 300, qy: 1180, spring: CAM});
  }
  blocks.forEach((b) => {
    const s = b.spec as BlockSpec;
    if (b.kind === 'endCard') {
      shots.push({f: b.start, zoom: 1.0, sx: 195, sy: 422, qy: 1230, spring: CAM_SLOW});
      return;
    }
    const keys = 'camera' in s ? s.camera : [];
    if (b.kind === 'skins' && !keys.length) {
      shots.push({f: b.start, zoom: 1.15, sx: 195, sy: 380, qy: 1270, spring: CAM});
      shots.push({f: b.end - 3, zoom: 1.22, sx: 195, sy: 380, qy: 1270, spring: CAM_SLOW});
      return;
    }
    for (const k of keys) {
      const f = b.start + fr(k.at) + k.offset;
      const l = layerAt(f);
      const sc2 = targetScroll(l, f);
      const elBox = (name: string) => boxOf(l.ref, name);
      const cy = (bx: Box, fixed = false) => bx.y + bx.h / 2 - (fixed ? 0 : sc2) + INSET;
      let zoom: number;
      if (typeof k.zoom === 'number') zoom = k.zoom;
      else zoom = (k.zoom.fraction * W) / (elBox(k.zoom.fit).w * BASE_S);
      let sx = 195;
      let sy = 422;
      if (k.focus.element) {
        const bx = elBox(k.focus.element);
        const fixed = !k.focus.element.includes('+') && isFixed(l.ref, k.focus.element);
        sy = cy(bx, fixed) + k.focus.dy;
        if (k.focus.x === 'element') sx = bx.x + bx.w / 2;
      } else {
        if (k.focus.y !== undefined) sy = k.focus.y;
        sy += k.focus.dy;
      }
      if (typeof k.focus.x === 'number') sx = k.focus.x;
      shots.push({f, zoom, sx, sy, qy: k.qy, spring: CAM_SPRINGS[k.spring]});
      if (k.roll !== undefined) m.roll.push([f, k.roll, CAM_SPRINGS[k.spring] === CAM_SPRINGS.soft ? CAM : CAM]);
    }
  });
  m.shots = shots.sort((a, b) => a.f - b.f);
  m.roll.sort((a, b) => a[0] - b[0]);
  return m;
}
