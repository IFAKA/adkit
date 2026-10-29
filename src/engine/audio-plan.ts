import type {Ad} from '../spec/schema';
import type {Plan, PlanForAudio} from './plan';

/** The small JSON file the Python audio engine reads. Its hash is the audio cache key. */
export function audioPlan(spec: Ad, plan: Plan): PlanForAudio {
  return {
    fps: plan.fps,
    bpm: plan.bpm,
    totalFrames: plan.total,
    durationSeconds: +(plan.total / plan.fps).toFixed(4),
    bars: plan.total / plan.bar,
    cues: plan.cues,
    sections: plan.sections,
    sound: spec.sound,
  };
}
