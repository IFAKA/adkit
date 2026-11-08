import {describe, expect, it} from 'vitest';
import {clone, load} from './helpers';
import {compile} from '../src/engine/compile';
import {cameraDeadStops, sameFrameStarts, evenStaggers, actionReactions, flatBackgrounds, motionDensity} from '../src/engine/rules';
import type {Ad} from '../src/spec/schema';

/** The minimal example with a change to its spec, compiled again. */
const edit = (f: (s: Ad) => void) => {
  const {spec} = load('minimal');
  const s = clone(spec);
  f(s);
  return {spec: s, plan: compile(s)};
};
const flow = (s: Ad) => s.scenes.find((b) => b.block === 'tapFlow') as Extract<Ad['scenes'][number], {block: 'tapFlow'}>;

describe('camera-dead-stop', () => {
  const keys = (s: Ad, springA: string, atB: number) => {
    flow(s).camera = [
      {...flow(s).camera[0], at: 2, spring: springA as never},
      {...flow(s).camera[1], at: atB, spring: 'drift'},
    ];
  };
  it('flags a move that stops dead and waits before the next one', () => {
    const {spec, plan} = edit((s) => keys(s, 'fast', 6));
    const w = cameraDeadStops(plan, spec);
    expect(w).toHaveLength(1);
    expect(w[0]).toContain('zero speed');
  });
  it('accepts drift, or a next move that starts right after it settles', () => {
    let r = edit((s) => keys(s, 'drift', 6));
    expect(cameraDeadStops(r.plan, r.spec)).toEqual([]);
    r = edit((s) => keys(s, 'fast', 3));
    expect(cameraDeadStops(r.plan, r.spec)).toEqual([]);
  });
  it('flags a last move that stops while a later block goes on, but not a pull-out to the wide pose', () => {
    const r = edit((s) => { flow(s).camera = [{...flow(s).camera[0], at: 2}]; });
    const blocks = r.plan.blocks.slice(0, 2);
    const later = {...r.plan.blocks[1], id: 'later', kind: 'notification' as const, start: 300, end: 360};
    const plan = {...r.plan, blocks: [...blocks, later]};
    expect(cameraDeadStops(plan, r.spec)).toHaveLength(1);
    const w = edit((s) => { flow(s).camera = [{...flow(s).camera[0], at: 2, spring: 'drift'}, {...flow(s).camera[1], at: 6, zoom: 1, focus: {x: 195, dy: 0}}]; });
    expect(cameraDeadStops({...w.plan, blocks: [...w.plan.blocks.slice(0, 2), later]}, w.spec)).toEqual([]);
  });
  it('does not blame the moves the renderer adds itself', () => {
    const {spec, plan} = edit((s) => { flow(s).camera = []; });
    expect(cameraDeadStops(plan, spec)).toEqual([]);
  });
  it('can be turned off', () => {
    const {spec, plan} = edit((s) => { keys(s, 'fast', 6); s.checks.cameraDeadStop = false; });
    expect(cameraDeadStops(plan, spec)).toEqual([]);
  });
});

describe('same-frame-start', () => {
  const crowd = (s: Ad) => {
    const f = flow(s);
    f.titles = [{...f.titles[0], at: 1, markers: true}, f.titles[1]];
    f.steps.push({type: 'tap', at: 1, element: 'payButton', reaction: 'burst'} as never);
  };
  it('flags 3 or more titles, markers or reactions on one frame', () => {
    const {spec, plan} = edit(crowd);
    const w = sameFrameStarts(plan, spec);
    expect(w).toHaveLength(1);
    expect(w[0]).toContain('3 items start on frame 105');
  });
  it('ignores instant titles, and the shipped example', () => {
    expect(sameFrameStarts(edit(() => {}).plan, edit(() => {}).spec)).toEqual([]);
    const {spec, plan} = edit((s) => { crowd(s); flow(s).titles[0].instant = true; flow(s).titles[0].markers = false; });
    expect(sameFrameStarts(plan, spec)).toEqual([]);
  });
  it('can be turned off', () => {
    const {spec, plan} = edit((s) => { crowd(s); s.checks.sameFrameStart = false; });
    expect(sameFrameStarts(plan, spec)).toEqual([]);
  });
});

