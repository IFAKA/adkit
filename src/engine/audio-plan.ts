import type {Ad} from '../spec/schema';
import type {Plan, PlanForAudio} from './plan';

/** The small JSON file the Python audio engine reads. Its hash is the audio cache key. Cues without a sound are not in it. */
export function audioPlan(spec: Ad, plan: Plan): PlanForAudio {
  return {
    fps: plan.fps,
    bpm: plan.bpm,
    meter: plan.meter,
    totalFrames: plan.total,
    durationSeconds: +(plan.total / plan.fps).toFixed(4),
    bars: plan.total / plan.bar,
    music: spec.sound.music,
    sounds: spec.sound.sounds,
    placements: plan.placements,
    mix: spec.sound.mix,
    seed: spec.sound.seed,
  };
}
