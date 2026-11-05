import type {Ad} from '../spec/schema';

export type MeterInfo = {
  bpm: number;
  beats: number; // beats per bar
  unit: 4 | 8;
  /** seconds per beat (the unit note: a quarter for x/4, an eighth for x/8) */
  beatSeconds: number;
  /** frames per beat; always a whole number */
  beatFrames: number;
};

type MusicLike = {bpm?: number; meter?: {beats?: number; unit?: number; bpm_counts?: string}} | undefined;

/** Seconds per beat the same way audio/score.py counts them: bpm = quarters for x/4, dotted quarters for 6/8, 9/8, 12/8. */
function secondsPerBeat(bpm: number, beats: number, unit: number, counts?: string): number {
  const group = (counts ?? (unit === 8 && beats % 3 === 0 ? 'group' : 'unit')) === 'group';
  return 60 / bpm / (unit === 8 && group ? 3 : 1);
}

/** The valid bpm values (frames per beat is a whole number >= 4) nearest to `bpm`. */
export function nearbyBpm(fps: number, bpm: number, beats: number, unit: number, counts?: string): number[] {
  const div = 60 / bpm / secondsPerBeat(bpm, beats, unit, counts); // 3 for a grouped x/8 meter, else 1
  const all: number[] = [];
  for (let bf = 4; bf <= 240; bf++) all.push(+(60 / ((bf / fps) * div)).toFixed(2));
  return all.sort((a, b) => Math.abs(a - bpm) - Math.abs(b - bpm)).slice(0, 4).sort((a, b) => a - b);
}

export function resolveMeter(spec: Ad): {meter: MeterInfo | null; problems: string[]} {
  const problems: string[] = [];
  const music = spec.sound.music as MusicLike;
  const fps = spec.meta.fps;
  const bpm = music?.bpm ?? spec.meta.bpm;
  if (bpm === undefined) {
    return {meter: null, problems: ['sound.music is missing: the beat grid comes from the music (bpm and meter) and there is no default song. Write sound.music (see README, "Sound").']};
  }
  if (spec.meta.bpm !== undefined && music?.bpm !== undefined && spec.meta.bpm !== music.bpm) problems.push(`meta.bpm ${spec.meta.bpm} differs from sound.music.bpm ${music.bpm}: remove meta.bpm (the music sets the tempo)`);
  const beats = music?.meter?.beats ?? 4;
  const unit = (music?.meter?.unit ?? 4) as 4 | 8;
  const counts = music?.meter?.bpm_counts;
  const beatSeconds = secondsPerBeat(bpm, beats, unit, counts);
  const bf = beatSeconds * fps;
  const ok = Math.abs(bf - Math.round(bf)) < 1e-6 && Math.round(bf) >= 4;
  if (!ok) {
    const near = nearbyBpm(fps, bpm, beats, unit, counts);
    problems.push(`meter ${beats}/${unit} at ${bpm} BPM and ${fps} fps gives ${+bf.toFixed(3)} frames per beat; it must be a whole number of at least 4. Valid BPM near ${bpm}: ${near.join(', ')} (or change fps)`);
  }
  return {meter: {bpm, beats, unit, beatSeconds, beatFrames: Math.round(bf)}, problems};
}
