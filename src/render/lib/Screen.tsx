import React, {useState} from 'react';
import {useFonts} from './fonts';
import {SafeImg} from './SafeImg';
import {rgba, ramp} from './anim';
import {useColors} from './colors';
import {INSET, SCREEN_H, SCREEN_W, type Box, type ColorReq, type Layer, type Model, type Ref} from '../model';

export const colorOf = (colors: Record<string, string>, c: string | ColorReq, fallback: string) => (typeof c === 'string' ? c : colors[c.id] ?? fallback);

const imgOf = (m: Model, ref: Ref) => {
  const i = m.manifest.sets[ref.set]?.screens[ref.name];
  return i ? {src: m.imageUrl(i.fullFile || i.file), file: m.imageUrl(i.file), h: i.fullFile ? i.fullHeight : SCREEN_H} : undefined;
};

/** The full captured page inside the phone, scrolled by `scroll`. A pinned copy of the top `sticky` px keeps the header in place. */
export const Screen: React.FC<{m: Model; layer: Layer; f: number; scroll: number; children?: React.ReactNode}> = ({m, layer, f, scroll, children}) => {
  const {sans} = useFonts();
  const colors = useColors();
  const t = m.themeOf(layer.ref.set);
  const bg = colorOf(colors, layer.bg, t.bg);
  const im = imgOf(m, layer.ref);
  const [failed, setFailed] = useState(false);
  const h = im?.h ?? SCREEN_H;
  return (
    <div style={{position: 'absolute', inset: 0, overflow: 'hidden', background: bg}}>
      <div style={{position: 'absolute', left: 0, top: 0, width: SCREEN_W, height: h, transform: `translateY(${INSET - scroll}px)`}}>
        {im && !failed ? <SafeImg src={im.src} style={{width: SCREEN_W, height: h}} onFail={() => setFailed(true)} /> : null}
        {layer.holes.map((hl, i) => {
          const op = hl.opacity(f);
          return op > 0 ? (
            <div key={i} style={{position: 'absolute', left: hl.box.x - 2, top: hl.box.y - 2, width: hl.box.w + 4, height: hl.box.h + 4, background: colorOf(colors, hl.color, bg), opacity: op, borderRadius: hl.radius}} />
          ) : null;
        })}
        {children}
      </div>
      <div style={{position: 'absolute', left: 0, top: 0, width: SCREEN_W, height: INSET, background: bg, zIndex: 5, fontFamily: sans, color: t.fg}}>
        <div style={{position: 'absolute', left: 36, top: 14, fontWeight: 700, fontSize: 16, letterSpacing: -0.2}}>9:41</div>
        <svg style={{position: 'absolute', right: 30, top: 16}} width="64" height="14" viewBox="0 0 64 14" fill={t.fg}>
          <rect x="0" y="9" width="3" height="5" rx="1" /><rect x="5" y="6" width="3" height="8" rx="1" /><rect x="10" y="3" width="3" height="11" rx="1" /><rect x="15" y="0" width="3" height="14" rx="1" />
          <rect x="26" y="1" width="30" height="13" rx="4" fill="none" stroke={t.fg} strokeWidth="1.2" opacity="0.5" /><rect x="28" y="3" width="22" height="9" rx="2.5" /><rect x="58" y="5" width="2" height="5" rx="1" opacity="0.5" />
        </svg>
      </div>
      {layer.sticky > 0 && scroll > 0 && im && !failed ? (
        <div style={{position: 'absolute', left: 0, top: INSET, width: SCREEN_W, height: layer.sticky, overflow: 'hidden', opacity: ramp(scroll, 0, 30), boxShadow: `0 6px 18px ${rgba(t.fg, 0.1)}`}}>
          <SafeImg src={im.file} style={{width: SCREEN_W, height: SCREEN_H}} />
        </div>
      ) : null}
    </div>
  );
};

/** One element cropped out of the full page and drawn at the exact same place, so it can pop out of the screen. */
export const Lift: React.FC<{
  m: Model; layer: Layer; box: Box; scroll?: number; dx?: number; dy?: number; dz?: number; scale?: number; rotate?: number; lift?: number; opacity?: number; radius?: number; extraStyle?: React.CSSProperties; fixed?: boolean;
}> = ({m, layer, box: b, scroll = 0, dx = 0, dy = 0, dz = 0, scale = 1, rotate = 0, lift = 0, opacity = 1, radius = 18, extraStyle}) => {
  const colors = useColors();
  const im = imgOf(m, layer.ref);
  const [failed, setFailed] = useState(false);
  const t = m.themeOf(layer.ref.set);
  const bg = colorOf(colors, layer.bg, t.bg);
  return (
    <div
      style={{
        position: 'absolute', left: b.x, top: b.y - scroll + INSET, width: b.w, height: b.h, opacity, transformOrigin: '50% 50%',
        transform: `translate3d(${dx}px, ${dy}px, ${dz}px) rotate(${rotate}deg) scale(${scale})`,
        borderRadius: radius, overflow: 'hidden', background: bg,
        boxShadow: `0 ${6 + 26 * lift}px ${14 + 40 * lift}px ${rgba('#2a1a05', 0.1 + 0.28 * lift)}, 0 0 0 ${lift > 0 ? 1 : 0}px ${rgba('#ffffff', 0.5)}`,
        ...extraStyle,
      }}
    >
      {im && !failed ? <SafeImg src={im.src} onFail={() => setFailed(true)} style={{position: 'absolute', left: -b.x, top: -b.y, width: SCREEN_W, height: im.h, maxWidth: 'none'}} /> : null}
    </div>
  );
};
