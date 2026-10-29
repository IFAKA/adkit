import {z} from 'zod';

/* ------------------------------------------------------------------ primitives */
export const hex = z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'colour must be a hex string like "#B8742B"');
/** A time in beats, relative to the start of its block. Only whole and half beats are on the grid. */
export const beat = z.number().refine((n) => Math.abs(n * 2 - Math.round(n * 2)) < 1e-9, 'time must be a whole or half beat (0, 0.5, 1, 1.5 ...)');
export const posBeat = beat.refine((n) => n >= 0, 'time cannot be negative');
const str = z.string().min(1);

export const SANS_FONTS = ['Inter', 'Poppins', 'DMSans', 'Manrope', 'SpaceGrotesk'] as const;
export const SERIF_FONTS = ['InstrumentSerif', 'Fraunces', 'PlayfairDisplay', 'Lora'] as const;
export const MARK_FONTS = ['Fraunces', 'Inter', 'Poppins', 'PlayfairDisplay', 'DMSans'] as const;

/* ------------------------------------------------------------------ meta, brief, brand */
export const Meta = z.object({
  fps: z.number().int().min(24).max(60).default(30),
  width: z.number().int().min(360).default(1080),
  height: z.number().int().min(640).default(1920),
  bpm: z.number().min(60).max(180).default(120),
  /** Total length in bars; optional, checked against the sum of the blocks. */
  bars: z.number().positive().optional(),
}).strict();

export const Brief = z.object({
  audience: z.string().optional(),
  message: z.string().optional(),
  language: z.string().optional(),
  tone: z.string().optional(),
}).strict().default({});

export const Brand = z.object({
  name: str.describe('Product or brand name shown on the end card.'),
  tagline: z.string().optional(),
  contact: z.string().optional().describe('Contact line on the end card, e.g. a URL or phone number.'),
  colors: z.object({
    paper: hex.default('#F6F0E6').describe('Background of the bright scenes.'),
    paperDeep: hex.default('#EADFCB'),
    ink: hex.default('#1F1912').describe('Text on paper.'),
    glow: hex.default('#FFD9A0').describe('Soft key light on the background.'),
    accent: hex.default('#B8832B').describe('Accent words and highlights when the captured app has no theme.'),
    night: hex.default('#0C1627').describe('Background of the dark "problem" scene.'),
  }).strict().default({paper: '#F6F0E6', paperDeep: '#EADFCB', ink: '#1F1912', glow: '#FFD9A0', accent: '#B8832B', night: '#0C1627'}),
  fonts: z.object({
    sans: z.enum(SANS_FONTS).default('Inter'),
    serif: z.enum(SERIF_FONTS).default('InstrumentSerif').describe('Italic accent words in titles.'),
    mark: z.enum(MARK_FONTS).default('Fraunces').describe('Font of the app icon monogram.'),
  }).strict().default({sans: 'Inter', serif: 'InstrumentSerif', mark: 'Fraunces'}),
  icon: z.object({
    text: z.string().min(1).max(3).default('A'),
    color: hex.default('#B8742B'),
    textColor: hex.default('#FFF3DC'),
  }).strict().default({text: 'A', color: '#B8742B', textColor: '#FFF3DC'}),
}).strict();

/* ------------------------------------------------------------------ capture */
export const ElementSpec = z.union([
  str,
  z.object({selector: str, fixed: z.boolean().default(false).describe('Sticky/fixed element: its box is stored in viewport coordinates, not page coordinates.')}).strict(),
]);

const StepKeys = ['goto', 'click', 'fill', 'select', 'wait', 'evaluate', 'scroll'] as const;
export const CaptureStep = z.object({
  goto: z.string().optional().describe('Path or URL. {var} is replaced by values saved with evaluate+save.'),
  click: z.union([str, z.object({selector: str, tap: z.boolean().default(false)}).strict()]).optional().describe('Playwright selector.'),
  fill: z.object({selector: str, value: z.string()}).strict().optional(),
  select: z.object({selector: str, value: z.string()}).strict().optional(),
  wait: z.union([z.number().int().min(0), z.object({for: str, state: z.enum(['visible', 'hidden', 'attached', 'detached']).default('visible'), timeoutMs: z.number().int().optional()}).strict()]).optional().describe('Milliseconds, or wait for a selector.'),
  evaluate: z.union([str, z.object({file: str.optional(), script: str.optional(), save: str.optional().describe('Store the returned value as {name} for later steps.')}).strict()]).optional().describe('JavaScript run in the page (inline, or {file}).'),
  scroll: z.union([z.number(), z.object({to: str, offset: z.number().default(0), within: str.optional()}).strict()]).optional(),
}).strict().superRefine((s, ctx) => {
  const n = StepKeys.filter((k) => s[k] !== undefined).length;
  if (n !== 1) ctx.addIssue({code: 'custom', message: `each step needs exactly one of: ${StepKeys.join(', ')} (found ${n})`});
});

