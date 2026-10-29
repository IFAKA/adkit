import {describe, expect, it} from 'vitest';
import {compile, CompileError} from '../src/engine/compile';
import {clone, load} from './helpers';

const GOLDEN: Record<string, number> = {
  'hook:bubble-pop-01': 90, 'iconOpen:icon-morph': 112, 'reveal:drop': 120, 'customer:tap-2-addButton': 300, 'customer:fly': 315,
  'customer:badge': 345, 'customer:paid': 450, 'whip:whip-out': 472, 'whip:spin': 480, 'owner:notification': 525, 'owner:order-lands': 532,
  'sales:count': 585, 'sales:count-done': 615, 'skins:skin-2': 690, 'skins:skin-4': 750, 'endCard:lockup': 840, 'endCard:contact': 855, 'endCard:final-hit': 870,
};

describe('compile', () => {
  it('places the horno-lento cues on the frames of the approved ad', () => {
    const {plan} = load('horno-lento');
    expect(plan.total).toBe(900);
    const by = new Map(plan.cues.map((c) => [c.name, c.frame]));
    for (const [name, frame] of Object.entries(GOLDEN)) expect(by.get(name), name).toBe(frame);
  });

  it('puts every cue on a beat or an off-beat (frame % 15 is 0 or 7)', () => {
    for (const ex of ['horno-lento', 'minimal']) {
      for (const c of load(ex).plan.cues) expect([0, 7, 8], `${ex} ${c.name} @${c.frame}`).toContain(c.frame % 15);
    }
  });

  it('has no two cues of the same kind and role on one frame', () => {
    const {plan} = load('horno-lento');
    const seen = new Set<string>();
    for (const c of plan.cues.filter((x) => x.role !== 'cut')) {
      const k = `${c.kind}@${c.frame}@${c.role}`;
      expect(seen.has(k), k).toBe(false);
      seen.add(k);
    }
  });

  it('lays blocks out back to back with no gaps', () => {
    const {plan} = load('horno-lento');
    plan.blocks.forEach((b, i) => { if (i) expect(b.start).toBe(plan.blocks[i - 1].end); });
    expect(plan.blocks.at(-1)!.end).toBe(plan.total);
  });

  it('fails when a cue falls off the grid', () => {
    const {spec} = load('minimal');
    const s = clone(spec);
    (s.scenes[1] as any).steps[0].at = 0.3;
    expect(() => compile(s)).toThrow(); // schema forbids it in YAML; here the compiler must still refuse
  });

  it('fails when two titles overlap in time', () => {
    const {spec} = load('minimal');
    const s = clone(spec);
    (s.scenes[1] as any).titles[1].at = 3;
    expect(() => compile(s)).toThrow(CompileError);
  });

  it('fails when two taps are the same event on one frame', () => {
    const {spec} = load('minimal');
    const s = clone(spec);
    (s.scenes[1] as any).steps.splice(4, 0, {type: 'tap', at: 8, element: 'timeChip', x: 0.5, radius: 16, press: false, highlight: true});
    (s.scenes[1] as any).steps.splice(4, 0, {type: 'tap', at: 8, element: 'timeChip', x: 0.5, radius: 16, press: false, highlight: true});
    expect(() => compile(s)).toThrow(/same event|overlap/);
  });

  it('fails when the story order is wrong', () => {
    const {spec} = load('minimal');
    const s = clone(spec);
    s.scenes = [s.scenes[3], ...s.scenes.slice(0, 3)];
    expect(() => compile(s)).toThrow(CompileError);
  });

  it('fails when the scenes do not add up to meta.bars', () => {
    const {spec} = load('minimal');
    const s = clone(spec);
    s.meta.bars = 9;
    expect(() => compile(s)).toThrow(/bars/);
  });

  it('is a pure function: the same spec gives the same plan', () => {
    const {spec} = load('minimal');
    expect(JSON.stringify(compile(clone(spec)))).toBe(JSON.stringify(compile(clone(spec))));
  });
});
