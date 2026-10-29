import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {useFonts} from './fonts';
import {spr, ramp, clamp01, rgba, SNAP} from './anim';
import {W} from '../model';
import {layoutTitle, parseWord, TITLE_LEFT, TITLE_LINE} from '../geometry';
import type {Title as TitleSpec} from '../../spec/schema';

/** Kinetic title. Words enter one after another; the block leaves at `outAt`. *word* is the serif italic accent. */
export const Title: React.FC<{spec: TitleSpec; inAt: number; outAt?: number; color: string; accent: string; scrim?: string; stagger?: number}> = ({spec, inAt, outAt = 99999, color, accent, scrim, stagger = 3}) => {
  const f = useCurrentFrame();
  const {sans, serif} = useFonts();
  if (f < inAt - 1 || f > outAt + 12) return null;
  const lay = layoutTitle(spec, W);
  const out = ramp(f, outAt, outAt + 8);
  let wi = 0;
  const inK = clamp01(spr(f, inAt, SNAP));
  return (
    <>
      {scrim && <div style={{position: 'absolute', left: 0, top: 0, width: W, height: 680, opacity: inK * (1 - out), background: `linear-gradient(180deg, ${rgba(scrim, 1)} 0%, ${rgba(scrim, 0.97)} 70%, ${rgba(scrim, 0)} 100%)`, pointerEvents: 'none'}} />}
      <div style={{position: 'absolute', left: TITLE_LEFT, width: W - 2 * TITLE_LEFT, top: lay.y, textAlign: 'center', fontFamily: sans, fontWeight: 800, fontSize: lay.fontSize, lineHeight: TITLE_LINE, letterSpacing: '-0.045em', color, opacity: 1 - out, transform: `translateY(${-out * 40}px)`, filter: out > 0 ? `blur(${out * 10}px)` : undefined}}>
        {spec.lines.map((line, li) => (
          <div key={li} style={{whiteSpace: 'nowrap'}}>
            {line.split(' ').map((raw, i) => {
              const {accent: isAccent, text} = parseWord(raw);
              const word = text.replace(/ /g, ' ');
              const p = spr(f, inAt + wi * stagger, SNAP);
              wi++;
              return (
                <span key={i} style={{display: 'inline-block', marginRight: '0.24em', opacity: clamp01(p * 1.4), transform: `translateY(${interpolate(p, [0, 1], [70, 0])}px) scale(${interpolate(p, [0, 1], [0.92, 1])})`, filter: p < 1 ? `blur(${(1 - clamp01(p)) * 10}px)` : undefined, ...(isAccent ? {fontFamily: serif, fontStyle: 'italic', fontWeight: 400, color: accent, fontSize: '1.14em', letterSpacing: '-0.02em', lineHeight: 0.9} : {})}}>
                  {word}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
};
