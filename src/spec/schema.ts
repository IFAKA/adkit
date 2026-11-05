import {z} from 'zod';

/* ------------------------------------------------------------------ primitives */
export const hex = z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'colour must be a hex string like "#B8742B"');
/** A time in beats, relative to the start of its block. Only whole and half beats are on the grid. */
export const beat = z.number().refine((n) => Math.abs(n * 2 - Math.round(n * 2)) < 1e-9, 'time must be a whole or half beat (0, 0.5, 1, 1.5 ...)');
export const posBeat = beat.refine((n) => n >= 0, 'time cannot be negative');
const str = z.string().min(1);

export const SANS_FONTS = ['Inter', 'Poppins', 'DMSans', 'Manrope', 'SpaceGrotesk', 'Montserrat', 'NunitoSans'] as const;
export const SERIF_FONTS = ['InstrumentSerif', 'Fraunces', 'PlayfairDisplay', 'Lora', 'Montserrat'] as const;
export const MARK_FONTS = ['Fraunces', 'Inter', 'Poppins', 'PlayfairDisplay', 'DMSans', 'Montserrat'] as const;

/* ------------------------------------------------------------------ meta, brief, brand */
export const Meta = z.object({
  fps: z.number().int().min(24).max(60).default(30),
  width: z.number().int().min(360).default(1080),
  height: z.number().int().min(640).default(1920),
  bpm: z.number().min(30).max(400).optional().describe('Only if sound.music has no bpm; the music bpm wins and must match.'),
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
    image: z.string().regex(/\.(png|svg)$/i, 'icon image must be a .png or .svg file').optional().describe('Path (relative to ad.yaml) of a real app icon. It is drawn instead of the monogram, cropped to the rounded icon shape.'),
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
  geolocation: z.object({latitude: z.number(), longitude: z.number()}).optional(),
  safeArea: z.object({top: z.number().default(0), bottom: z.number().default(0)}).strict().optional().describe('Phone safe-area insets in px (env(safe-area-inset-*)), e.g. {top: 47, bottom: 34} for a notch phone, so apps leave room for the home indicator like on a real device.'),
  routes: z.array(z.object({
    url: str.describe('Playwright URL glob, e.g. "**/api/bikes*".'),
    file: str.describe('Response body file, relative to the spec. Put it in a folder listed in `inputs` so the capture cache sees changes.'),
    contentType: z.string().default('application/json'),
    status: z.number().int().min(100).max(599).default(200),
  }).strict()).default([]).describe('Answer matching requests with a fixed file, so live data (times, counts) is the same on every capture.'),
  timezone: z.string().default('UTC'),
  clock: z.string().optional().describe('ISO time to freeze the browser clock at, so dates in screenshots are stable.'),
  inputs: z.array(z.string()).default([]).describe('Files or folders (relative to the spec) that change what the app shows; hashed into the capture cache key.'),
  sets: z.record(z.string(), CaptureSet).refine((s) => 'main' in s, 'capture.sets needs a set called "main"'),
}).strict();

