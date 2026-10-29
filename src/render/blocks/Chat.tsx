import React from 'react';
import {AbsoluteFill, random, useCurrentFrame} from 'remotion';
import {noise2D} from '@remotion/noise';
import {MotionBlur} from '../lib/Blur';
import {H, W, type Model} from '../model';
import {useFonts} from '../lib/fonts';
import {SNAP, clamp01, easeInOut, lerp, mix, ramp, rgba, spr} from '../lib/anim';
import {AppIconFace} from '../lib/AppIcon';
import {Title} from '../lib/Title';
import {ICON_FRAME_CY, ICON_FRAME_PX} from '../choreo';
import type {Title as TitleSpec} from '../../spec/schema';

const FONT = 38;
const measure = (text: string) => {
  const textW = text.length * FONT * 0.53;
  const w = Math.min(700, textW + 100);
  const lines = Math.ceil(textW / (w - 64));
  return {w, h: lines * 48 + 52};
};
const BOTTOM = 1500;
const FLY_DUR = 9;
const FLY_GAP = 0.8;
const ICON_TOP_CY = 317;

type Item = {at: number; side: 'in' | 'out'; text: string; w: number; h: number; i: number};

/** Everything of the chat scene that depends only on the model (local frames: 0 = start of the chatChaos block). */
const setup = (m: Model) => {
  const c = m.chat!;
  const t0 = c.block.start;
  const E = c.block.end - t0; // end of the chat block
  const iEnd = c.icon.end - t0;
  const morph = c.icon.a.morph - t0;
  const flyAt = c.flyAt - t0;
  const ref = E - 5;
  const items: Item[] = c.messages.map((x, i) => ({at: x.at - t0, side: x.side, text: x.text, ...measure(x.text), i}));
  const place = (b: Item, f: number) => {
    const p = clamp01(spr(f, b.at, SNAP));
    const buzz = Math.sin((f - b.at) * 2.4) * 7 * Math.max(0, 1 - (f - b.at) / 10);
    const pushed = items.filter((j) => j.i > b.i && f >= j.at).reduce((acc, j) => acc + (j.h * 0.8 + 6) * clamp01(spr(f, j.at, SNAP)), 0);
    const bottom = BOTTOM - pushed + (1 - p) * 70;
    const left = b.side === 'in' ? 56 + (random(`jx${b.i}`) - 0.3) * 40 : W - 56 - b.w - (random(`jx${b.i}`) - 0.3) * 40;
    return {p, buzz, bottom, left, cx: left + b.w / 2, cy: bottom - b.h / 2, rot: (random(`r${b.i}`) - 0.5) * 5};
  };
  const flyers = items.filter((b) => b.at <= flyAt - 2 && place(b, 200).cy >= 800).sort((a, b) => b.i - a.i).map((b, k) => ({i: b.i, start: flyAt + Math.round(k * FLY_GAP)}));
  const flyStart: Record<number, number> = Object.fromEntries(flyers.map((x) => [x.i, x.start]));
  const arrivals = flyers.map((x) => x.start + FLY_DUR);
  const glide: [number, number] = [E + 5, iEnd];
  const iconCy = (f: number) => lerp(ICON_TOP_CY, ICON_FRAME_CY, easeInOut(ramp(f, glide[0], glide[1])));
  return {t0, E, iEnd, morph, flyAt, ref, items, place, flyers, flyStart, arrivals, iconCy, glide};
};
type S = ReturnType<typeof setup>;

