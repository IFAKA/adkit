import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {AdSpec} from '../src/spec/schema';
import {loadSpec, SpecError} from '../src/spec/load';
import {ROOT, load} from './helpers';
import os from 'node:os';

describe('schema', () => {
  it('accepts both examples', () => {
    expect(load('horno-lento').spec.scenes.length).toBeGreaterThan(5);
    expect(load('minimal').spec.scenes.length).toBe(4);
  });

  it('rejects an unknown block with a clear path', () => {
    const r = AdSpec.safeParse({scenes: [{block: 'nope', bars: 1}], brand: {name: 'x', contact: 'y'}, capture: {app: {}, sets: {main: {}}}});
    expect(r.success).toBe(false);
  });

  it('rejects lengths that are not a whole beat', () => {
    const { spec } = load('minimal');
    const bad = structuredClone(spec) as any;
    bad.scenes[0].bars = 1.3;
    const r = AdSpec.safeParse(bad);
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain('multiple of 0.25');
  });

  it('rejects unknown keys (typos) instead of ignoring them', () => {
    const { spec } = load('minimal');
    const bad = structuredClone(spec) as any;
    bad.scenes[0].tittle = 'x';
    expect(AdSpec.safeParse(bad).success).toBe(false);
  });

  it('reports file:line for a broken YAML value', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adkit-spec-'));
    const src = fs.readFileSync(path.join(ROOT, 'examples/minimal/ad.yaml'), 'utf8').replace('bars: 1.5\n    screen: home\n    open: rise', 'bars: seven\n    screen: home\n    open: rise');
    fs.writeFileSync(path.join(dir, 'ad.yaml'), src);
    fs.copyFileSync(path.join(ROOT, 'examples/minimal/capture.yaml'), path.join(dir, 'capture.yaml'));
    try { loadSpec(path.join(dir, 'ad.yaml'), {}); throw new Error('should fail'); } catch (e) {
      expect(e).toBeInstanceOf(SpecError);
      expect((e as Error).message).toMatch(/ad\.yaml:\d+/);
    }
  });

  it('keeps the committed JSON Schema in sync with the zod schema', async () => {
    const {z} = await import('zod');
    const committed = JSON.parse(fs.readFileSync(path.join(ROOT, 'schema/ad.schema.json'), 'utf8'));
    const fresh = JSON.parse(JSON.stringify(z.toJSONSchema(AdSpec, {io: 'input'})));
    expect(Object.keys(committed.properties)).toEqual(Object.keys(fresh.properties));
  });

  it('interpolates ${VAR:-default} from the environment', () => {
    const a = loadSpec(path.join(ROOT, 'examples/horno-lento/ad.yaml'), {}).spec.capture.app.dir;
    const b = loadSpec(path.join(ROOT, 'examples/horno-lento/ad.yaml'), {APP_DIR: '/somewhere/else'}).spec.capture.app.dir;
    expect(a).toContain('sasha');
    expect(b).toBe('/somewhere/else');
  });
});
