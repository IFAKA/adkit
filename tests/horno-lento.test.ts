import {describe, expect, it} from 'vitest';
import {load} from './helpers';
import {readingRows} from '../src/engine/reading';
import {cameraDeadStops, sameFrameStarts, evenStaggers, flatBackgrounds, motionDensity} from '../src/engine/rules';

/** The horno-lento example compiles without a capture; its pacing must pass the plan-level checks. */
describe('examples/horno-lento pacing', () => {
  const {spec, plan} = load('horno-lento');
  it('every title stays visible long enough to be read', () => {
    expect(readingRows(plan, spec).filter((r) => !r.ok)).toEqual([]);
  });
  it('no title enters while the one before it is still fading out', () => {
    const ts = [...plan.titles].sort((a, b) => a.inAt - b.inAt);
    ts.forEach((a, i) => {
      const end = a.outAt !== undefined ? a.outAt + 8 : a.until;
      for (const c of ts.slice(i + 1)) expect(c.inAt).toBeGreaterThanOrEqual(end);
    });
  });
  it('the motion rules stay clean', () => {
    expect([...cameraDeadStops(plan, spec), ...sameFrameStarts(plan, spec), ...evenStaggers(plan, spec), ...flatBackgrounds(plan, spec), ...motionDensity(plan, spec)]).toEqual([]);
  });
});
