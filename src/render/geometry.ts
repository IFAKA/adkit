import type {Plan} from '../engine/plan';
import type {Ad, Title} from '../spec/schema';
import type {CaptureManifest} from './types';

export const SAFE_TOP = 250;
export const SAFE_BOTTOM = 400;
export const TITLE_LEFT = 60;
export const TITLE_LINE = 1.02;
export const DEFAULT_TITLE_Y = SAFE_TOP + 20;

export type TitleBox = {frame: number; kind: 'title'; block: string; box: {x: number; y: number; w: number; h: number}; fontSize: number};

/** Rough advance width (em) of one character of the bold sans title font, after the -0.045em letter spacing. */
const adv = (ch: string): number => {
  if ('iljtf.,:;!|\'`'.includes(ch)) return 0.3 - 0.045;
  if ('mwMW@'.includes(ch)) return 0.9 - 0.045;
  if (/[A-ZÀ-Ý]/.test(ch)) return 0.68 - 0.045;
  if (/[0-9]/.test(ch)) return 0.62 - 0.045;
  if (ch === ' ' || ch === ' ' || ch === '_') return 0.28 - 0.045;
  return 0.58 - 0.045;
};

export const parseWord = (raw: string) => {
  const accent = raw.length > 1 && raw.startsWith('*') && raw.endsWith('*');
  return {accent, text: (accent ? raw.slice(1, -1) : raw).replace(/_/g, ' ')};
};

/** Estimated width of a line at font size `size` (px). Words are inline blocks with a 0.24em right margin. */
export const lineWidth = (line: string, size: number): number => {
  let w = 0;
  for (const raw of line.split(' ')) {
    const {accent, text} = parseWord(raw);
    let ew = 0;
    for (const ch of text) ew += accent ? 0.46 : adv(ch);
    w += ew * size * (accent ? 1.14 : 1) + 0.24 * size;
  }
  return w - 0.24 * size;
};

/** Shared by Title.tsx and the safe-zone check: where a title sits and how large its text really is (long lines shrink to fit). */
export function layoutTitle(t: Title, width: number) {
  const avail = width - 2 * TITLE_LEFT;
  const widest = Math.max(...t.lines.map((l) => lineWidth(l, t.size)));
  const fontSize = widest > avail ? Math.floor((t.size * avail) / widest) : t.size;
  const y = t.y ?? DEFAULT_TITLE_Y;
  const w = Math.min(avail, Math.max(...t.lines.map((l) => lineWidth(l, fontSize))));
  const h = t.lines.length * fontSize * TITLE_LINE;
  return {fontSize, y, box: {x: Math.round((width - w) / 2), y, w: Math.round(w), h: Math.round(h)}, avail};
}

/** Layout boxes of every title (pure, no browser). Inputs `spec` and `manifest` are accepted for symmetry with the renderer. */
export function layoutBoxes(plan: Plan, _spec?: Ad, _manifest?: CaptureManifest): TitleBox[] {
  return plan.titles.map((pt) => {
    const l = layoutTitle(pt.spec, plan.width);
    return {frame: pt.inAt, kind: 'title' as const, block: pt.block, box: l.box, fontSize: l.fontSize};
  });
}