describe('even-stagger', () => {
  const words = (s: Ad, stagger?: number[]) => { flow(s).titles[0] = {...flow(s).titles[0], lines: ['one two three four five'], stagger}; };
  it('flags 4 or more words with an explicit equal gap', () => {
    const {spec, plan} = edit((s) => words(s, [4]));
    const w = evenStaggers(plan, spec);
    expect(w).toHaveLength(1);
    expect(w[0]).toContain('4 frames apart');
  });
  it('accepts uneven gaps, the default gap, and short titles', () => {
    for (const st of [[2, 4, 4], undefined]) {
      const r = edit((s) => words(s, st));
      expect(evenStaggers(r.plan, r.spec)).toEqual([]);
    }
    const r = edit((s) => { words(s, [4]); flow(s).titles[0].lines = ['one two three']; });
    expect(evenStaggers(r.plan, r.spec)).toEqual([]);
  });
  it('flags a pop step of 4 elements and can be turned off', () => {
    const pop = (s: Ad) => { flow(s).steps.push({type: 'pop', at: 6.5, elements: ['a', 'b', 'c', 'd'], stagger: 0.5, style: 'pin'} as never); s.sound.cues['pop-in'] = 'silent'; };
    const {spec, plan} = edit(pop);
    expect(evenStaggers(plan, spec)).toHaveLength(1);
    const o = edit((s) => { pop(s); s.checks.evenStagger = false; });
    expect(evenStaggers(o.plan, o.spec)).toEqual([]);
  });
});

describe('action-reaction', () => {
  const tapOf = (s: Ad, element: string) => flow(s).steps.find((x) => x.type === 'tap' && x.element === element) as {press: boolean; reaction: string};
  it('flags a tap with no press, reaction, screen change or check after it', () => {
    const {spec, plan} = edit(() => {});
    const w = actionReactions(plan, spec);
    expect(w).toHaveLength(1);
    expect(w[0]).toContain('"timeChip"');
  });
  it('accepts a press, a reaction option, or a screen change right after the tap', () => {
    for (const f of [(s: Ad) => { tapOf(s, 'timeChip').press = true; }, (s: Ad) => { tapOf(s, 'timeChip').reaction = 'ripple'; }, (s: Ad) => { flow(s).steps.push({type: 'screen', at: 8, screen: 'thanks'} as never); }]) {
      const r = edit(f);
      expect(actionReactions(r.plan, r.spec)).toEqual([]);
    }
  });
  it('skips blocks that show a recorded take', () => {
    const {spec, plan} = edit(() => {});
    expect(actionReactions(plan, spec, (ref) => ref === 'shop')).toEqual([]);
  });
  it('can be turned off', () => {
    const {spec, plan} = edit((s) => { s.checks.actionReaction = false; });
    expect(actionReactions(plan, spec)).toEqual([]);
  });
});

describe('flat-background', () => {
  it('flags a long scene on a background with no drift and no grain', () => {
    const {spec, plan} = edit((s) => { s.background = {drift: 0, grain: 0}; });
    const w = flatBackgrounds(plan, spec);
    expect(w.length).toBeGreaterThan(0);
    expect(w[0]).toContain('never moves');
  });
  it('does not flag the studio backdrop, a moving gradient, a scene-level override or a short scene', () => {
    expect(flatBackgrounds(edit(() => {}).plan, edit(() => {}).spec)).toEqual([]);
    expect(flatBackgrounds(edit((s) => { s.background = {drift: 0.2, grain: 0.7}; }).plan, edit((s) => { s.background = {drift: 0.2, grain: 0.7}; }).spec)).toEqual([]);
    const r = edit((s) => { s.background = {drift: 0, grain: 0}; s.scenes.forEach((b) => { b.background = {drift: 0, grain: 0.5}; }); });
    expect(flatBackgrounds(r.plan, r.spec)).toEqual([]);
    const q = edit((s) => { s.background = {drift: 0, grain: 0}; });
    expect(flatBackgrounds(q.plan, {...q.spec, checks: {...q.spec.checks, flatBackground: {frames: 1000}}})).toEqual([]);
  });
  it('can be turned off', () => {
    const {spec, plan} = edit((s) => { s.background = {drift: 0, grain: 0}; s.checks.flatBackground = false; });
    expect(flatBackgrounds(plan, spec)).toEqual([]);
  });
});

describe('motion-density', () => {
  const busy = (s: Ad) => { const tap = flow(s).steps.find((x) => x.type === 'tap' && x.element === 'timeChip') as {press: boolean; reaction: string}; tap.press = true; tap.reaction = 'burst'; };
  it('flags more elements than the limit starting within the window', () => {
    const {spec, plan} = edit((s) => { busy(s); s.checks.motionDensity = {max: 3, window: 10}; });
    const w = motionDensity(plan, spec);
    expect(w).toHaveLength(1);
    expect(w[0]).toContain('4 elements start to move within 10 frames from frame 203 (camera move, tap timeChip, press, burst)');
  });
  it('accepts the same plan at the default limit, the shipped example, and off', () => {
    const r = edit(busy);
    expect(motionDensity(r.plan, r.spec)).toEqual([]);
    expect(motionDensity(edit(() => {}).plan, edit(() => {}).spec)).toEqual([]);
    const o = edit((s) => { busy(s); s.checks.motionDensity = false; });
    expect(motionDensity(o.plan, o.spec)).toEqual([]);
  });
});
