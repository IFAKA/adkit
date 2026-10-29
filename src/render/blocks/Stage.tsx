import React from 'react';
import {useCurrentFrame} from 'remotion';
import {Camera} from '../lib/Camera';
import {Phone} from '../lib/Phone';
import {Lift, Screen, colorOf} from '../lib/Screen';
import {INSET} from '../model';
import {Check, CartBadge, Highlight, Tap} from '../lib/Ui';
import {AppIconFace} from '../lib/AppIcon';
import {useColors} from '../lib/colors';
import {useFonts} from '../lib/fonts';
import {BOUNCY, SNAP, SOFT, clamp01, lerp, ramp, rgba, spr, track} from '../lib/anim';
import {ICON_FRAME_CY, ICON_FRAME_PX, camera, openSpring, phonePose} from '../choreo';
import type {Box, Layer, LiftItem, Model, Notif} from '../model';

const SLIDE = {damping: 24, stiffness: 190, mass: 0.9};

const onTop = (l: Layer, f: number) => f >= l.at - 1 && f < l.next;
export const layerVisible = (l: Layer, f: number) => f >= l.at - 1 && f < l.next + (l.nextSlides ? 20 : 0);
const targetScroll = (l: Layer, f: number) => {
  let v = l.scroll[0][1];
  for (const k of l.scroll) if (k[0] <= f) v = k[1];
  return v;
};
const fmt = (n: number, decimals: number, thousands: string) => {
  const [i, d] = n.toFixed(decimals).split('.');
  return i.replace(/\B(?=(\d{3})+(?!\d))/g, thousands) + (d ? `.${d}` : '');
};

/** The app icon at the moment it opens: it grows into the phone shape, then fades to show the real phone. */
const OpenIcon: React.FC<{m: Model; f: number; zoom: number; qy: number; pose: ReturnType<typeof phonePose>}> = ({m, f, zoom, qy, pose}) => {
  const at = m.reveal!.start;
  const open = openSpring(f, at);
  const e = clamp01(open);
  const w = lerp(ICON_FRAME_PX, 414 * pose.s * zoom, open);
  const h = lerp(ICON_FRAME_PX, 868 * pose.s * zoom, open);
  const cx = 540 + pose.x * zoom;
  const cy = lerp(ICON_FRAME_CY, qy + (pose.y - 270) * zoom, open);
  const r = lerp(0.224 * ICON_FRAME_PX, 62 * pose.s * zoom, e);
  const fade = 1 - ramp(e, 0.72, 0.96);
  if (f < at || fade <= 0.001) return null;
  const k = w / ICON_FRAME_PX;
  const bi = m.spec.brand.icon;
  return (
    <div style={{position: 'absolute', left: cx - w / 2, top: cy - h / 2, width: w, height: h, borderRadius: r, overflow: 'hidden', opacity: fade, boxShadow: '0 8px 24px rgba(90,50,10,0.35)'}}>
      <AppIconFace icon={{text: bi.text, color: bi.color, textColor: bi.textColor}} mono={(ICON_FRAME_PX / 84) * Math.min(k, 3.2)} textOpacity={1 - ramp(e, 0.45, 0.8)} />
    </div>
  );
};