export const CaptureScreen = z.object({
  name: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]*$/, 'screen names are letters, digits, - and _').optional().describe('Omit to run steps without taking a shot.'),
  steps: z.array(CaptureStep).default([]),
  elements: z.record(z.string(), ElementSpec).default({}).describe('Named elements whose boxes the video can point at.'),
  scroll: z.union([z.number(), z.object({to: str, offset: z.number().default(0)}).strict()]).optional().describe('Scroll before the shot: a number of px, or bring an element to {offset} px below the top.'),
  drawer: z.boolean().default(false).describe('An overlay (sheet/drawer): shoot the viewport only, no full-page image.'),
  settleMs: z.number().int().min(0).default(700),
}).strict();

export const CaptureSet = z.object({
  extends: z.string().optional().describe('Inherit app settings from another set.'),
  env: z.record(z.string(), z.string()).default({}),
  setup: z.array(z.string()).default([]).describe('Shell commands run (in the app folder) before building this set.'),
  theme: z.object({bg: hex, fg: hex, accent: hex}).strict().optional().describe('Colours of this variant; used for backgrounds and highlights.'),
  screens: z.array(CaptureScreen).default([]),
}).strict();

export const Capture = z.object({
  app: z.object({
    dir: z.string().optional().describe('App folder. Supports ${ENV:-default}. Omit for a plain URL.'),
    url: z.string().optional().describe('Base URL of an already running site (skips start/build).'),
    isolate: z.enum(['copy', 'inplace']).default('copy').describe('Work in a copy under .adkit/ so the app folder is never touched.'),
    setup: z.array(z.string()).default([]),
    build: z.array(z.string()).default([]),
    start: z.string().optional().describe('Server command; {port} is replaced by a free port.'),
    env: z.record(z.string(), z.string()).default({}),
    ready: z.object({path: z.string().default('/'), timeoutSeconds: z.number().default(120)}).strict().default({path: '/', timeoutSeconds: 120}),
    teardown: z.array(z.string()).default([]),
  }).strict(),
  viewport: z.object({width: z.number().int().default(390), height: z.number().int().default(844), scale: z.number().int().min(1).max(4).default(3)}).strict().default({width: 390, height: 844, scale: 3}),
  locale: z.string().default('en-US'),
  timezone: z.string().default('UTC'),
  clock: z.string().optional().describe('ISO time to freeze the browser clock at, so dates in screenshots are stable.'),
  inputs: z.array(z.string()).default([]).describe('Files or folders (relative to the spec) that change what the app shows; hashed into the capture cache key.'),
  sets: z.record(z.string(), CaptureSet).refine((s) => 'main' in s, 'capture.sets needs a set called "main"'),
}).strict();

/* ------------------------------------------------------------------ sound */
export const Sound = z.object({
  key: z.string().default('C').describe('Tonic note name, e.g. C, F#, Bb.'),
  progression: z.array(str).min(1).default(['C', 'F', 'Am', 'G']).describe('Chord names looped over the groove bars (C, Am, G7, Fmaj7, ...).'),
  chords: z.record(z.string(), str).default({}).describe('Per-bar overrides: bar number (1-based) to chord name.'),
  motif: z.object({
    notes: z.array(z.tuple([z.number().min(0), z.number().int().min(24).max(100), z.number().positive()])).min(1).describe('[beat, midi note, length in beats]'),
    ding: z.union([z.number().int().min(60).max(108), z.literal(false)]).default(84).describe('Midi note of the final bell, or false.'),
  }).strict().default({notes: [[0, 67, 0.75], [0.75, 72, 0.25], [1, 76, 0.75], [1.75, 74, 0.25]], ding: 84}),
  sfx: z.record(z.string(), z.object({
    mute: z.boolean().optional(),
    sound: z.string().optional().describe('SFX name from the palette (tap, pop, swap, shimmer, bag_swish, payment_ding, order_bell, receipt_chatter, whoosh, rise).'),
    gain: z.number().optional().describe('dB'),
    duck: z.number().optional().describe('dB the music dips for 150 ms'),
    pan: z.number().min(-1).max(1).optional(),
  }).strict()).default({}).describe('Overrides keyed by cue name (block:cue) or by cue role.'),
  seed: z.number().int().default(21),
  loudness: z.object({lufs: z.number().default(-14), truePeak: z.number().default(-1.5)}).strict().default({lufs: -14, truePeak: -1.5}),
}).strict();

