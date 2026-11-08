import React from 'react';
import {AbsoluteFill, Img, useCurrentFrame} from 'remotion';
import {noise2D} from '@remotion/noise';
import {mix, rgba} from './anim';
import {GRAIN} from './Finish';
import {gradientLayers} from './gradient';
import type {Background} from '../../spec/schema';
import {url} from './url';

/** Backdrop: a soft gradient of drifting colour blobs with film grain (`bg` tunes colours, drift and grain), plus an optional photo. */
export const Backdrop: React.FC<{bg: Background; base: string; light: string; blob: string; par?: {x: number; y: number; scale: number}; photo?: string; photoOpacity?: number}> = ({bg, base, light, blob, par = {x: 0, y: 0, scale: 1}, photo, photoOpacity = 0.5}) => {
  const f = useCurrentFrame();
  const gradient = bg.gradient ?? [base, light, mix(blob, base, 0.45), mix(base, blob, 0.2)];
  const g = gradientLayers({gradient, drift: bg.drift, grain: bg.grain}, f);
  return (
    <AbsoluteFill style={{background: gradient[0]}}>
      {photo && photoOpacity > 0 && (
        <AbsoluteFill style={{overflow: 'hidden'}}>
          <Img src={url(photo)} style={{position: 'absolute', left: -270 + par.x, top: -480 + par.y, width: 1620, height: 2880, objectFit: 'cover', transform: `scale(${par.scale}) translate(${noise2D('px', f / 200, 0) * 20}px, 0)`, opacity: photoOpacity, mixBlendMode: 'multiply'}} />
        </AbsoluteFill>
      )}
      {g.blobs.slice(1).map((b, i) => (
        <div key={i} style={{position: 'absolute', left: b.x - b.r, top: b.y - b.r, width: b.r * 2, height: b.r * 2, borderRadius: '50%', background: `radial-gradient(closest-side, ${b.color}, ${rgba(b.color, 0)})`}} />
      ))}
      {g.grain && <AbsoluteFill style={{backgroundImage: GRAIN, backgroundSize: '256px 256px', backgroundPosition: `${g.grain.x}px ${g.grain.y}px`, opacity: g.grain.opacity, mixBlendMode: 'overlay'}} />}
    </AbsoluteFill>
  );
};
