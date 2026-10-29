import {noise2D} from '@remotion/noise';
import {BOUNCY, CAM, HEAVY, SOFT, track, spr, ramp, lerp, type Key} from './lib/anim';
import {BASE_S, BASE_Y, H, W, type Model} from './model';

export type Pose = {x: number; y: number; z: number; rx: number; ry: number; rz: number; s: number};
export type Cam = {zoom: number; rot: number; fx: number; fy: number; qy: number};

export const OPEN_QY = 1270;
export const ICON_FRAME_CY = 1000;
export const ICON_FRAME_PX = 240;
const OPEN_Y = BASE_Y + (ICON_FRAME_CY - OPEN_QY);
const OPEN_S = 0.26;

const OPEN_SPRING = {damping: 14, stiffness: 150, mass: 0.8};
export const openSpring = (f: number, at: number) => spr(f, at, OPEN_SPRING);

export const phonePose = (m: Model, f: number): Pose => {
  const rv = m.reveal;
  const rEnd = rv ? rv.end : 0;
  const eStart = m.end ? m.end.start : m.plan.total;
  const k = m.bf / 15;
  let y = track(f, [[0, BASE_Y], [eStart, 535, HEAVY]]);
  let rx = track(f, [[0, 5], [rEnd, 0, SOFT], [eStart, 9, HEAVY]]);
  let ry = track(f, [[0, -9], [rEnd, 0, SOFT], [eStart, -20, HEAVY]]);
  let s = track(f, [[0, BASE_S], [eStart, 1.1, HEAVY]]);
  let rz = 0;
  let x = 0;
  const z = 0;

  if (rv) {
    const t0 = rv.start;
    if (m.openFromIcon) {
      if (f >= t0 && f < t0 + 40) {
        const o = openSpring(f, t0);
        y = lerp(OPEN_Y, y, o);
        rx = lerp(0, rx, o);
        ry = lerp(0, ry, o);
        s = lerp(OPEN_S, s, o);
      }
    } else if (f >= t0 && f < t0 + 40) {
      y += 900 * (1 - openSpring(f, t0));
    }
    // drift: a living phone, never frozen
    const d0 = t0 + Math.round(10 * k);
    const d1 = rEnd + Math.round(10 * k);
    if (f >= d0 && f < d1) {
      const kk = Math.min(1, (f - d0) / 30) * (1 - Math.min(1, Math.max(0, (f - (d1 - 25)) / 25)));
      ry += 6 * Math.sin((f - d0) / 40) * kk;
      rx += 2.5 * Math.sin((f - d0) / 55 + 1) * kk;
    }
    const n0 = t0 + Math.round(30 * k);
    if (f >= n0 && f < eStart) {
      const kk = Math.min(1, (f - n0) / 40);
      ry += noise2D('ry', f / 90, 0) * 1.6 * kk;
      rx += noise2D('rx', f / 90, 1) * 0.8 * kk;
      y += noise2D('y', f / 70, 2) * 8 * kk;
    }
  }

  for (const w of m.whips) {
    if (f >= w.out && f < w.spin) {
      const u = ramp(f, w.out, w.spin);
      x = -1700 * u * u;
      rz -= 5 * u;
      ry += 14 * u;
    } else if (f >= w.spin && f < w.spin + 24) {
      const p = Math.min(1, spr(f, w.spin, {damping: 24, stiffness: 260, mass: 0.8}));
      x = 1300 * (1 - p);
      rz += 5 * (1 - p);
      ry -= 14 * (1 - p);
    }
  }

  for (const sk of m.skins) {
    if (f >= sk.block.start && f < sk.block.end) {
      sk.swaps.forEach((sf, i) => {
        const p = spr(f, sf, BOUNCY);
        const dir = i % 2 ? 1 : -1;
        ry += dir * 16 * (1 - p);
        s += 0.05 * (1 - p);
        rz += dir * -2 * (1 - p);
      });
      ry += Math.sin((f - sk.block.start) / 18) * 4;
    }
  }

  if (m.end && f >= m.end.start) {
    const t = f - m.end.start;
    ry += Math.sin(t / 40) * 5;
    y += Math.sin(t / 33) * 10;
    x = 110 + Math.sin(t / 50) * 8;
  }
  return {x, y, z, rx, ry, rz, s};
};

/** Stage point of a phone screen coordinate while the phone is at rest. */
export const stagePt = (sx: number, sy: number, s = BASE_S) => ({x: W / 2 + s * (sx - 195), y: H / 2 + BASE_Y + s * (sy - 422)});

export const camera = (m: Model, f: number): Cam => {
  const shots = m.shots;
  const val = (key: 'zoom' | 'sx' | 'sy' | 'qy') => track(f, shots.map((k) => [k.f, k[key], k.spring] as Key), CAM);
  const rv = m.reveal;
  const medAt = shots[1]?.f ?? 0;
  const zoomBase = rv && f < medAt ? 1 + 0.12 * ramp(f, rv.start, medAt) : val('zoom');
  const zoom = zoomBase * (1 + 0.012 * Math.sin(f / 40));
  const rollKeys: Key[] = [[0, 0], ...m.roll];
  const rot = noise2D('cr', f / 80, 2) * 0.1 + track(f, rollKeys, CAM);
  return {zoom, rot, fx: val('sx'), fy: val('sy'), qy: val('qy')};
};