/* ------------------------------------------------------------------ sound */
/** A MUSIC object as audio/score.py reads it (bpm, meter, key, instruments, patterns, sections ...). score.py checks the details when the audio is built. */
export const Music = z.looseObject({
  bpm: z.number().min(30).max(400).describe('Beats per minute. x/4: quarter notes; 6/8, 9/8, 12/8: dotted quarters (override with meter.bpm_counts).'),
  meter: z.looseObject({beats: z.number().int().min(2).max(12).default(4), unit: z.union([z.literal(4), z.literal(8)]).default(4)}).optional().describe('{beats: 3, unit: 4} = 3/4; {beats: 6, unit: 8} = 6/8. Default 4/4.'),
  key: z.string().optional().describe('e.g. "D minor", "A phrygian dominant".'),
  instruments: z.record(z.string(), z.looseObject({model: z.string()})).describe('name -> {model, preset, params, octave, gain, pan, fx ...}'),
  patterns: z.record(z.string(), z.looseObject({})).optional(),
  sections: z.array(z.looseObject({bars: z.number().int().min(1)})).min(1),
});
/** A SOUND object as audio/sounddesign.py reads it. */
export const SoundDef = z.looseObject({
  meaning: str.describe('What object in the product\'s world this sound is, and why it is in the ad (at least 4 words).'),
  layers: z.array(z.looseObject({model: z.string()})).min(1).describe('[{model, preset, params, note, at, gain, pan, fx, reverse, repeat}]'),
  fx: z.array(z.looseObject({type: z.string()})).optional(),
  seed: z.number().int().optional(),
  tune: z.literal('chord').optional().describe('"chord": the written notes are in the key of the music and move to the chord that plays at the cue time.'),
});
export const CueMap = z.union([
  str.describe('The name of a sound in `sounds`, or "silent".'),
  z.object({
    sound: str.describe('Name of a sound in `sounds`, or "silent".'),
    gain: z.number().default(0).describe('dB added to the sound.'),
    pan: z.number().min(-1).max(1).optional().describe('-1 left .. 1 right. Taps with a pan in the spec use it when this is not set.'),
    duck: z.number().min(0).max(24).optional().describe('dB the music dips under this cue for 150 ms (default: mix.duckMusic).'),
    variations: z.number().int().min(1).max(8).default(3).describe('How many seeds the sound rotates through, so repeats do not sound identical.'),
    align: z.enum(['start', 'end']).default('start').describe('"end": a cue with a duration (riser, count) ends the sound when the cue ends.'),
    reason: z.string().optional().describe('Why this cue shares a sound with another role (silences the warning).'),
  }).strict(),
]);
export const Sound = z.object({
  music: z.union([Music, z.object({file: str}).strict()]).optional().describe('The music as data (or {file: music.json}). Required: there is no default song.'),
  sounds: z.record(z.string().regex(/^[A-Za-z][A-Za-z0-9_-]*$/, 'sound names are letters, digits, _ and -'), z.union([SoundDef, z.object({file: str}).strict()])).default({}).describe('name -> SOUND. Every sound has a `meaning`.'),
  cues: z.record(z.string(), CueMap).default({}).describe('Cue name (block:cue), role (tap, paid, ...) or kind (tap, pop, whoosh, ...) -> sound. Name wins over role, role over kind. "silent" is an explicit silence.'),
  mix: z.object({
    loudness: z.object({lufs: z.number().default(-14), truePeak: z.number().default(-1.5)}).strict().default({lufs: -14, truePeak: -1.5}),
    duckMusic: z.number().min(0).max(24).default(0).describe('Default dB the music dips under every cue (150 ms). A cue can set its own `duck`.'),
    musicGain: z.number().default(0).describe('dB added to the music before the cues are mixed in.'),
  }).strict().default({loudness: {lufs: -14, truePeak: -1.5}, duckMusic: 0, musicGain: 0}),
  seed: z.number().int().default(21).describe('Base seed for the sounds (the music has its own seed).'),
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
  instant: z.boolean().default(false).describe('Fully on screen at its first frame (no word-by-word entrance). Use it for a title at frame 0 of the ad.'),
}).strict();

const common = {
  id: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]*$/).optional().describe('Name used in cue names and error messages (default: block name + index).'),
  bars: z.number().min(0).describe('Length in bars; a whole number of beats (4/4: multiples of 0.25; 3/4: multiples of 1/3; 6/8: multiples of 1/6). The compiler checks it against the meter.'),
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
  why: z.string().optional().describe('Required on a push-in (a fit zoom, a zoom of 1.1 or more, or a focus on an element): what the viewer reads there, e.g. `reads: "3 min"`. A camera move needs a visible cause and a purpose; the check refuses a push-in without it and warns when it does not hold still long enough to be read.'),
}).strict();

const Cam = z.array(CameraKey).default([]);

