import {describe, expect, it} from 'vitest';
import {clone, load} from './helpers';
import {compile} from '../src/engine/compile';
import {cameraDeadStops, sameFrameStarts, evenStaggers} from '../src/engine/rules';
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