const BubbleField: React.FC<{m: Model; s: S; f: number; layer?: 'all' | 'static' | 'fly'}> = ({m, s, f, layer = 'all'}) => {
  const {sans} = useFonts();
  const flying = f >= s.flyAt;
  return (
    <AbsoluteFill style={{maskImage: !flying || layer === 'static' ? 'linear-gradient(to bottom, transparent 720px, #000 980px)' : undefined}}>
      {s.items.map((b) => {
        if (f < b.at) return null;
        const fs = s.flyStart[b.i];
        const isFlyer = fs !== undefined;
        if (flying && layer === 'static' && isFlyer) return null;
        if (flying && layer === 'fly' && !isFlyer) return null;
        const q = s.place(b, f);
        const out = b.side === 'out';
        let tx = q.buzz * (1 - ramp(f, s.flyAt - 4, s.flyAt + 2));
        let ty = 0;
        let sx = 0.7 + 0.3 * q.p;
        let sy = sx;
        let rot = q.rot;
        let alpha = Math.min(1, q.p * 2.5);
        if (flying && !isFlyer) alpha *= 1 - ramp(f, s.flyAt, s.flyAt + 5);
        if (isFlyer && f >= fs) {
          const u = clamp01((f - fs) / FLY_DUR);
          const e = Math.pow(u, 1.3);
          const T0 = {x: q.cx, y: q.cy};
          const T1 = {x: W / 2, y: s.iconCy(f)};
          const dx = T1.x - T0.x;
          const dy = T1.y - T0.y;
          const len = Math.hypot(dx, dy) || 1;
          const kk = s.flyers.findIndex((x) => x.i === b.i);
          const bend = (kk % 2 ? 1 : -1) * (110 + 90 * (kk % 3));
          const fr = 0.4 + 0.1 * (kk % 3);
          const C = {x: T0.x + dx * fr + (-dy / len) * bend, y: T0.y + dy * fr + (dx / len) * bend};
          const X = (1 - e) * (1 - e) * T0.x + 2 * (1 - e) * e * C.x + e * e * T1.x;
          const Y = (1 - e) * (1 - e) * T0.y + 2 * (1 - e) * e * C.y + e * e * T1.y;
          tx = X - q.cx;
          ty = Y - q.cy;
          const sc = 1 - 0.94 * Math.pow(u, 1.4);
          const v = ramp(u, 0.82, 1);
          sx = sc * (1 + 0.45 * v);
          sy = sc * (1 - 0.4 * v);
          rot = q.rot + (b.i % 2 ? 14 : -14) * u;
          alpha = 1 - ramp(u, 0.94, 1);
        }
        if (alpha <= 0.002) return null;
        return (
          <div key={b.i} style={{position: 'absolute', left: q.left, top: q.bottom - b.h, width: b.w, height: b.h, opacity: alpha, transformOrigin: 'center', transform: `translate(${tx}px, ${ty}px) rotate(${rot}deg) scale(${sx}, ${sy})`, background: out ? '#D9FDD3' : '#FFFFFF', color: '#111B21', borderRadius: 30, borderTopLeftRadius: out ? 30 : 8, borderTopRightRadius: out ? 8 : 30, boxShadow: '0 14px 34px rgba(0,0,0,0.45)', fontFamily: sans, fontWeight: 500, fontSize: FONT, lineHeight: '48px', letterSpacing: '-0.01em', padding: '12px 30px 0', boxSizing: 'border-box'}}>
            {b.text}
            <div style={{position: 'absolute', right: 30, bottom: 8, fontSize: 21, lineHeight: '24px', color: out ? '#4E8F6A' : '#8696A0', fontWeight: 500}}>
              {`${9 + Math.floor(b.i / 5)}:${String(12 + b.i * 3).padStart(2, '0')}${out ? '  ✓✓' : ''}`}
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

const Counter: React.FC<{m: Model; s: S; f: number; icon: {text: string; color: string; textColor: string}}> = ({m, s, f, icon}) => {
  const {sans} = useFonts();
  const cn = m.chat!.counter;
  const k = clamp01(f / s.ref);
  const cnt = (g: number) => Math.round(cn.start + cn.rise * Math.pow(Math.min(g, s.flyAt) / s.ref, 1.5));
  const n0 = cnt(f);
  const last0 = Math.round(cn.start + cn.rise * Math.pow(clamp01((Math.min(f, s.flyAt) - 1) / s.ref), 1.5));
  const arrived = s.arrivals.filter((a) => a <= f).length;
  const n = f < s.flyAt ? n0 : Math.round(lerp(n0, cn.cap, arrived / s.arrivals.length));
  const bump0 = f < s.flyAt && n0 !== last0 ? 1 : 0;
  const hit = Math.min(1, s.arrivals.reduce((acc, a) => acc + (f >= a ? Math.max(0, 1 - (f - a) / 5) : 0), 0));
  const buzz = Math.sin(f * 2.1) * (2 + 3 * k) * (1 - ramp(f, s.flyAt - 4, s.flyAt + 2));
  const glide = easeInOut(ramp(f, s.glide[0], s.glide[1]));
  const mm = easeInOut(ramp(f, s.morph, s.morph + 4));
  const dip = 1 - 0.16 * Math.sin(Math.PI * ramp(f, s.morph - 1, s.morph + 5));
  const base = lerp(1.3 + 0.1 * bump0, ICON_FRAME_PX / 84, glide) * dip;
  const cy = s.iconCy(f);
  const lastA = Math.max(...s.arrivals);
  const badgeS = 1 - easeInOut(ramp(f, s.morph - 1, s.morph + 2));
  const done = f >= lastA ? 1 + 0.35 * Math.exp(-(f - lastA) / 2.5) * Math.cos((f - lastA) * 1.1) : 1;
  const warm = easeInOut(ramp(f, s.E - 1, s.iEnd - 1));
  const night = m.spec.brand.colors.night;
  return (
    <div style={{position: 'absolute', left: W / 2 - 42, top: cy - 42, width: 84, height: 84, transform: `translateX(${buzz}px) scale(${base * (1 + 0.07 * hit)}, ${base * (1 - 0.09 * hit)})`, transformOrigin: '50% 50%'}}>
      <div style={{position: 'absolute', inset: 0, borderRadius: lerp(24, 18.8, mm), overflow: 'hidden', boxShadow: warm > 0.3 ? '0 6px 18px rgba(90,50,10,0.35)' : '0 10px 30px rgba(0,0,0,0.4)'}}>
        <div style={{position: 'absolute', inset: 0, background: 'linear-gradient(160deg,#3CD26F,#1FA855)', opacity: 1 - mm, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
          <svg width="46" height="46" viewBox="0 0 24 24" fill="#fff"><path d="M12 3C7 3 3 6.800 3 11.500c0 2.100.8 4 2.100 5.500L4 21l4.300-1.300c1.100.5 2.300.8 3.700.8 5 0 9-3.800 9-8.500S17 3 12 3z" /></svg>
        </div>
        <AppIconFace icon={icon} opacity={mm} />
      </div>
      {badgeS > 0.01 && (
        <div style={{position: 'absolute', top: -16, right: -26 - (n >= 10 ? 8 : 0) - (n >= cn.cap ? 12 : 0), transform: `scale(${badgeS * (1 + 0.12 * hit) * done})`, minWidth: 52, height: 52, padding: '0 12px', boxSizing: 'border-box', borderRadius: 26, background: '#FF3B30', color: '#fff', fontFamily: sans, fontWeight: 800, fontSize: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(255,59,48,0.55)', border: `3px solid ${night}`}}>{n >= cn.cap && arrived === s.arrivals.length ? `${cn.cap}+` : n}</div>
      )}
    </div>
  );
};

const NightBg: React.FC<{f: number; night: string}> = ({f, night}) => (
  <AbsoluteFill style={{background: `linear-gradient(180deg, ${mix(night, '#000000', 0.42)} 0%, ${night} 55%, ${mix(night, '#ffffff', 0.03)} 100%)`}}>
    <AbsoluteFill style={{background: 'radial-gradient(ellipse 80% 40% at 50% 85%, rgba(40,110,160,0.35), rgba(40,110,160,0) 70%)'}} />
    <AbsoluteFill style={{background: 'radial-gradient(ellipse 60% 30% at 20% 10%, rgba(70,110,170,0.22), rgba(70,110,170,0) 70%)'}} />
    <AbsoluteFill style={{backgroundImage: 'radial-gradient(rgba(255,255,255,0.045) 2px, transparent 2px)', backgroundSize: '64px 64px', backgroundPosition: `${f * 0.3}px ${f * 0.5}px`}} />
  </AbsoluteFill>
);

const Shake: React.FC<{f: number; s: S; children: React.ReactNode}> = ({f, s, children}) => {
  const k = Math.pow(clamp01(f / s.ref), 2);
  const amp = (2 + 12 * k) * (1 - ramp(f, s.flyAt - 4, s.flyAt + 6));
  return <AbsoluteFill style={{transform: `translate(${noise2D('sx', f / 2.2, 0) * amp}px, ${noise2D('sy', f / 2.2, 1) * amp}px) rotate(${noise2D('sr', f / 3, 2) * 0.5 * k}deg)`}}>{children}</AbsoluteFill>;
};

/** Warmth grows out of the icon: dark, amber, deep brown, then the paper colour. */
const Bloom: React.FC<{m: Model; s: S; f: number}> = ({m, s, f}) => {
  const bl = (m.chat!.icon.spec as {bloom: {core: string; edge: string}}).bloom;
  const b0 = s.E - 5;
  if (f < b0) return null;
  const g = ramp(f, b0, b0 + 3);
  const R = lerp(140, 2600, Math.pow(ramp(f, b0, s.iEnd), 1.6));
  const cy = s.iconCy(f);
  const t = ramp(f, s.E + 3, s.iEnd - 1);
  const c = m.spec.brand.colors;
  const c0 = mix(bl.core, mix(c.glow, '#FFFFFF', 0.42), t);
  const c1 = mix(bl.edge, c.paper, t);
  return (
    <>
      <AbsoluteFill style={{background: `radial-gradient(circle ${R}px at 50% ${cy}px, ${c0} 0%, ${rgba(c1, 0.95)} 50%, ${rgba(c1, 0)} 100%)`, opacity: g}} />
      <AbsoluteFill style={{background: c.paper, opacity: ramp(f, s.morph + 2, s.iEnd)}} />
    </>
  );
};

export const ChatScene: React.FC<{m: Model; chatTitles: {spec: TitleSpec; inAt: number; outAt?: number}[]}> = ({m, chatTitles}) => {
  const abs = useCurrentFrame();
  const s = React.useMemo(() => setup(m), [m]);
  const f = abs - s.t0;
  const flying = f >= s.flyAt;
  const ispec = m.chat!.icon.spec as {text?: string; color?: string};
  const bi = m.spec.brand.icon;
  const icon = {text: ispec.text ?? bi.text, color: ispec.color ?? bi.color, textColor: bi.textColor};
  return (
    <AbsoluteFill>
      <NightBg f={f} night={m.spec.brand.colors.night} />
      <Bloom m={m} s={s} f={f} />
      <Shake f={f} s={s}>
        {flying ? (
          <>
            <BubbleField m={m} s={s} f={f} layer="static" />
            <MotionBlur shutterAngle={110} samples={4}>
              <BubbleField m={m} s={s} f={f} layer="fly" />
            </MotionBlur>
          </>
        ) : (
          <BubbleField m={m} s={s} f={f} />
        )}
        <Counter m={m} s={s} f={f} icon={icon} />
        {chatTitles.map((t, i) => (
          <Title key={i} spec={t.spec} inAt={t.inAt} outAt={t.outAt} color={t.spec.color ?? '#FFFFFF'} accent={t.spec.accent ?? '#5BE08A'} />
        ))}
      </Shake>
    </AbsoluteFill>
  );
};