const TapFlowStep = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('screen'), at: posBeat, screen: ScreenRef,
    transition: z.enum(['slide', 'cut', 'fade', 'sheet', 'zoom']).default('slide').describe('slide = pushes in from the right; cut = hard cut (a tab switch); fade = cross-fade; zoom = grows in from slightly smaller; sheet = the bottom of the new screen rises over the old one (capture the page with the sheet open, pinned to the bottom).'),
    sheetHeight: z.number().min(120).max(800).default(520).describe('transition sheet: height of the sheet in screen px.'),
    scroll: z.union([z.number(), z.object({element: str, y: z.number()}).strict()]).optional().describe('Scroll in px, or bring an element to screen-y.'),
    sticky: z.number().optional().describe('Pin the top N px (header) while scrolled.'),
  }).strict(),
  z.object({
    type: z.literal('pop'), at: posBeat, elements: z.array(str).min(1).describe('Elements (e.g. map pins) that appear one after another. The screen capture shows them in their final place.'),
    stagger: beat.refine((n) => n > 0, 'stagger must be more than 0').default(0.5).describe('Beats between one element and the next.'),
    style: z.enum(['pin', 'ring', 'scale']).default('pin').describe('pin = drops in with a bounce; ring = pops in with an expanding ring; scale = grows from its centre.'),
    under: ScreenRef.optional().describe('A capture of the same page WITHOUT these elements. Needed on textured backgrounds (a map); on flat backgrounds the page colour is used.'),
  }).strict(),
  z.object({
    type: z.literal('type'), at: posBeat, element: str.describe('The input box (it should look empty in the capture).'), text: str,
    beats: beat.refine((n) => n > 0, 'beats must be more than 0').default(2).describe('How long the typing takes. A tick sound comes every half beat.'),
    fontSize: z.number().optional().describe('Default: 45% of the box height.'), color: hex.optional().describe('Default: the screen text colour.'),
  }).strict(),
  z.object({
    type: z.literal('pulse'), at: posBeat, element: str, color: hex.optional().describe('Default: the screen accent.'),
    count: z.number().int().min(1).max(8).default(2).describe('Rings, one per beat.'),
  }).strict(),
  z.object({
    type: z.literal('swipe'), at: posBeat, from: str, to: str, beats: beat.refine((n) => n > 0, 'beats must be more than 0').default(1),
    scroll: z.number().optional().describe('Also scroll the page by this many px while the finger moves (the finger stays on the same content point; `to` then only sets where it ends sideways).'),
  }).strict(),
  z.object({type: z.literal('tap'), at: posBeat, element: str, x: z.number().min(0).max(1).default(0.5).describe('Where along the element width the finger lands.'), radius: z.number().default(16), press: z.boolean().default(false).describe('Pop the element out and press it.'), highlight: z.boolean().default(true), pan: z.number().optional()}).strict(),
  z.object({type: z.literal('lift'), at: posBeat, element: str, tap: str.optional().describe('Element of the lifted card the finger presses.'), tapAt: posBeat.optional()}).strict(),
  z.object({type: z.literal('fly'), at: posBeat, to: str.describe('Element the lifted card flies into (e.g. the cart icon).')}).strict(),
  z.object({type: z.literal('badge'), at: posBeat, element: str, count: z.number().int().default(1)}).strict(),
  z.object({type: z.literal('check'), at: posBeat, size: z.number().default(150)}).strict(),
]);

const graphemes = (s: string) => [...new Intl.Segmenter(undefined, {granularity: 'grapheme'}).segment(s)].length;

export const ChaosItem = z.object({
  text: str,
  icon: z.string().refine((s) => graphemes(s) >= 1 && graphemes(s) <= 3, 'icon is one emoji or at most 3 characters').optional().describe('Emoji or up to 3 characters drawn on the item (cards, tabs, toasts). Bubbles have no icon.'),
  side: z.enum(['in', 'out']).default('in').describe('in = from the world to you (left); out = your own reply (right, tinted).'),
  beat: posBeat.optional().describe('Grid time: also emits a "ping" cue.'),
  frame: z.number().int().optional().describe('Free time in frames from block start (may be negative = already on screen).'),
}).strict().refine((m) => (m.beat === undefined) !== (m.frame === undefined), 'give exactly one of beat or frame');

export const Chaos = z.object({
  block: z.literal('chaos'), ...common,
  items: z.array(ChaosItem).min(3).describe('What piles up: messages, results, tabs or notifications. They arrive faster and faster.'),
  look: z.enum(['bubbles', 'cards', 'tabs', 'toasts']).default('bubbles').describe('bubbles = chat messages; cards = stacked app / search result cards; tabs = browser or app tabs piling up; toasts = notification banners.'),
  size: z.number().min(0.7).max(2).default(1).describe('Scales the item text. 1 = 42 px at 1080 wide, the smallest that reads on a phone. Fewer, bigger items read better than a long pile.'),
  pings: z.array(posBeat).default([]).describe('More ping sounds (beats) that have no item.'),
  counter: z.union([
    z.object({start: z.number().int().default(3), rise: z.number().int().default(44), cap: z.number().int().default(99), label: z.string().max(24).optional().describe('Small text under the counter (e.g. "open tabs").')}).strict(),
    z.literal(false),
  ]).default({start: 3, rise: 44, cap: 99}).describe('The red count that climbs while items pile up, or false for none.'),
  into: z.enum(['icon', 'center']).default('icon').describe('icon = items fly into an icon and an iconOpen block must follow; center = items collapse to one point and a flash cuts to the next block.'),
  flyBeats: beat.default(1).describe('Beats before the end of the block when the items fly in.'),
  title: Title.optional().describe('Drawn inside the shaking scene; default colours are white and green.'),
  pileTop: z.number().min(250).max(1200).optional().describe('Top of the pile in px. Titles sit above it: keep titles (y + their height) above this line so nothing overlaps. Default 600 with into: icon, 250 with into: center.'),
  tile: z.object({
    glyph: z.union([z.literal('chat'), z.string().refine((s) => graphemes(s) >= 1 && graphemes(s) <= 3, 'glyph is one emoji or at most 3 characters'), z.literal(false)]).default('chat').describe('Drawn on the tile the items fly into: "chat" = a chat bubble (default), an emoji / up to 3 characters, or false = none.'),
    color: hex.optional().describe('Tile colour. Default: a green gradient for the chat glyph, the brand accent otherwise.'),
  }).strict().optional().describe('The tile the items fly into (before it becomes the app icon; into: icon only).'),
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
  camera: Cam.describe('Replaces the default push-in. Use it to fit the whole phone (zoom below 1.1) or to centre the key UI above the bottom 400 px.'),
}).strict();

