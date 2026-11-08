import {spring, interpolate, type SpringConfig} from 'remotion';

let FPS = 30;
/** Set once per render from plan.fps (springs are defined in seconds). */
export const setFps = (f: number) => {
  FPS = f;
};

/** A spring, or a fixed-length curve (`curve` maps 0..1 to 0..1 over `frames`) for moves a spring cannot make. */
export type Spring = Partial<SpringConfig> & {curve?: (u: number) => number; frames?: number};
export const SOFT: Spring = {damping: 22, stiffness: 120, mass: 1};
export const SNAP: Spring = {damping: 20, stiffness: 220, mass: 0.8};
export const BOUNCY: Spring = {damping: 9, stiffness: 180, mass: 0.8};
export const HEAVY: Spring = {damping: 18, stiffness: 70, mass: 1.3};

/** The renderer's own camera moves (opening push, end card pull-out, skins) and the roll. */
export const CAM: Spring = {damping: 22, stiffness: 55, mass: 1.3};
export const CAM_SLOW: Spring = {damping: 30, stiffness: 20, mass: 1.5};
/** The two feels an author can pick. snappy (default): fast start (full speed after about 5 frames, so the first frame is not a jump), long soft tail. drift: slows down but keeps moving when it ends (use before another move or a held frame). */
export const CAM_SNAPPY: Spring = {curve: (u) => 1 - Math.pow(1 - Math.pow(u, 1.5), 5), frames: 30};
export const CAM_DRIFT: Spring = {curve: (u) => { const w = Math.pow(u, 1.5); return 0.6 * (1 - Math.pow(1 - w, 3)) + 0.4 * w; }, frames: 24};
export const CAM_SPRINGS = {snappy: CAM_SNAPPY, drift: CAM_DRIFT} as const;

const progress = (t: number, config: Spring, fps = FPS): number => {
  if (config.curve) return config.curve(clamp01(t / (config.frames ?? 24)));
  return spring({frame: t, fps, config});
};

/** Frames until a move is within 1 % of its target, and its speed there (share of the move per frame; 0 = a dead stop). */
export const settle = (config: Spring, fps = FPS): {frames: number; endSpeed: number} => {
  let frames = 0;
  for (let t = 0; t < 300; t++) if (Math.abs(1 - progress(t, config, fps)) > 0.01) frames = t + 1;
  return {frames, endSpeed: progress(frames, config, fps) - progress(frames - 1, config, fps)};
};

export const spr = (frame: number, at: number, config: Spring = SOFT) => progress(frame - at, config);

export type Key = [frame: number, value: number, config?: Spring];

/** Keyframed spring track. Each key starts a spring from wherever the value is at that frame. */
export const track = (f: number, keys: Key[], cfg: Spring = SOFT): number => {
  const valueAt = (i: number, t: number): number => {
    if (i === 0) return keys[0][1];
    const [kf, target, c] = keys[i];
    const from = valueAt(i - 1, kf);
    return from + (target - from) * progress(t - kf, c ?? cfg);
  };
  let idx = 0;
  for (let i = 1; i < keys.length; i++) if (f >= keys[i][0]) idx = i;
  return valueAt(idx, f);
};

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const ramp = (f: number, a: number, b: number) => interpolate(f, [a, b], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
export const easeInOut = (t: number) => {
  t = clamp01(t);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

const hex = (c: string): number[] => {
  if (c.startsWith('rgb')) return (c.match(/[\d.]+/g) ?? ['0', '0', '0']).slice(0, 3).map(Number);
  const h = c.replace('#', '');
  const n = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16));
};
export const mix = (a: string, b: string, t: number) => {
  const A = hex(a);
  const B = hex(b);
  return `rgb(${A.map((v, i) => Math.round(lerp(v, B[i], clamp01(t)))).join(',')})`;
};
export const rgba = (c: string, a: number) => {
  const [r, g, b] = hex(c);
  return `rgba(${r},${g},${b},${a})`;
};
