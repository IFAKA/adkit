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

export type Part = {accent: boolean; text: string};

/** A line as words (split at spaces), each a list of plain and accent parts. `*` opens an accent before a non-space and closes it after one, so `*pay*.`, `(*pay*)` and `*two words*` work; a lone `*` stays text. */
export const parseLine = (line: string): Part[][] => {
  let accent = false;
  return line.split(' ').map((raw) => {
    const parts: Part[] = [];
    let cur = '';
    const flush = () => { if (cur) parts.push({accent, text: cur.replace(/_/g, '\u00a0')}); cur = ''; };
    [...raw].forEach((ch, i, all) => {
      const next = all[i + 1];
      const opens = !accent && next !== undefined && next !== '*';
      const closes = accent && i > 0 && all[i - 1] !== '*';
      if (ch === '*' && (opens || closes)) { flush(); accent = !accent; } else cur += ch;
    });
    flush();
    return parts;
  });
};

/** Estimated width of a line at font size `size` (px). Words are inline blocks with a 0.24em right margin. */
export const lineWidth = (line: string, size: number): number => {
  let w = 0;
  for (const word of parseLine(line)) {
    for (const {accent, text} of word) {
      let ew = 0;
      for (const ch of text) ew += accent ? 0.46 : adv(ch);
      w += ew * size * (accent ? 1.14 : 1);
    }
    w += 0.24 * size;
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

/** Frame offsets of the four corner squares, so they do not flicker together. */
export const MARKER_OFFSETS = [0, 2, 1, 3];
/** Frames (after a square's start) at which its opacity flips: on at 0, then off, on, off ... ends on. */
const MARKER_FLIPS = [1, 2, 4, 5, 8, 10, 11, 12];

/** Flicker accent opacity (0 or 1) of one square `start` frames in: 100, then 0/100 with uneven gaps, then hold. */
export function markerOpacity(f: number, start: number): number {
  if (f < start) return 0;
  return MARKER_FLIPS.filter((k) => f - start >= k).length % 2 === 0 ? 1 : 0;
}

/** The four squares (top-left, top-right, bottom-right, bottom-left), centred on the corners of a title box. */
export const markerBoxes = (box: {x: number; y: number; w: number; h: number}, size: number) =>
  [[box.x, box.y], [box.x + box.w, box.y], [box.x + box.w, box.y + box.h], [box.x, box.y + box.h]].map(([cx, cy]) => ({x: Math.round(cx - size / 2), y: Math.round(cy - size / 2), size}));
