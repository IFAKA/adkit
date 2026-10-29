import React from 'react';
import {interpolate} from 'remotion';
import type {Box} from '../model';
import {BOUNCY, SNAP, ramp, spr, rgba, clamp01} from './anim';
import {useFonts} from './fonts';

/** Finger tap in screen coordinates: a soft circle slides in, presses (scale down), ripples, fades. */
export const Tap: React.FC<{f: number; at: number; x: number; y: number; fromDx?: number; fromDy?: number}> = ({f, at, x, y, fromDx = 46, fromDy = 70}) => {
  const t = f - (at - 9);
  if (t < 0 || t > 30) return null;
  const arrive = spr(f, at - 9, SNAP);
  const px = x + fromDx * (1 - arrive);
  const py = y + fromDy * (1 - arrive);
  const press = interpolate(f, [at - 2, at + 1, at + 7, at + 11], [1, 0.74, 0.74, 1.05], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const fadeIn = ramp(f, at - 9, at - 4);
  const fadeOut = 1 - ramp(f, at + 9, at + 17);
  const rip = ramp(f, at, at + 14);
  return (
    <div style={{position: 'absolute', left: px, top: py, width: 0, height: 0, pointerEvents: 'none'}}>
      <div style={{position: 'absolute', left: -60 * rip - 5, top: -60 * rip - 5, width: 120 * rip + 10, height: 120 * rip + 10, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.9)', opacity: f >= at ? (1 - rip) * 0.9 : 0, boxShadow: '0 0 20px rgba(255,255,255,0.4)'}} />
      <div
        style={{
          position: 'absolute',
          left: -34,
          top: -34,
          width: 68,
          height: 68,
          borderRadius: '50%',
          background: 'radial-gradient(circle at 40% 35%, rgba(255,255,255,0.78), rgba(235,235,235,0.5))',
          border: '1.5px solid rgba(255,255,255,0.9)',
          boxShadow: `0 ${10 * press}px ${22 * press}px rgba(30,20,5,0.35)`,
          transform: `scale(${press})`,
          opacity: fadeIn * fadeOut,
        }}
      />
    </div>
  );
};

/** Selected-state feedback drawn over a tapped element. */
export const Highlight: React.FC<{f: number; at: number; box: Box; color: string; scroll?: number; radius?: number}> = ({f, at, box, color, scroll = 0, radius = 16}) => {
  if (f < at) return null;
  const p = spr(f, at, SNAP);
  const pulse = ramp(f, at, at + 12);
  return (
    <>
      <div style={{position: 'absolute', left: box.x - 3, top: box.y - scroll - 3, width: box.w + 6, height: box.h + 6, borderRadius: radius + 3, border: `3px solid ${color}`, background: rgba(color, 0.14 * p), opacity: clamp01(p)}} />
      <div style={{position: 'absolute', left: box.x - 3 - 14 * pulse, top: box.y - scroll - 3 - 14 * pulse, width: box.w + 6 + 28 * pulse, height: box.h + 6 + 28 * pulse, borderRadius: radius + 3 + 14 * pulse, border: `2px solid ${color}`, opacity: (1 - pulse) * 0.7}} />
    </>
  );
};

/** Cart count badge that lands with overshoot. */
export const CartBadge: React.FC<{f: number; at: number; cx: number; cy: number; color: string; count?: number}> = ({f, at, cx, cy, color, count = 1}) => {
  const {sans: SANS} = useFonts();
  if (f < at) return null;
  const p = spr(f, at, BOUNCY);
  const ring = ramp(f, at, at + 14);
  return (
    <div style={{position: 'absolute', left: cx, top: cy, width: 0, height: 0}}>
      <div style={{position: 'absolute', left: -20 - 22 * ring, top: -20 - 22 * ring, width: 40 + 44 * ring, height: 40 + 44 * ring, borderRadius: '50%', border: `3px solid ${color}`, opacity: (1 - ring) * 0.8}} />
      <div style={{position: 'absolute', left: -15, top: -15, width: 30, height: 30, borderRadius: 15, background: color, color: '#fff', fontFamily: SANS, fontWeight: 800, fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${p})`, boxShadow: '0 4px 10px rgba(0,0,0,0.3), 0 0 0 3px rgba(255,255,255,0.9)'}}>
        {count}
      </div>
    </div>
  );
};

/** Success check that draws itself. */
export const Check: React.FC<{f: number; at: number; color: string; size?: number; fadeAt?: number}> = ({f, at, color, size = 150, fadeAt = 99999}) => {
  if (f < at) return null;
  const p = spr(f, at, BOUNCY);
  const draw = ramp(f, at + 3, at + 11);
  const fade = 1 - ramp(f, fadeAt, fadeAt + 8);
  return (
    <div style={{position: 'absolute', left: 195 - size / 2, top: 422 - size / 2, width: size, height: size, borderRadius: '50%', background: color, transform: `scale(${p})`, opacity: fade, boxShadow: `0 20px 50px ${rgba(color, 0.55)}, 0 0 0 10px rgba(255,255,255,0.7)`, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12.5l4.5 4.5L19 7.5" strokeDasharray={30} strokeDashoffset={30 * (1 - draw)} />
      </svg>
    </div>
  );
};