/* ------------------------------------------------------------------ blocks */
/** "name" (main set) or "set/name". */
export const ScreenRef = z.string().regex(/^([A-Za-z][A-Za-z0-9_-]*\/)?[A-Za-z][A-Za-z0-9_-]*$/, 'screen reference is "name" or "set/name"');

export const Title = z.object({
  lines: z.array(str).min(1).max(4).describe('Lines of text. *word* is the italic accent, _ is a non-breaking space.'),
  at: posBeat.default(0).describe('Beat (relative to the block) when it enters.'),
  to: posBeat.optional().describe('Beat when it leaves; default: never (until the block ends).'),
  y: z.number().optional().describe('Top of the text in px (default 270, inside the safe zone).'),
  size: z.number().min(60).max(220).default(120),
  color: hex.optional(),
  accent: hex.optional(),
  scrim: z.union([z.boolean(), hex]).default(false).describe('Soft gradient behind the text; true uses the paper colour.'),
}).strict();

const common = {
  id: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]*$/).optional().describe('Name used in cue names and error messages (default: block name + index).'),
  bars: z.number().min(0).refine((n) => Math.abs(n * 4 - Math.round(n * 4)) < 1e-9, 'length must be a multiple of 0.25 bars (one beat)').describe('Length in bars (4 beats each).'),
  titles: z.array(Title).default([]),
};

export const CameraKey = z.object({
  at: posBeat.describe('Beat (relative to the block) when the move starts.'),
  offset: z.number().int().default(0).describe('Extra frames added to `at` (camera moves need not sit on the grid).'),
  zoom: z.union([z.number().min(0.5).max(4), z.object({fit: str, fraction: z.number().min(0.2).max(1).default(0.75)}).strict()]).describe('Zoom, or fit an element to a fraction of the frame width.'),
  focus: z.object({
    element: str.optional().describe('Look at this element (of the screen currently shown).'),
    x: z.union([z.number(), z.literal('element')]).default(195),
    y: z.number().optional().describe('Phone screen y in px (default 422 = centre).'),
    dy: z.number().default(0),
  }).strict().default({x: 195, dy: 0}),
  qy: z.number().default(1180).describe('Where on the frame (px from top) the focus point sits.'),
  spring: z.enum(['soft', 'fast', 'tap', 'slow', 'snap']).default('soft'),
  roll: z.number().optional().describe('Camera roll in degrees; omit to keep the current roll.'),
  whoosh: z.boolean().default(false).describe('Emit a short whoosh cue at this move.'),
}).strict();

const Cam = z.array(CameraKey).default([]);

const TapFlowStep = z.discriminatedUnion('type', [
  z.object({type: z.literal('screen'), at: posBeat, screen: ScreenRef, scroll: z.union([z.number(), z.object({element: str, y: z.number()}).strict()]).optional().describe('Scroll in px, or bring an element to screen-y.'), sticky: z.number().optional().describe('Pin the top N px (header) while scrolled.')}).strict(),
  z.object({type: z.literal('tap'), at: posBeat, element: str, x: z.number().min(0).max(1).default(0.5).describe('Where along the element width the finger lands.'), radius: z.number().default(16), press: z.boolean().default(false).describe('Pop the element out and press it.'), highlight: z.boolean().default(true), pan: z.number().optional()}).strict(),
  z.object({type: z.literal('lift'), at: posBeat, element: str, tap: str.optional().describe('Element of the lifted card the finger presses.'), tapAt: posBeat.optional()}).strict(),
  z.object({type: z.literal('fly'), at: posBeat, to: str.describe('Element the lifted card flies into (e.g. the cart icon).')}).strict(),
  z.object({type: z.literal('badge'), at: posBeat, element: str, count: z.number().int().default(1)}).strict(),
  z.object({type: z.literal('check'), at: posBeat, size: z.number().default(150)}).strict(),
]);

export const ChatChaos = z.object({
  block: z.literal('chatChaos'), ...common,
  messages: z.array(z.object({
    text: str,
    side: z.enum(['in', 'out']).default('in'),
    beat: posBeat.optional().describe('Grid time: also emits a "ping" cue.'),
    frame: z.number().int().optional().describe('Free time in frames from block start (may be negative = already on screen).'),
  }).strict().refine((m) => (m.beat === undefined) !== (m.frame === undefined), 'give exactly one of beat or frame')).min(3),
  counter: z.object({start: z.number().int().default(3), rise: z.number().int().default(44), cap: z.number().int().default(99)}).strict().default({start: 3, rise: 44, cap: 99}),
  flyBeats: beat.default(1).describe('Beats before the end of the block when the bubbles fly into the icon.'),
  title: Title.optional().describe('Drawn inside the shaking scene; default colours are white and green.'),
}).strict();

