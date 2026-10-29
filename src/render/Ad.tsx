import React, {useMemo} from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {DraftCtx, MotionBlur} from './lib/Blur';
import {buildModel, type Model} from './model';
import type {RenderProps} from './types';
import {ColorsProvider} from './lib/colors';
import {FontsCtx, loadBrandFonts} from './lib/fonts';
import {Finish} from './lib/Finish';
import {Backdrop} from './lib/Backdrop';
import {parallax} from './lib/Camera';
import {Title} from './lib/Title';
import {mix, ramp, rgba, spr, SNAP} from './lib/anim';
import {camera} from './choreo';
import {ChatScene} from './blocks/Chat';
import {Stage, layerVisible} from './blocks/Stage';
import {EndLockup, EndRing} from './blocks/EndCard';

const blockAt = (m: Model, f: number) => m.plan.blocks.find((b) => f >= b.start && f < b.end) ?? m.plan.blocks[m.plan.blocks.length - 1];

const SceneBackdrop: React.FC<{m: Model}> = ({m}) => {
  const f = useCurrentFrame();
  const c = m.spec.brand.colors;
  const b = blockAt(m, f);
  const cam = camera(m, f);
  const vis = m.layers.filter((l) => layerVisible(l, f));
  const cur = vis[vis.length - 1] ?? m.layers[0];
  const accent = cur ? m.themeOf(cur.ref.set).accent : m.mainTheme.accent;
  const photo = m.photo;
  const par = b.kind === 'endCard' ? undefined : parallax(cam);
  switch (b.kind) {
    case 'reveal':
    case 'tapFlow':
      return <Backdrop base={c.paper} light={c.glow} blob={accent} par={par} photo={photo} />;
    case 'notification':
    case 'statCountUp':
      return <Backdrop base={mix(c.paper, c.paperDeep, 0.5)} light={c.glow} blob={accent} par={par} photo={photo} />;
    case 'skins': {
      const sk = m.skins.find((s) => s.block === b)!;
      let idx = 0;
      sk.swaps.forEach((sf, i) => {
        if (f >= sf) idx = i;
      });
      const cur2 = sk.variants[idx];
      const prev = sk.variants[Math.max(0, idx - 1)];
      const k = idx === 0 ? 1 : spr(f, sk.swaps[idx], SNAP);
      const a = mix(prev.theme.accent, cur2.theme.accent, k);
      const base = mix(mix(prev.theme.accent, c.paper, 0.5), mix(cur2.theme.accent, c.paper, 0.5), k);
      const light = mix(mix(prev.theme.bg, '#FFFFFF', 0.5), mix(cur2.theme.bg, '#FFFFFF', 0.5), k);
      const ring = ramp(f, sk.swaps[idx], sk.swaps[idx] + 14);
      return (
        <>
          <Backdrop base={base} light={light} blob={a} blobOpacity={0.45} par={par} photo={photo} />
          <AbsoluteFill>
            <div style={{position: 'absolute', left: 540 - 520 * ring, top: 1210 - 520 * ring, width: 1040 * ring, height: 1040 * ring, borderRadius: '50%', border: `${6 * (1 - ring)}px solid ${rgba('#FFFFFF', 0.8 * (1 - ring))}`}} />
          </AbsoluteFill>
        </>
      );
    }
    case 'endCard':
      return (
        <>
          <Backdrop base={mix(c.paper, c.paperDeep, 0.35)} light={c.glow} blob={accent} photo={photo} photoOpacity={0.55} />
          <EndRing m={m} />
        </>
      );
    default:
      return <Backdrop base={c.paper} light={c.glow} blob={accent} par={par} photo={photo} />;
  }
};

