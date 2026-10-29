import React from 'react';
import * as Inter from '@remotion/google-fonts/Inter';
import * as Poppins from '@remotion/google-fonts/Poppins';
import * as DMSans from '@remotion/google-fonts/DMSans';
import * as Manrope from '@remotion/google-fonts/Manrope';
import * as SpaceGrotesk from '@remotion/google-fonts/SpaceGrotesk';
import * as InstrumentSerif from '@remotion/google-fonts/InstrumentSerif';
import * as Fraunces from '@remotion/google-fonts/Fraunces';
import * as PlayfairDisplay from '@remotion/google-fonts/PlayfairDisplay';
import * as Lora from '@remotion/google-fonts/Lora';
import type {Ad} from '../../spec/schema';

type Mod = {loadFont: (style: any, o: any) => {fontFamily: string}; getInfo: () => {fonts: Record<string, Record<string, unknown>>}};
const MODS: Record<string, Mod> = {Inter, Poppins, DMSans, Manrope, SpaceGrotesk, InstrumentSerif, Fraunces, PlayfairDisplay, Lora} as any;

const load = (name: string, style: 'normal' | 'italic', want: string[]) => {
  const m = MODS[name];
  const have = Object.keys(m.getInfo().fonts[style] ?? {});
  const avail = Object.keys(m.getInfo().fonts[style] ?? {});
  void have;
  let weights = want.filter((w) => avail.includes(w));
  if (!weights.length) weights = avail.slice(0, 1);
  return m.loadFont(style, {weights, subsets: ['latin']}).fontFamily;
};

export type Fonts = {sans: string; serif: string; mark: string};
/** Loads the brand fonts (blocks the render until they are ready). */
export const loadBrandFonts = (b: Ad['brand']['fonts']): Fonts => ({
  sans: load(b.sans, 'normal', ['500', '600', '700', '800']),
  serif: load(b.serif, 'italic', ['400']),
  mark: load(b.mark, 'normal', ['600', '700']),
});

export const FontsCtx = React.createContext<Fonts>({sans: 'sans-serif', serif: 'serif', mark: 'serif'});
export const useFonts = () => React.useContext(FontsCtx);
