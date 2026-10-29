import React from 'react';
import {useFonts} from './fonts';
import {mix} from './anim';

export type IconStyle = {text: string; color: string; textColor: string};

/** The app icon face: brand colour, top light, inner shadow, serif monogram. Fills its parent (84 px design size). */
export const AppIconFace: React.FC<{icon: IconStyle; opacity?: number; textOpacity?: number; mono?: number}> = ({icon, opacity = 1, textOpacity = 1, mono = 1}) => {
  const {mark} = useFonts();
  const size = icon.text.length > 2 ? 34 : icon.text.length === 2 ? 46 : 54;
  return (
    <div style={{position: 'absolute', inset: 0, opacity, background: `linear-gradient(170deg, ${mix(icon.color, '#FFFFFF', 0.22)}, ${icon.color} 45%, ${mix(icon.color, '#000000', 0.28)})`, boxShadow: 'inset 0 2px 1px rgba(255,255,255,0.38), inset 0 -4px 8px rgba(70,30,0,0.38), inset 0 0 0 1px rgba(80,40,0,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
      <div style={{position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(255,255,255,0.28), rgba(255,255,255,0) 48%)'}} />
      <div style={{fontFamily: mark, fontWeight: 600, fontSize: size * mono, lineHeight: 1, letterSpacing: '-0.04em', color: icon.textColor, textShadow: '0 2px 3px rgba(60,25,0,0.4)', opacity: textOpacity, paddingBottom: 2 * mono}}>{icon.text}</div>
    </div>
  );
};
