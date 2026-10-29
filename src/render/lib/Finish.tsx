import React from 'react';
import {AbsoluteFill, random, useCurrentFrame} from 'remotion';

const GRAIN = `url("data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>',
)}")`;

/** Film finish on top of everything: warm light, moving grain, vignette. */
export const Finish: React.FC<{dark?: number}> = ({dark = 0}) => {
  const f = useCurrentFrame();
  const gx = Math.floor(random(`gx${f}`) * 256);
  const gy = Math.floor(random(`gy${f}`) * 256);
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <AbsoluteFill style={{background: 'radial-gradient(ellipse 80% 55% at 22% 12%, rgba(255,210,140,0.34), rgba(255,210,140,0) 70%)', mixBlendMode: 'soft-light', opacity: 1 - dark * 0.6}} />
      <AbsoluteFill style={{background: 'radial-gradient(ellipse 70% 50% at 90% 100%, rgba(255,170,90,0.18), rgba(255,170,90,0) 70%)', mixBlendMode: 'soft-light'}} />
      <AbsoluteFill style={{backgroundImage: GRAIN, backgroundSize: '256px 256px', backgroundPosition: `${gx}px ${gy}px`, opacity: 0.2, mixBlendMode: 'overlay'}} />
      <AbsoluteFill style={{background: 'radial-gradient(ellipse 75% 70% at 50% 50%, rgba(0,0,0,0) 55%, rgba(40,20,0,0.30) 100%)'}} />
    </AbsoluteFill>
  );
};