/** The product card pops out of the screen, then flies into the cart. Reads its own frame so motion blur works. */
const CardLift: React.FC<{m: Model; item: LiftItem}> = ({m, item}) => {
  const f = useCurrentFrame();
  const scroll = track(f, item.layer.scroll, SOFT);
  const card = item.card;
  const cardC = {x: card.x + card.w / 2, y: card.y - scroll + INSET + card.h / 2};
  const to = item.to ?? cardC;
  const pop = spr(f, item.liftAt, {damping: 12, stiffness: 200, mass: 0.7});
  const u = item.flyAt === undefined ? 0 : clamp01(spr(f, item.flyAt, {damping: 24, stiffness: 70, mass: 1}));
  const hover = Math.sin((f - item.liftAt) / 5) * 2.5 * (1 - u);
  const arc = Math.sin(Math.PI * u);
  const press = item.tapAt !== undefined && f >= item.tapAt && f < item.tapAt + 10 ? 0.97 : 1;
  return (
    <Lift
      m={m} layer={item.layer} box={card} scroll={scroll}
      lift={pop * (1 - u * 0.6)}
      scale={(1 + 0.07 * pop) * press * lerp(1, 0.1, Math.pow(u, 1.4))}
      dx={(to.x - cardC.x) * u - 30 * arc}
      dy={(to.y - cardC.y) * u + hover - 110 * arc}
      dz={50 * pop * (1 - u)}
      rotate={-6 * arc + 1.2 * pop * (1 - u)}
      opacity={u > 0.82 ? 1 - ramp(u, 0.82, 0.97) : 1}
      radius={20}
    />
  );
};

