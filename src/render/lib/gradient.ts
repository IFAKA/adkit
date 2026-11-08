import {noise2D} from '@remotion/noise';
import {random} from 'remotion';
import {W, H} from '../model';
import type {Background} from '../../spec/schema';

/** Blob homes (share of the frame) and radius in px; blob i takes colour i of the gradient. */
const HOMES = [
  {x: 0.2, y: 0.18, r: 760},
  {x: 0.85, y: 0.38, r: 700},
  {x: 0.25, y: 0.68, r: 780},
  {x: 0.8, y: 0.92, r: 720},
  {x: 0.5, y: 0.45, r: 620},
  {x: 0.1, y: 0.95, r: 600},
];
const WANDER = 260;

/** Pure description of one background frame: blob centres, and the grain tile shift + strength (null when grain is 0). */
export function gradientLayers(bg: Pick<Background, 'drift' | 'grain'> & {gradient: string[]}, f: number) {
  const t = (f * bg.drift) / 100;
  const blobs = bg.gradient.map((color, i) => {
    const h = HOMES[i % HOMES.length];
    return {color, r: h.r, x: Math.round((h.x * W + noise2D(`gx${i}`, t, 0) * WANDER) * 10) / 10, y: Math.round((h.y * H + noise2D(`gy${i}`, t, 1) * WANDER) * 10) / 10};
  });
  const grain = bg.grain > 0 ? {opacity: bg.grain * 0.4, x: Math.floor(random(`bgx${f}`) * 256), y: Math.floor(random(`bgy${f}`) * 256)} : null;
  return {blobs, grain};
}
