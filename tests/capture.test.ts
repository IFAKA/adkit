import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execSync} from 'node:child_process';
import {describe, expect, it} from 'vitest';
import {captureKey, mergeManifest, resolveSet, type Manifest} from '../src/capture';
import {AdSpec, CaptureStep} from '../src/spec/schema';

const base = () => ({
  brand: {name: 'Demo'},
  scenes: [{block: 'whip'}],
  capture: {
    app: {url: 'http://localhost:1234'},
    inputs: ['data.json'],
    sets: {main: {screens: [{name: 'home', steps: [{goto: '/'}]}]}},
  },
});
const parse = (mut?: (o: ReturnType<typeof base>) => void) => { const o = base(); mut?.(o); return AdSpec.parse(o); };

function tmpDir(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'adkit-cap-'));
  fs.writeFileSync(path.join(d, 'data.json'), '{"a":1}');
  return d;
}

describe('captureKey', () => {
  it('is stable for the same inputs', () => {
    const d = tmpDir();
    expect(captureKey(parse(), d)).toBe(captureKey(parse(), d));
    expect(captureKey(parse(), d)).toMatch(/^[0-9a-f]{64}$/);
  });
  it('changes when a step changes', () => {
    const d = tmpDir();
    const a = captureKey(parse(), d);
    const b = captureKey(parse((o) => { o.capture.sets.main.screens[0].steps = [{goto: '/other'}]; }), d);
    expect(a).not.toBe(b);
  });
  it('changes when an input file changes', () => {
    const d = tmpDir();
    const a = captureKey(parse(), d);
    fs.writeFileSync(path.join(d, 'data.json'), '{"a":2}');
    expect(captureKey(parse(), d)).not.toBe(a);
  });
  it('changes when an evaluate file changes', () => {
    const d = tmpDir();
    fs.writeFileSync(path.join(d, 'x.js'), '1');
    const spec = parse((o) => { o.capture.sets.main.screens[0].steps = [{evaluate: {file: 'x.js'}}] as never; });
    const a = captureKey(spec, d);
    fs.writeFileSync(path.join(d, 'x.js'), '2');
    expect(captureKey(spec, d)).not.toBe(a);
  });
  it('does not depend on key order in the spec', () => {
    const d = tmpDir();
    const x = parse();
    const y = AdSpec.parse({...base(), capture: {sets: base().capture.sets, inputs: ['data.json'], app: {url: 'http://localhost:1234'}}});
    expect(captureKey(x, d)).toBe(captureKey(y, d));
  });
});

describe('captureKey with the ad folder inside the app repo', () => {
  it('ignores edits in the ad folder but not in the app', () => {
    const app = fs.mkdtempSync(path.join(os.tmpdir(), 'adkit-app-'));
    const sh = (c: string) => execSync(c, {cwd: app, stdio: 'ignore'});
    fs.mkdirSync(path.join(app, 'ad'));
    fs.writeFileSync(path.join(app, 'index.html'), '<p>1</p>');
    fs.writeFileSync(path.join(app, 'ad', 'ad.yaml'), 'a: 1');
    sh('git init -q && git add . && git -c user.email=a@b -c user.name=t commit -qm x');
    const spec = AdSpec.parse({...base(), capture: {...base().capture, inputs: [], app: {dir: '..', start: 'x'}}});
    const d = path.join(app, 'ad');
    const a = captureKey(spec, d);
    fs.writeFileSync(path.join(d, 'ad.yaml'), 'a: 2');
    fs.writeFileSync(path.join(d, 'new.txt'), 'n');
    expect(captureKey(spec, d)).toBe(a);
    fs.writeFileSync(path.join(app, 'index.html'), '<p>2</p>');
    expect(captureKey(spec, d)).not.toBe(a);
  });
});

describe('captureKey with routes', () => {
  it('changes when a route file or its url changes', () => {
    const d = tmpDir();
    fs.writeFileSync(path.join(d, 'api.json'), '{"x":1}');
    const withRoute = (url = '**/api*') => parse((o) => { (o.capture as any).routes = [{url, file: 'api.json'}]; });
    const k0 = captureKey(withRoute(), d);
    expect(k0).not.toBe(captureKey(parse(), d));
    expect(captureKey(withRoute('**/other*'), d)).not.toBe(k0);
    fs.writeFileSync(path.join(d, 'api.json'), '{"x":2}');
    expect(captureKey(withRoute(), d)).not.toBe(k0);
  });
  it('defaults: json, status 200', () => {
    const r = (parse((o) => { (o.capture as any).routes = [{url: '**/a', file: 'a.json'}]; }).capture as any).routes[0];
    expect([r.contentType, r.status]).toEqual(['application/json', 200]);
  });
});

describe('step schema', () => {
  it('needs exactly one action', () => {
    expect(CaptureStep.safeParse({}).success).toBe(false);
    expect(CaptureStep.safeParse({goto: '/', click: 'a'}).success).toBe(false);
    expect(CaptureStep.safeParse({goto: '/'}).success).toBe(true);
  });
  it('rejects unknown keys and bad wait states', () => {
    expect(CaptureStep.safeParse({goto: '/', extra: 1}).success).toBe(false);
    expect(CaptureStep.safeParse({wait: {for: 'x', state: 'gone'}}).success).toBe(false);
  });
});

describe('sets', () => {
  it('merges env and setup of extended sets, parent first', () => {
    const s = parse((o) => {
      o.capture.sets = {
        main: {env: {A: '1'}, setup: ['one'], screens: []},
        v: {extends: 'main', env: {B: '2'}, setup: ['two'], screens: []},
      } as never;
    });
    const r = resolveSet(s.capture.sets, 'v');
    expect(r.env).toEqual({A: '1', B: '2'});
    expect(r.setup).toEqual(['one', 'two']);
  });
  it('detects extend loops', () => {
    const s = parse((o) => { o.capture.sets = {main: {extends: 'v', screens: []}, v: {extends: 'main', screens: []}} as never; });
    expect(() => resolveSet(s.capture.sets, 'v')).toThrow(/loop/);
  });
});

describe('mergeManifest', () => {
  const screen = (sha: string) => ({file: 'f', fullFile: 'g', fullHeight: 1, scrollY: 0, sha, elements: {}});
  const m = (sets: Manifest['sets']): Manifest => ({scale: 3, viewport: {w: 390, h: 844}, sets});
  const theme = {bg: '#fff', fg: '#000', accent: '#f00'};
  it('replaces one screen and keeps the others', () => {
    const a = m({main: {theme, screens: {home: screen('old'), cart: screen('keep')}}, teal: {theme, screens: {home: screen('t')}}});
    const out = mergeManifest(a, m({main: {theme, screens: {home: screen('new')}}}));
    expect(out.sets.main.screens.home.sha).toBe('new');
    expect(out.sets.main.screens.cart.sha).toBe('keep');
    expect(out.sets.teal.screens.home.sha).toBe('t');
    expect(a.sets.main.screens.home.sha).toBe('old');
  });
  it('adds a new set and works without a base', () => {
    const p = m({navy: {theme, screens: {home: screen('n')}}});
    expect(mergeManifest(undefined, p)).toEqual(p);
    expect(Object.keys(mergeManifest(m({main: {theme, screens: {}}}), p).sets)).toEqual(['main', 'navy']);
  });
});
