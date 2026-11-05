import type {CueKind} from './plan';

/** Every cue role the compiler emits, its kind, and when it happens. A sound map (`sound.cues`) is keyed by cue name (block:cue), role or kind. */
export const CUE_ROLES: Record<string, {kind: CueKind; what: string; optional?: boolean}> = {
  cut: {kind: 'cut', what: 'hard cut at the start of every block', optional: true},
  'title-in': {kind: 'title', what: 'a title appears (needs a sound only for the first title of a phone block, "strong")', optional: true},
  'title-out': {kind: 'title', what: 'a title leaves', optional: true},
  'riser-chaos': {kind: 'riser', what: 'chaos block: the build-up over the whole block (has a duration)'},
  ping: {kind: 'ping', what: 'chaos block: an item arrives'},
  'bubble-pop': {kind: 'pop', what: 'chaos block: the pile bursts or collapses (3 cues)'},
  'icon-morph': {kind: 'swap', what: 'iconOpen: the pile turns into the app icon'},
  drop: {kind: 'hit', what: 'reveal: the first beat of the phone scene'},
  'app-open': {kind: 'whoosh', what: 'reveal: the phone rises in'},
  'screen-swap': {kind: 'swap', what: 'the app screen changes'},
  'sheet-up': {kind: 'whoosh', what: 'tapFlow: a sheet slides up'},
  'pop-in': {kind: 'pop', what: 'tapFlow pop step: an element pops out'},
  'type-tick': {kind: 'tick', what: 'tapFlow type step: one character group typed (every half beat)'},
  pulse: {kind: 'ping', what: 'tapFlow pulse step: an element pulses'},
  swipe: {kind: 'whoosh', what: 'tapFlow swipe step'},
  tap: {kind: 'tap', what: 'a finger taps an element (pan from the step)'},
  lift: {kind: 'pop', what: 'tapFlow: an element lifts off the page'},
  fly: {kind: 'whoosh', what: 'tapFlow: the lifted element flies away (2 beats)'},
  badge: {kind: 'pop', what: 'tapFlow: a count badge appears'},
  paid: {kind: 'chime', what: 'tapFlow check step: the success tick'},
  'whip-out': {kind: 'whoosh', what: 'whip: the old scene leaves'},
  'whip-spin': {kind: 'whoosh', what: 'whip: the spin into the next scene (2 beats)'},
  notification: {kind: 'chime', what: 'notification: the banner slides in'},
  'order-lands': {kind: 'pop', what: 'notification: the new item lands in the list'},
  count: {kind: 'ping', what: 'statCountUp: the number counts up (has a duration)'},
  'count-done': {kind: 'chime', what: 'statCountUp: the number arrives'},
  'bars-riser': {kind: 'riser', what: 'statCountUp: the chart bars grow (2 beats)'},
  'skin-swap': {kind: 'swap', what: 'skins: the look changes to the next variant'},
  macro: {kind: 'whoosh', what: 'camera move with `whoosh: true`'},
  'cta-whoosh': {kind: 'whoosh', what: 'endCard: the end card enters (2 beats)'},
  lockup: {kind: 'pop', what: 'endCard: the brand lockup lands'},
  contact: {kind: 'title', what: 'endCard: the contact line appears'},
  'final-hit': {kind: 'hit', what: 'endCard: the last beat'},
};

export const CUE_KINDS: CueKind[] = ['cut', 'title', 'tap', 'pop', 'whoosh', 'hit', 'chime', 'ping', 'riser', 'swap', 'tick'];

/** Names of the fixed palette the engine had before sound became data. They are no longer built in. */
export const OLD_PALETTE = ['tap', 'tick', 'pop', 'swap', 'shimmer', 'bag_swish', 'payment_ding', 'order_bell', 'receipt_chatter', 'ping', 'hit', 'whoosh', 'rise'];
