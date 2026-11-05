import {describe, expect, it} from 'vitest';
import {AdSpec} from '../src/spec/schema';
import {compile} from '../src/engine/compile';
import {load} from './helpers';

/** The minimal example with the steps of its tapFlow block replaced. */
const withSteps = (steps: unknown[]) => {
  const raw = structuredClone(load('minimal').spec) as any;
  raw.scenes[1].steps = steps;
  return raw;
};
const cuesOf = (steps: unknown[]) => compile(AdSpec.parse(withSteps(steps))).cues.filter((c) => c.block === 'order');

describe('new tapFlow steps', () => {
  it('pop: one pop cue per element, half a beat apart, on the grid', () => {
    const cues = cuesOf([{type: 'pop', at: 1, elements: ['productCard', 'addButton', 'cartIcon']}]).filter((c) => c.role === 'pop-in');
    expect(cues.map((c) => c.frame - cues[0].frame)).toEqual([0, 7, 15]);
    for (const c of cues) expect([0, 7]).toContain(c.frame % 15);
  });

  it('type: a tick cue every half beat', () => {
    const cues = cuesOf([{type: 'type', at: 2, element: 'timeChip', text: 'hello', beats: 2}]).filter((c) => c.role === 'type-tick');
    expect(cues.length).toBe(4);
    expect(cues[0].kind).toBe('tick');
    for (const c of cues) expect([0, 7]).toContain(c.frame % 15);
  });

  it('pulse: one ping per ring, one beat apart', () => {
    const cues = cuesOf([{type: 'pulse', at: 1, element: 'payButton', count: 3}]).filter((c) => c.role === 'pulse');
    expect(cues.map((c) => c.frame - cues[0].frame)).toEqual([0, 15, 30]);
  });

  it('swipe: a whoosh as long as the swipe', () => {
    const c = cuesOf([{type: 'swipe', at: 1, from: 'productCard', to: 'cartIcon', beats: 2, scroll: 200}]).find((x) => x.role === 'swipe')!;
    expect(c.kind).toBe('whoosh');
    expect(c.dur).toBe(30);
    expect(c.frame % 15).toBe(0);
  });

  it('screen transitions: sheet whooshes, the others swap; unknown names are rejected', () => {
    const cues = cuesOf([
      {type: 'screen', at: 1, screen: 'shop', transition: 'sheet'},
      {type: 'screen', at: 3, screen: 'checkout', transition: 'fade'},
    ]);
    expect(cues.find((c) => c.name === 'order:screen-1')!.role).toBe('sheet-up');
    expect(cues.find((c) => c.name === 'order:screen-2')!.role).toBe('screen-swap');
    expect(AdSpec.safeParse(withSteps([{type: 'screen', at: 1, screen: 'shop', transition: 'wipe'}])).success).toBe(false);
    expect(AdSpec.safeParse(withSteps([{type: 'screen', at: 1, screen: 'shop', slide: false}])).success).toBe(false);
  });

  it('rejects a stagger or a swipe length that is off the half-beat grid', () => {
    expect(AdSpec.safeParse(withSteps([{type: 'pop', at: 1, elements: ['a'], stagger: 0.3}])).success).toBe(false);
    expect(AdSpec.safeParse(withSteps([{type: 'swipe', at: 1, from: 'a', to: 'b', beats: 0.2}])).success).toBe(false);
  });
});

describe('chaos block', () => {
  it('accepts every look and counter:false, and rejects an item with both beat and frame', () => {
    const raw = structuredClone(load('horno-lento').spec) as any;
    for (const look of ['bubbles', 'cards', 'tabs', 'toasts']) {
      raw.scenes[0].look = look;
      raw.scenes[0].counter = false;
      expect(AdSpec.safeParse(raw).success, look).toBe(true);
    }
    raw.scenes[0].items[0] = {text: 'x', beat: 1, frame: 3};
    expect(AdSpec.safeParse(raw).success).toBe(false);
  });
});

describe('brand icon image and end card note', () => {
  const spec = () => structuredClone(load('minimal').spec) as any;
  it('accepts a png or svg icon path and a short note', () => {
    const s = spec();
    s.brand.icon.image = 'assets/icon.png';
    s.scenes.at(-1).note = 'free, no sign-up';
    expect(AdSpec.safeParse(s).success).toBe(true);
    s.brand.icon.image = 'assets/icon.svg';
    expect(AdSpec.safeParse(s).success).toBe(true);
  });
  it('rejects other image types and a long note', () => {
    const s = spec();
    s.brand.icon.image = 'assets/icon.jpg';
    expect(AdSpec.safeParse(s).success).toBe(false);
    s.brand.icon.image = undefined;
    s.scenes.at(-1).note = 'x'.repeat(61);
    expect(AdSpec.safeParse(s).success).toBe(false);
  });
});
