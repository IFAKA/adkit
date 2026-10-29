import React from 'react';
import {W, H, SCREEN_W, SCREEN_H} from '../model';
import type {Pose} from '../choreo';

export type {Pose};

const BODY_W = SCREEN_W + 24; // 414
const BODY_H = SCREEN_H + 24; // 868
export const PHONE_H = BODY_H;

const TITANIUM = 'linear-gradient(135deg, #b9b6b0 0%, #6f6d6a 18%, #d9d6cf 38%, #8b8985 55%, #c8c5be 78%, #77746f 100%)';

/**
 * iPhone-style device. Origin of the pose is the stage centre; units inside are screen CSS px.
 * `screen` is clipped to the display; `overlay` shares the screen's coordinates but is not clipped
 * (cards that pop out, taps); `clipOverlay` is clipped (notification banners).
 */
export const Phone: React.FC<{
  pose: Pose;
  screen: React.ReactNode;
  overlay?: React.ReactNode;
  clipOverlay?: React.ReactNode;
  shadow?: number;
  sheen?: number;
}> = ({pose, screen, overlay, clipOverlay, shadow = 1, sheen = 0}) => {
  const {x, y, z, rx, ry, rz, s} = pose;
  const left = W / 2 - BODY_W / 2;
  const top = H / 2 - BODY_H / 2;
  const flat = Math.abs(Math.cos((ry * Math.PI) / 180));
  return (
    <>
      {/* floor shadow */}
      <div
        style={{
          position: 'absolute',
          left: W / 2 + x - (BODY_W * s * 0.95) / 2,
          top: H / 2 + y + (BODY_H * s) / 2 + 18 * s,
          width: BODY_W * s * 0.95,
          height: 70 * s,
          borderRadius: '50%',
          background: 'radial-gradient(closest-side, rgba(40,24,6,0.55), rgba(40,24,6,0))',
          filter: `blur(${10 * s}px)`,
          opacity: shadow * (0.35 + 0.65 * flat) * 0.8,
          transform: `scaleX(${0.5 + 0.5 * flat})`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left,
          top,
          width: BODY_W,
          height: BODY_H,
          transformStyle: 'preserve-3d',
          transform: `translate3d(${x}px, ${y}px, ${z}px) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg) scale(${s})`,
        }}
      >
        {/* thickness */}
        {Array.from({length: 8}).map((_, i) => (
          <div key={i} style={{position: 'absolute', inset: 0, borderRadius: 62, background: i % 2 ? '#5a5855' : '#8a8782', transform: `translateZ(${-(i + 1) * 1.1}px)`}} />
        ))}
        {/* back */}
        <div style={{position: 'absolute', inset: 0, borderRadius: 62, background: TITANIUM, transform: 'translateZ(-9px) rotateY(180deg)', backfaceVisibility: 'hidden'}}>
          <div style={{position: 'absolute', left: 26, top: 26, width: 150, height: 150, borderRadius: 40, background: 'linear-gradient(135deg,#d7d4cd,#8b8883)', boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.4)'}}>
            {[[18, 18], [84, 18], [18, 84]].map(([a, b], i) => (
              <div key={i} style={{position: 'absolute', left: a, top: b, width: 48, height: 48, borderRadius: 24, background: 'radial-gradient(#1b2330 35%, #05070b 70%)', boxShadow: '0 0 0 4px #b3b0aa'}} />
            ))}
          </div>
        </div>
        {/* front */}
        <div style={{position: 'absolute', inset: 0, backfaceVisibility: 'hidden', transformStyle: 'preserve-3d'}}>
          {/* side buttons */}
          {[[-3, 150, 5, 34], [-3, 210, 5, 64], [-3, 288, 5, 64], [BODY_W - 2, 230, 5, 100]].map(([a, b, c, d], i) => (
            <div key={i} style={{position: 'absolute', left: a, top: b, width: c, height: d, borderRadius: 3, background: 'linear-gradient(90deg,#8d8a85,#d3d0c9,#77746f)'}} />
          ))}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 62,
              background: TITANIUM,
              boxShadow: '0 70px 120px -30px rgba(50,30,5,0.5), 0 30px 50px -20px rgba(50,30,5,0.35)',
            }}
          />
          <div style={{position: 'absolute', inset: 3, borderRadius: 59, background: '#050505', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)'}} />
          {/* display */}
          <div style={{position: 'absolute', left: 12, top: 12, width: SCREEN_W, height: SCREEN_H, borderRadius: 50, overflow: 'hidden', background: '#000', transform: 'translateZ(0.5px)'}}>
            {screen}
            {clipOverlay && <div style={{position: 'absolute', inset: 0, zIndex: 50}}>{clipOverlay}</div>}
            <div style={{position: 'absolute', left: (SCREEN_W - 118) / 2, top: 11, width: 118, height: 34, borderRadius: 17, background: '#000', zIndex: 60, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.05)'}}>
              <div style={{position: 'absolute', right: 20, top: 11, width: 12, height: 12, borderRadius: 6, background: 'radial-gradient(#1a2a45 20%, #05080f 70%)'}} />
            </div>
            {/* glass sheen */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: `linear-gradient(${115 + ry * 1.2}deg, rgba(255,255,255,0) ${30 + sheen * 40}%, rgba(255,255,255,0.14) ${42 + sheen * 40}%, rgba(255,255,255,0) ${56 + sheen * 40}%)`,
                pointerEvents: 'none',
                zIndex: 70,
              }}
            />
            <div style={{position: 'absolute', inset: 0, zIndex: 71, borderRadius: 50, boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,0.06), inset 0 0 40px rgba(0,0,0,0.12)', pointerEvents: 'none'}} />
          </div>
          {/* unclipped layer in screen coordinates */}
          <div style={{position: 'absolute', left: 12, top: 12, width: SCREEN_W, height: SCREEN_H, transformStyle: 'preserve-3d', transform: 'translateZ(2px)'}}>{overlay}</div>
        </div>
      </div>
    </>
  );
};