const Titles: React.FC<{m: Model}> = ({m}) => {
  const f = useCurrentFrame();
  const c = m.spec.brand.colors;
  return (
    <>
      {m.plan.titles.map((t, i) => {
        const blk = m.plan.blocks.find((b) => b.id === t.block)!;
        if (blk.kind === 'chatChaos') return null;
        const outAt = t.outAt ?? (t.until >= m.plan.total ? 99999 : t.until);
        if (f < t.inAt - 1 || f > outAt + 12) return null;
        const vis = m.layers.filter((l) => layerVisible(l, t.inAt));
        const cur = vis[vis.length - 1] ?? m.layers[0];
        const themeAccent = cur ? m.themeOf(cur.ref.set).accent : c.accent;
        let color = t.spec.color ?? c.ink;
        let accent = t.spec.accent ?? themeAccent;
        let scrim = t.spec.scrim === true ? c.paper : t.spec.scrim === false ? undefined : t.spec.scrim;
        if (blk.kind === 'skins') {
          const sk = m.skins.find((s) => s.block === blk)!;
          let idx = 0;
          sk.swaps.forEach((sf, k) => {
            if (f >= sf) idx = k;
          });
          const cu = sk.variants[idx].theme;
          const pr = sk.variants[Math.max(0, idx - 1)].theme;
          const k = idx === 0 ? 1 : spr(f, sk.swaps[idx], SNAP);
          if (!t.spec.color) color = mix(pr.fg, cu.fg, k);
          if (!t.spec.accent) accent = mix(pr.accent, cu.accent, k);
          if (scrim) {
            const base = mix(mix(pr.accent, c.paper, 0.5), mix(cu.accent, c.paper, 0.5), k);
            scrim = mix(base, '#FFFFFF', 0.25);
          }
        }
        return <Title key={i} spec={t.spec} inAt={t.inAt} outAt={outAt === 99999 ? undefined : outAt} color={color} accent={accent} scrim={scrim} />;
      })}
    </>
  );
};

const PhoneScene: React.FC<{m: Model}> = ({m}) => {
  const f = useCurrentFrame();
  const inEnd = !!m.end && f >= m.end.start;
  const rv = m.reveal!;
  const blurStage = f < rv.start + Math.round(16 * (m.bf / 15));
  const stage = <Stage m={m} flat={inEnd} />;
  return (
    <AbsoluteFill>
      <SceneBackdrop m={m} />
      {blurStage ? (
        <MotionBlur shutterAngle={200} samples={6}>
          {stage}
        </MotionBlur>
      ) : (
        stage
      )}
      <Titles m={m} />
      {inEnd && <EndLockup m={m} />}
    </AbsoluteFill>
  );
};

export const Ad: React.FC<RenderProps> = (props) => {
  const m = useMemo(() => buildModel(props), [props]);
  const fonts = useMemo(() => loadBrandFonts(props.spec.brand.fonts), [props.spec.brand.fonts]);
  const f = useCurrentFrame();
  const chatEnd = m.chat ? m.chat.icon.end : 0;
  const k = m.bf / 15;
  const inWhip = m.whips.some((w) => f >= w.out - Math.round(6 * k) && f < w.spin + Math.round(22 * k));
  const chatTitles = m.chat ? m.plan.titles.filter((t) => t.block === m.chat!.block.id).map((t) => ({spec: t.spec, inAt: t.inAt, outAt: t.outAt})) : [];
  const showChat = !!m.chat && f < chatEnd;
  return (
    <DraftCtx.Provider value={!!props.draft}>
    <FontsCtx.Provider value={fonts}>
      <ColorsProvider model={m}>
        <AbsoluteFill style={{background: '#000'}}>
          {showChat ? (
            <ChatLocal m={m} titles={chatTitles} />
          ) : m.reveal ? (
            inWhip ? (
              <MotionBlur shutterAngle={240} samples={7}>
                <PhoneScene m={m} />
              </MotionBlur>
            ) : (
              <PhoneScene m={m} />
            )
          ) : null}
          <Finish />
        </AbsoluteFill>
      </ColorsProvider>
    </FontsCtx.Provider>
    </DraftCtx.Provider>
  );
};

/** The chat scene reads absolute frames (its block start is subtracted inside), titles are given relative to the block. */
const ChatLocal: React.FC<{m: Model; titles: {spec: any; inAt: number; outAt?: number}[]}> = ({m, titles}) => <ChatScene m={m} chatTitles={titles} />;
