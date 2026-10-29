import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {AppIconFace} from '../lib/AppIcon';
import {useFonts} from '../lib/fonts';
import {BOUNCY, SNAP, clamp01, mix, ramp, rgba, spr} from '../lib/anim';
import type {Model} from '../model';

/** Storefront mark: a striped awning over a small shop window. Draws itself in. */
const Storefront: React.FC<{color: string; light: string; p: number; size: number}> = ({color, light, p, size}) => {
  const dark = mix(color, '#000000', 0.25);
  const stripes = 6;
  const sw = 120 / stripes;
  return (
    <svg width={size * 1.15} height={size} viewBox="0 0 138 120" fill="none" style={{overflow: 'visible', filter: 'drop-shadow(0 12px 18px rgba(80,50,10,0.28))'}}>
      <defs>
        <clipPath id="awn">
          <path d={`M9 8 H129 L138 46 ${Array.from({length: stripes}).map((_, i) => `Q${138 - i * sw * 1.15 - sw * 0.575} 62 ${138 - (i + 1) * sw * 1.15} 46`).join(' ')} Z`} />
        </clipPath>
      </defs>
      <g style={{transform: `translateY(${(1 - p) * -14}px)`, opacity: clamp01(p * 2)}}>
        <g clipPath="url(#awn)">
          {Array.from({length: stripes}).map((_, i) => (
            <rect key={i} x={i * sw * 1.15} y="8" width={sw * 1.15 + 0.5} height="60" fill={i % 2 ? light : color} />
          ))}
          <rect x="0" y="8" width="138" height="9" fill={dark} opacity="0.35" />
        </g>
      </g>
      <g style={{opacity: clamp01((p - 0.3) * 2.2), transform: `translateY(${(1 - clamp01(p)) * 16}px)`}}>
        <rect x="16" y="66" width="106" height="52" rx="6" fill={color} />
        <rect x="26" y="76" width="42" height="42" rx="4" fill={light} opacity="0.95" />
        <rect x="78" y="76" width="34" height="42" rx="4" fill={dark} opacity="0.55" />
        <circle cx="105" cy="98" r="2.6" fill={light} />
      </g>
    </svg>
  );
};

/** Lockup (mark + brand name) and contact line of the end card, on top of the phone. */
export const EndLockup: React.FC<{m: Model}> = ({m}) => {
  const f = useCurrentFrame();
  const {sans} = useFonts();
  const end = m.end!;
  const spec = end.spec as {mark: 'storefront' | 'monogram' | 'none'};
  const brand = m.spec.brand;
  const accent = m.themeOf(m.layers[m.layers.length - 1]?.ref.set ?? 'main').accent;
  const lockup = end.a.lockup;
  const lock = spr(f, lockup, BOUNCY);
  const draw = clamp01(spr(f, lockup, {damping: 18, stiffness: 90, mass: 1}));
  const contact = spr(f, end.a.contact, SNAP);
  const hitAt = end.a.hit;
  const hit = spr(f, hitAt, BOUNCY);
  const sweep = ramp(f, hitAt, hitAt + 18);
  const pulse = f >= hitAt ? 1 + 0.045 * (1 - Math.min(1, hit)) * Math.sin(Math.min(1, hit) * Math.PI) + 0.03 * (1 - clamp01(ramp(f, hitAt, hitAt + 12))) : 1;
  const words = brand.name.split(' ');
  const bi = brand.icon;
  return (
    <>
      {f >= lockup - 1 && (
        <div style={{position: 'absolute', left: 0, width: 1080, top: 252, display: 'flex', flexDirection: 'column', alignItems: 'center', transform: `scale(${pulse * (0.9 + 0.1 * Math.min(1.2, lock))})`, transformOrigin: '50% 40%'}}>
          {spec.mark === 'storefront' && <Storefront color={accent} light={mix(brand.colors.paper, '#FFFFFF', 0.6)} p={draw} size={150} />}
          {spec.mark === 'monogram' && (
            <div style={{position: 'relative', width: 150, height: 150, borderRadius: 34, overflow: 'hidden', opacity: clamp01(draw * 2), transform: `scale(${0.7 + 0.3 * draw})`, boxShadow: '0 12px 18px rgba(80,50,10,0.28)'}}>
              <AppIconFace icon={{text: bi.text, color: bi.color, textColor: bi.textColor}} mono={150 / 84} />
            </div>
          )}
          <div style={{marginTop: 14, fontFamily: sans, fontWeight: 800, fontSize: 146, lineHeight: 1, letterSpacing: '-0.055em', color: brand.colors.ink, display: 'flex', gap: 30}}>
            {words.map((w, i) => {
              const p = clamp01(spr(f, lockup + 2 + i * 3, BOUNCY));
              return <span key={i} style={{display: 'inline-block', opacity: clamp01(p * 2), transform: `translateY(${(1 - p) * 60}px) scale(${0.9 + 0.1 * p})`, filter: p < 1 ? `blur(${(1 - p) * 8}px)` : undefined}}>{w}</span>;
            })}
          </div>
        </div>
      )}
      {brand.contact && (
        <div style={{position: 'absolute', left: 60, width: 960, top: 895, textAlign: 'center', fontFamily: sans, fontWeight: 700, fontSize: 46, letterSpacing: '-0.02em', color: brand.colors.ink, opacity: clamp01(contact * 1.5), transform: `translateY(${(1 - contact) * 30}px)`}}>
          <span style={{display: 'inline-block', padding: '20px 40px', borderRadius: 70, background: rgba(mix(brand.colors.paper, '#FFFFFF', 0.7), 0.94), boxShadow: `0 18px 44px rgba(60,35,5,0.3), inset 0 0 0 ${2 + 4 * (1 - sweep)}px ${rgba(accent, 0.5)}`}}>{brand.contact}</span>
        </div>
      )}
    </>
  );
};

export const EndRing: React.FC<{m: Model}> = ({m}) => {
  const f = useCurrentFrame();
  const at = m.end!.a.hit;
  const ring = ramp(f, at, at + 20);
  return (
    <AbsoluteFill>
      <div style={{position: 'absolute', left: 540 - 700 * ring, top: 1300 - 700 * ring, width: 1400 * ring, height: 1400 * ring, borderRadius: '50%', border: `${5 * (1 - ring)}px solid rgba(255,255,255,${0.9 * (1 - ring)})`}} />
    </AbsoluteFill>
  );
};
