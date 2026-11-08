import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {useFonts} from './fonts';
import {spr, ramp, clamp01, rgba, SNAP} from './anim';
import {W} from '../model';
import {wordCount, wordStarts} from '../../engine/reading';
import {layoutTitle, parseLine, TITLE_LEFT, TITLE_LINE} from '../geometry';
import type {Title as TitleSpec} from '../../spec/schema';

/** Kinetic title. Words enter one after another; the block leaves at `outAt`. *word* is the serif italic accent. */
export const Title: React.FC<{spec: TitleSpec; inAt: number; outAt?: number; color: string; accent: string; scrim?: string}> = ({spec, inAt, outAt = 99999, color, accent, scrim}) => {
  const f = useCurrentFrame();
  const {sans, serif} = useFonts();
  if (f < inAt - 1 || f > outAt + 12) return null;
  const lay = layoutTitle(spec, W);
  const out = ramp(f, outAt, outAt + 8);
  const starts = wordStarts(wordCount(spec.lines), spec.stagger);
  let wi = 0;
  const inK = spec.instant ? 1 : clamp01(spr(f, inAt, SNAP));
  return (
    <>
      {scrim && <div style={{position: 'absolute', left: 0, top: 0, width: W, height: 680, opacity: inK * (1 - out), background: `linear-gradient(180deg, ${rgba(scrim, 1)} 0%, ${rgba(scrim, 0.97)} 70%, ${rgba(scrim, 0)} 100%)`, pointerEvents: 'none'}} />}
      <div style={{position: 'absolute', left: TITLE_LEFT, width: W - 2 * TITLE_LEFT, top: lay.y, textAlign: 'center', fontFamily: sans, fontWeight: 800, fontSize: lay.fontSize, lineHeight: TITLE_LINE, letterSpacing: '-0.045em', color, opacity: 1 - out, transform: `translateY(${-out * 40}px)`, filter: out > 0 ? `blur(${out * 10}px)` : undefined}}>
        {spec.lines.map((line, li) => (
          <div key={li} style={{whiteSpace: 'nowrap'}}>
            {parseLine(line).map((parts, i) => {
              const p = spec.instant ? 1 : spr(f, inAt + (starts[wi] ?? 0), SNAP);
              wi++;
              return (
                <span key={i} style={{display: 'inline-block', marginRight: '0.24em', opacity: clamp01(p * 1.4), transform: `translateY(${interpolate(p, [0, 1], [70, 0])}px) scale(${interpolate(p, [0, 1], [0.92, 1])})`, filter: p < 1 ? `blur(${(1 - clamp01(p)) * 10}px)` : undefined}}>
                  {parts.map((pt, j) => (pt.accent ? <span key={j} style={{fontFamily: serif, fontStyle: 'italic', fontWeight: 400, color: accent, fontSize: '1.14em', letterSpacing: '-0.02em', lineHeight: 0.9}}>{pt.text}</span> : <React.Fragment key={j}>{pt.text}</React.Fragment>))}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
};
