import {describe, expect, it} from 'vitest';
import {AdSpec} from '../src/spec/schema';
import {compile, CompileError} from '../src/engine/compile';
import {CUE_KINDS, CUE_ROLES} from '../src/engine/cue-roles';
import {nearbyBpm} from '../src/engine/meter';
import {clone, load} from './helpers';

/** The minimal example with every cue silent, so a test can add the one thing it checks. */
function quiet(mut?: (raw: any) => void) {
  const raw = clone(load('minimal').spec) as any;
  raw.sound.cues = {};
  for (const k of CUE_KINDS) raw.sound.cues[k] = 'silent';
  mut?.(raw);
  return AdSpec.parse(raw);
}
/** Only the first scene, two bars long, so a meter test does not depend on the rest of the example. */
const oneScene = (raw: any) => { raw.scenes = [{...raw.scenes[0], bars: 2}]; raw.meta.bars = 2; };

describe('meter', () => {
  it('3/4 at 180 bpm gives 10 frames per beat and 30 frames per bar', () => {
    const spec = quiet((raw) => {
      raw.sound.music.bpm = 180;
      raw.sound.music.meter = {beats: 3, unit: 4};
      oneScene(raw);
    });
    const plan = compile(spec);
    expect(plan.bar).toBe(30);
    expect(plan.meter).toEqual({beats: 3, unit: 4});
    for (const c of plan.cues) expect([0, 5], c.name).toContain(c.frame % 10);
  });

  it('6/8 counts dotted quarters: 60 bpm is 10 frames per eighth', () => {
    const spec = quiet((raw) => {
      raw.sound.music.bpm = 60;
      raw.sound.music.meter = {beats: 6, unit: 8};
      oneScene(raw);
    });
    expect(compile(spec).bar).toBe(60);
  });

  it('a bpm that is not a whole number of frames fails and lists nearby bpm', () => {
    const spec = quiet((raw) => { raw.sound.music.bpm = 125; });
    expect(() => compile(spec)).toThrow(/whole number[\s\S]*Valid BPM near 125: [\d, ]+/);
    expect(nearbyBpm(30, 125, 4, 4)).toContain(120);
  });
});

describe('genericness check', () => {
  it('passes the three examples with no fails', () => {
    for (const ex of ['minimal', 'horno-lento', 'steps']) expect(() => load(ex), ex).not.toThrow();
  });

  it('fails compile on an unmapped cue', () => {
    const spec = quiet((raw) => { delete raw.sound.cues.tap; delete raw.sound.cues.pop; });
    expect(() => compile(spec)).toThrow(CompileError);
    expect(() => compile(spec)).toThrow(/sound: .*no sound/i);
  });

  it('fails on a sound with a short meaning', () => {
    const spec = quiet((raw) => { raw.sound.sounds.bag_thump.meaning = 'thump'; });
    expect(() => compile(spec)).toThrow(/meaning/);
  });

  it('fails on missing music', () => {
    const spec = quiet((raw) => { delete raw.sound.music; });
    expect(() => compile(spec)).toThrow(/music/);
  });

  it('fails when a cue points at an old palette name that is not defined', () => {
    const spec = quiet((raw) => { raw.sound.cues.tap = 'payment_ding'; });
    expect(() => compile(spec)).toThrow(/payment_ding/);
  });

  it('warns when two roles share a sound without a reason, and not with one', () => {
    const name = Object.keys(quiet().sound.sounds)[0];
    const two = (extra: object) => quiet((raw) => { raw.sound.cues.tap = name; raw.sound.cues.pop = {sound: name, ...extra}; });
    const w = compile(two({})).soundWarnings.join('\n');
    expect(w).toMatch(/used for tap and pop/);
    expect(compile(two({reason: 'both are the same cup being set down'})).soundWarnings.join('\n')).not.toMatch(/used for tap and pop/);
  });

  it('knows every role the compiler emits', () => {
    for (const ex of ['minimal', 'horno-lento', 'steps']) for (const c of load(ex).plan.cues) expect(CUE_ROLES, `${ex} ${c.role}`).toHaveProperty(c.role);
  });
});