export const IconOpen = z.object({
  block: z.literal('iconOpen'), ...common,
  text: z.string().max(3).optional().describe('Default: brand.icon.text'),
  color: hex.optional(),
  bloom: z.object({core: hex.default('#F2A94E'), edge: hex.default('#8A4A14')}).strict().default({core: '#F2A94E', edge: '#8A4A14'}).describe('Warm light that grows out of the icon.'),
}).strict();

export const Reveal = z.object({
  block: z.literal('reveal'), ...common,
  screen: ScreenRef, scroll: z.number().default(0),
  open: z.enum(['auto', 'icon', 'rise']).default('auto').describe('icon = grows out of the app icon (after iconOpen); rise = rises into frame.'),
}).strict();

export const TapFlow = z.object({
  block: z.literal('tapFlow'), ...common,
  start: z.object({screen: ScreenRef, scroll: z.number().default(0)}).strict(),
  steps: z.array(TapFlowStep).min(1),
  camera: Cam,
}).strict();

export const Whip = z.object({
  block: z.literal('whip'), ...common, bars: z.literal(0).default(0),
  to: z.string().optional().describe('Informational: what the next screen is.'),
}).strict();

export const Notification = z.object({
  block: z.literal('notification'), ...common,
  screen: ScreenRef, element: str.describe('Element that slides in (e.g. the new order card).'),
  also: z.array(str).default([]).describe('More elements joined with `element` into one box (e.g. its badge).'),
  slideAt: posBeat, landAt: posBeat,
  banner: z.object({title: str, body: str, time: z.string().default('now')}).strict(),
  camera: Cam,
}).strict();

export const StatCountUp = z.object({
  block: z.literal('statCountUp'), ...common,
  screen: ScreenRef,
  scroll: z.object({from: z.number(), to: z.number()}).strict(),
  number: z.object({
    element: str, from: z.number().default(0), to: z.number(),
    prefix: z.string().default(''), suffix: z.string().default(''), thousands: z.string().default(','), decimals: z.number().int().min(0).default(0),
    fontSize: z.number().default(46), weight: z.number().default(500), color: hex.optional(),
    startAt: posBeat, doneAt: posBeat,
  }).strict(),
  card: z.string().optional().describe('Element ringed when the count finishes.'),
  chart: z.object({element: str, at: posBeat}).strict().optional().describe('Bars of this element grow in.'),
  camera: Cam,
}).strict();

export const Skins = z.object({
  block: z.literal('skins'), ...common,
  variants: z.array(z.object({screen: ScreenRef, scroll: z.number().default(0), sticky: z.number().default(0)}).strict()).min(2),
  every: beat.default(2).describe('Beats between two variants.'),
  title: Title.optional().describe('Colours follow the current variant.'),
  camera: Cam,
}).strict();

export const EndCard = z.object({
  block: z.literal('endCard'), ...common,
  screen: ScreenRef, scroll: z.number().default(0),
  title: Title.optional().describe('Line under the phone, e.g. the promise.'),
  mark: z.enum(['storefront', 'monogram', 'none']).default('monogram'),
  lockupAt: posBeat.default(4), contactAt: posBeat.default(5), hitAt: posBeat.default(6),
}).strict();

export const Block = z.discriminatedUnion('block', [ChatChaos, IconOpen, Reveal, TapFlow, Whip, Notification, StatCountUp, Skins, EndCard]);
export type BlockSpec = z.infer<typeof Block>;

/* ------------------------------------------------------------------ the whole spec */
export const Output = z.object({
  file: z.string().default('out/ad.mp4'),
  crf: z.number().int().min(10).max(30).default(18),
}).strict().default({file: 'out/ad.mp4', crf: 18});

export const AdSpec = z.object({
  meta: Meta.default({fps: 30, width: 1080, height: 1920, bpm: 120}),
  brief: Brief,
  brand: Brand,
  capture: Capture,
  scenes: z.array(Block).min(1),
  sound: Sound.default({key: 'C', progression: ['C', 'F', 'Am', 'G'], chords: {}, motif: {notes: [[0, 67, 0.75], [0.75, 72, 0.25], [1, 76, 0.75], [1.75, 74, 0.25]], ding: 84}, sfx: {}, seed: 21, loudness: {lufs: -14, truePeak: -1.5}}),
  output: Output,
}).strict();

export type AdSpecInput = z.input<typeof AdSpec>;
export type Ad = z.infer<typeof AdSpec>;
export type Title = z.infer<typeof Title>;
export type CameraKey = z.infer<typeof CameraKey>;