export const TapFlow = z.object({
  block: z.literal('tapFlow'), ...common,
  start: z.object({screen: ScreenRef, scroll: z.number().default(0), transition: z.enum(['slide', 'cut', 'fade', 'zoom']).default('fade').describe('How this screen replaces the previous block\'s screen. Default fade: a cross-fade, never a hard cut.')}).strict(),
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
  transition: z.enum(['cut', 'fade']).default('fade').describe('How one variant replaces the last. fade = a short cross-fade; cut = hard cut.'),
  title: Title.optional().describe('Colours follow the current variant.'),
  camera: Cam,
}).strict();

export const EndCard = z.object({
  block: z.literal('endCard'), ...common,
  screen: ScreenRef, scroll: z.number().default(0),
  title: Title.optional().describe('Line under the phone, e.g. the promise.'),
  mark: z.enum(['storefront', 'monogram', 'none']).default('monogram'),
  note: z.string().max(60).optional().describe('A small line under the contact line (e.g. "free, no sign-up"). Kept out of the bottom 400 px.'),
  lockupAt: posBeat.default(4), contactAt: posBeat.default(5), hitAt: posBeat.default(6),
  phone: z.object({
    scale: z.number().min(0.4).max(1.4).default(1.1),
    y: z.number().min(-600).max(900).default(535).describe('Phone centre offset from the frame centre, px. Default 535 puts the phone in the bottom half and crops it; about 0.8 with y 370 shows the whole phone above the bottom 400 px.'),
    x: z.number().min(-400).max(400).default(110),
  }).strict().default({scale: 1.1, y: 535, x: 110}).describe('Where the phone rests during the end card.'),
}).strict();

export const Block = z.discriminatedUnion('block', [Chaos, IconOpen, Reveal, TapFlow, Whip, Notification, StatCountUp, Skins, EndCard]);
export type BlockSpec = z.infer<typeof Block>;

/* ------------------------------------------------------------------ the whole spec */
export const Output = z.object({
  file: z.string().default('out/ad.mp4'),
  crf: z.number().int().min(10).max(30).default(18),
}).strict().default({file: 'out/ad.mp4', crf: 18});

export const Checks = z.object({
  wordsPerSecond: z.number().min(1).max(8).default(4).describe('Reading speed for the reading-time check: a median adult reads about 238 words a minute, about 4 a second.'),
  noticeSeconds: z.number().min(0).max(3).default(0.5).describe('Time to notice a title before reading it. Added to words / wordsPerSecond.'),
  appTextSeconds: z.number().min(0).max(5).default(1.2).describe('App text the story depends on (a camera push-in target) should stay still on screen this long.'),
  maxJump: z.number().min(1).max(255).default(10).describe('continuity check: the largest allowed sudden rise, in mean pixel change (0-255), from one frame pair to the next. A hard cut or a snap rises by 15-250 in one frame; a smooth move or fade builds up slowly.'),
  cuts: z.array(z.number().int().min(1)).default([]).describe('continuity check: frames where a hard cut is intended (the frame that shows the new picture). They are not reported.'),
}).strict().default({wordsPerSecond: 4, noticeSeconds: 0.5, appTextSeconds: 1.2, maxJump: 10, cuts: []});

export const AdSpec = z.object({
  meta: Meta.default({fps: 30, width: 1080, height: 1920}),
  brief: Brief,
  brand: Brand,
  capture: Capture,
  scenes: z.array(Block).min(1),
  sound: Sound.default({sounds: {}, cues: {}, mix: {loudness: {lufs: -14, truePeak: -1.5}, duckMusic: 0, musicGain: 0}, seed: 21}),
  output: Output,
  checks: Checks,
}).strict();

export type AdSpecInput = z.input<typeof AdSpec>;
export type Ad = z.infer<typeof AdSpec>;
export type Title = z.infer<typeof Title>;
export type CameraKey = z.infer<typeof CameraKey>;
