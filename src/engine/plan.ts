import type {Ad, BlockSpec, Title} from '../spec/schema';

export type CueKind = 'cut' | 'title' | 'tap' | 'pop' | 'whoosh' | 'hit' | 'chime' | 'ping' | 'riser' | 'swap' | 'tick';

/** One sound/picture event on the beat grid. `role` says what it means (the audio mix maps roles to sounds). */
export type Cue = {
  name: string; // unique, "<block id>:<what>"
  frame: number;
  seconds: number;
  kind: CueKind;
  role: string;
  block: string;
  dur?: number; // frames
  durationSeconds?: number;
  strong?: boolean; // title cues that get a sound
  pan?: number;
};

export type Placed = {
  index: number;
  id: string;
  kind: BlockSpec['block'];
  start: number; // first frame
  end: number; // first frame after the block
  spec: BlockSpec;
  /** absolute frames of the moments inside the block that the renderer needs */
  a: Record<string, number>;
};

export type PlacedTitle = {
  block: string;
  index: number;
  spec: Title;
  inAt: number;
  outAt?: number;
  /** last frame the title may be on screen if outAt is missing */
  until: number;
};

export type Section = {role: 'chaos' | 'breath' | 'drop' | 'groove' | 'lift' | 'swaps' | 'final'; startFrame: number; endFrame: number; startSeconds: number; endSeconds: number; block?: string};

export type Plan = {
  fps: number;
  bpm: number;
  meter: {beats: number; unit: 4 | 8}; // beats per bar and the unit note (3/4: beats 3, unit 4; 6/8: beats 6, unit 8)
  beat: number; // frames per beat (one unit note: a quarter in x/4, an eighth in x/8)
  bar: number; // frames per bar
  total: number;
  width: number;
  height: number;
  blocks: Placed[];
  cues: Cue[];
  titles: PlacedTitle[];
  sections: Section[];
  /** cues with the sound the sound map gave them */
  placements: Placement[];
  /** warnings from the genericness check (they do not stop the build) */
  soundWarnings: string[];
};

/** One cue with the sound the sound map gave it. */
export type Placement = {
  cue: string; role: string; key: string; sound: string; seconds: number; durationSeconds?: number;
  gain: number; pan?: number; duck?: number; variations: number; align: 'start' | 'end';
};

/** The JSON the Python audio engine reads. Its hash is the audio cache key. */
export type PlanForAudio = {
  fps: number; bpm: number; meter: {beats: number; unit: number}; totalFrames: number; durationSeconds: number; bars: number;
  music: unknown; sounds: Record<string, unknown>; placements: Placement[];
  mix: Ad['sound']['mix']; seed: number;
};
