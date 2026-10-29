import type {Ad, BlockSpec, Title} from '../spec/schema';

export type CueKind = 'cut' | 'title' | 'tap' | 'pop' | 'whoosh' | 'hit' | 'chime' | 'ping' | 'riser' | 'swap';

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
  beat: number; // frames per beat
  bar: number; // frames per bar
  total: number;
  width: number;
  height: number;
  blocks: Placed[];
  cues: Cue[];
  titles: PlacedTitle[];
  sections: Section[];
};

export type PlanForAudio = {
  fps: number; bpm: number; totalFrames: number; durationSeconds: number; bars: number;
  cues: Cue[]; sections: Section[]; sound: Ad['sound'];
};