const Banner: React.FC<{n: Notif; f: number; color: string}> = ({n, f, color}) => {
  const {sans} = useFonts();
  const inP = spr(f, n.slideAt, {damping: 14, stiffness: 160, mass: 0.8});
  const outP = spr(f, n.slideAt + 32, SNAP);
  if (f < n.slideAt || outP > 0.98) return null;
  return (
    <div style={{position: 'absolute', left: 14, top: 54, width: 362, height: 76, borderRadius: 24, background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(14px)', boxShadow: '0 14px 34px rgba(0,0,0,0.28)', display: 'flex', alignItems: 'center', gap: 12, padding: '0 14px', fontFamily: sans, transform: `translateY(${(1 - inP) * -150 - outP * 150}px) scale(${lerp(0.92, 1, inP)})`}}>
      <div style={{width: 46, height: 46, borderRadius: 12, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 7h13l-1.5 8H8z" /><path d="M6 7L5 4H3" /><circle cx="9" cy="19" r="1.2" /><circle cx="16" cy="19" r="1.2" /></svg>
      </div>
      <div style={{flex: 1}}>
        <div style={{fontWeight: 700, fontSize: 16, color: '#1b1b1b'}}>{n.banner.title}</div>
        <div style={{fontWeight: 500, fontSize: 14, color: '#555'}}>{n.banner.body}</div>
      </div>
      <div style={{fontSize: 12, color: '#888', fontWeight: 500}}>{n.banner.time}</div>
    </div>
  );
};

const LayerView: React.FC<{m: Model; l: Layer; f: number}> = ({m, l, f}) => {
  const colors = useColors();
  const {sans} = useFonts();
  const t = m.themeOf(l.ref.set);
  const scroll = track(f, l.scroll, SOFT);
  const inP = l.slide ? clamp01(spr(f, l.at, SLIDE)) : 1;
  const outP = l.nextSlides ? clamp01(spr(f, l.next, SLIDE)) : 0;
  const c = l.count;
  const cp = c ? clamp01(ramp(f, c.startAt, c.doneAt)) : 0;
  return (
    <div style={{position: 'absolute', inset: 0, zIndex: l.index + 1, transform: `translateX(${(1 - inP) * 390 - outP * 110}px)`, boxShadow: inP < 1 ? '-20px 0 40px rgba(0,0,0,0.2)' : undefined}}>
      <Screen m={m} layer={l} f={f} scroll={scroll}>
        {l.highlights.map((h, i) => <Highlight key={`h${i}`} f={f} at={h.at} box={h.box} color={t.accent} radius={h.radius} />)}
        {c && f >= l.at + 4 && f < c.doneAt && (
          <div style={{position: 'absolute', left: c.box.x, top: c.box.y, width: c.box.w, height: c.box.h, fontFamily: sans, fontWeight: c.weight, fontSize: c.fontSize, lineHeight: `${c.box.h}px`, letterSpacing: '-0.03em', color: c.color ?? m.spec.brand.colors.ink, fontVariantNumeric: 'tabular-nums'}}>
            {c.prefix}{fmt(c.from + (c.to - c.from) * (1 - Math.pow(1 - cp, 3)), c.decimals, c.thousands)}{c.suffix}
          </div>
        )}
        {l.ring && f >= l.ring.at && f < l.ring.at + 22 && (
          <div style={{position: 'absolute', left: l.ring.box.x - 3, top: l.ring.box.y - 3, width: l.ring.box.w + 6, height: l.ring.box.h + 6, borderRadius: 27, border: `3px solid ${t.accent}`, opacity: 1 - ramp(f, l.ring.at, l.ring.at + 22), transform: `scale(${1 + 0.05 * ramp(f, l.ring.at, l.ring.at + 22)})`}} />
        )}
      </Screen>
      {l.bars && <BarStrips m={m} l={l} f={f} scroll={scroll} color={colorOf(colors, l.bars.color, t.bg)} />}
      {l.press.map((p, i) =>
        f >= p.at - 6 && f < p.at + 24 ? (
          <Lift key={`p${i}`} m={m} layer={l} box={p.box} scroll={scroll} radius={p.radius} scale={f < p.at ? 1 - 0.06 * ramp(f, p.at - 6, p.at) : 0.94 + 0.06 * spr(f, p.at, {damping: 8, stiffness: 220, mass: 0.7})} />
        ) : null,
      )}
      {l.check && f >= l.check.at && <div style={{position: 'absolute', inset: 0, background: `rgba(255,255,255,${0.7 * clamp01(spr(f, l.check.at, SNAP))})`, backdropFilter: 'blur(6px)'}} />}
      {l.check && <Check f={f} at={l.check.at} color={t.accent} size={l.check.size} fadeAt={l.check.fadeAt} />}
      {outP > 0 && <div style={{position: 'absolute', inset: 0, background: `rgba(0,0,0,${0.25 * outP})`}} />}
    </div>
  );
};

/** Each vertical strip of the bar chart is wiped upward from the baseline, with a small stagger. */
const BarStrips: React.FC<{m: Model; l: Layer; f: number; scroll: number; color: string}> = ({m, l, f, scroll, color}) => {
  const bars = l.bars!;
  const N = 15;
  const sw = bars.hole.w / N;
  if (f < bars.at) return null;
  return (
    <>
      {Array.from({length: N}).map((_, i) => {
        const g = clamp01(spr(f, bars.at + i * 1.5, {damping: 18, stiffness: 90, mass: 0.8}));
        return <Lift key={i} m={m} layer={l} scroll={scroll} box={{x: bars.hole.x + i * sw, y: bars.hole.y, w: sw + 0.6, h: bars.hole.h}} radius={0} extraStyle={{clipPath: `inset(${(1 - g) * 100}% 0 0 0)`, background: color}} />;
      })}
    </>
  );
};

/** Phone, camera and the on-screen overlays. Reads its own frame so a motion-blur wrapper can shift it. */
export const Stage: React.FC<{m: Model; flat?: boolean}> = ({m, flat}) => {
  const f = useCurrentFrame();
  const cam = camera(m, f);
  const pose = phonePose(m, f);
  const vis = m.layers.filter((l) => layerVisible(l, f));
  const cur = vis[vis.length - 1] ?? m.layers[0];
  const accent = cur ? m.themeOf(cur.ref.set).accent : m.mainTheme.accent;
  let sheen = 0;
  const gs = m.sheenGroups;
  gs.forEach((g, i) => {
    if (f >= g) sheen = ramp(f, g, gs[i + 1] ?? m.plan.total);
  });
  const nt = m.notifs.find((n) => f >= n.startAt - 1 && f < n.endAt);

  const overlay = (
    <>
      {m.lifts.map((it, i) => {
        if (!onTop(it.layer, f) || f < it.liftAt || f >= it.until) return null;
        const fly = it.flyAt !== undefined && f >= it.flyAt && f < it.until - 6;
        // lazy import avoided: motion blur wrapper is applied by the caller through `CardBlur`
        return fly ? <CardBlur key={i} m={m} item={it} /> : <CardLift key={i} m={m} item={it} />;
      })}
      {m.taps.map((t, i) => {
        if (!onTop(t.layer, f) || f < t.at - 9 || f > t.at + 30) return null;
        const sc = t.fixed ? 0 : targetScroll(t.layer, t.at);
        return <Tap key={`t${i}`} f={f} at={t.at} x={t.box.x + t.box.w * t.xfrac} y={t.box.y - sc + INSET + t.box.h / 2} />;
      })}
      {m.lifts.map((it, i) => {
        if (!it.tapBox || it.tapAt === undefined || !onTop(it.layer, f) || f < it.tapAt - 9 || f > it.tapAt + 30) return null;
        const sc = track(it.tapAt, it.layer.scroll, SOFT);
        const cx = it.card.x + it.card.w / 2;
        const cy = it.card.y + it.card.h / 2;
        const tx = it.tapBox.x + it.tapBox.w / 2;
        const ty = it.tapBox.y + it.tapBox.h / 2;
        const scNow = track(f, it.layer.scroll, SOFT);
        void sc;
        return <Tap key={`lt${i}`} f={f} at={it.tapAt} x={cx + (tx - cx) * 1.07} y={cy + (ty - cy) * 1.07 - scNow + INSET} />;
      })}
      {m.badges.map((b, i) => (onTop(b.layer, f) ? <CartBadge key={`b${i}`} f={f} at={b.at} cx={b.cx} cy={b.cy} color={m.themeOf(b.layer.ref.set).accent} count={b.count} /> : null))}
    </>
  );
  const clipOverlay = nt ? (
    <>
      {f >= nt.slideAt && (() => {
        const slideIn = spr(f, nt.slideAt + 1, {damping: 15, stiffness: 150, mass: 0.8});
        const land = spr(f, nt.landAt, BOUNCY);
        const b: Box = nt.box;
        return (
          <div style={{position: 'absolute', inset: 0}}>
            <Lift m={m} layer={nt.layer} box={b} dy={(1 - slideIn) * -(b.y + b.h + 40)} scale={1 + 0.04 * (1 - clamp01(land)) + 0.02 * Math.sin(land * 3)} lift={0.5 * (1 - clamp01(ramp(f, nt.landAt + 6, nt.landAt + 24)))} opacity={clamp01(slideIn * 3)} radius={24} />
            {f >= nt.landAt && <div style={{position: 'absolute', left: b.x - 3, top: b.y - 3 + INSET, width: b.w + 6, height: b.h + 6, borderRadius: 27, border: `3px solid ${accent}`, opacity: 1 - ramp(f, nt.landAt, nt.landAt + 22), transform: `scale(${1 + 0.06 * ramp(f, nt.landAt, nt.landAt + 22)})`}} />}
          </div>
        );
      })()}
      <Banner n={nt} f={f} color={accent} />
    </>
  ) : undefined;

  const phone = <Phone pose={pose} sheen={sheen} screen={<>{vis.map((l) => <LayerView key={l.index} m={m} l={l} f={f} />)}</>} overlay={overlay} clipOverlay={clipOverlay} />;
  if (flat) return <div style={{position: 'absolute', inset: 0, perspective: 2600}}>{phone}</div>;
  return (
    <>
      <Camera cam={cam}>{phone}</Camera>
      {m.openFromIcon && m.reveal && f >= m.reveal.start && f < m.reveal.start + 40 && <OpenIcon m={m} f={f} zoom={cam.zoom} qy={cam.qy} pose={pose} />}
    </>
  );
};

import {CameraMotionBlur} from '@remotion/motion-blur';
const CardBlur: React.FC<{m: Model; item: LiftItem}> = ({m, item}) => (
  <CameraMotionBlur shutterAngle={220} samples={6}>
    <CardLift m={m} item={item} />
  </CameraMotionBlur>
);
export {rgba};
