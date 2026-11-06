import {createHash} from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {shootSet} from '../src/capture/shoot';
import {AdSpec} from '../src/spec/schema';
import {smoothness} from '../src/engine/continuity';

// A page with a CSS transition (the box slides 0 -> 120 px in 300 ms) and a requestAnimationFrame counter.
const PAGE = `<html><head><meta name=viewport content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#fff"><div id=b style="position:absolute;left:0;top:0;width:60px;height:60px;background:#d00;transition:left 300ms linear"></div>
<button id=go style="position:absolute;left:10px;top:200px" onclick="document.getElementById('b').style.left='120px'">go</button></body></html>`;

describe('record: the real animation as a frame sequence', () => {
  it('steps a CSS transition one frame at a time, in order, and repeats', async () => {
    const srv = http.createServer((_q, r) => { r.setHeader('content-type', 'text/html'); r.end(PAGE); });
    await new Promise<void>((ok) => srv.listen(0, ok));
    const port = (srv.address() as {port: number}).port;
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'adkit-rec-'));
    const spec = AdSpec.parse({
      brand: {name: 'T'}, scenes: [{block: 'whip'}],
      capture: {app: {url: `http://localhost:${port}`}, viewport: {width: 200, height: 300, scale: 1}, sets: {main: {screens: [
        {name: 'slide', settleMs: 100, steps: [{goto: '/'}, {record: {click: '#go', elements: {go: '#go'}, before: 3, frames: 9, fps: 30}}]},
      ]}}},
    });
    const run = async () => {
      const dir = fs.mkdtempSync(path.join(out, 'r-'));
      const e = await shootSet({cap: spec.capture, specDir: dir, setName: 'main', screens: spec.capture.sets.main.screens, accent: '#d00', base: `http://localhost:${port}`, outDir: dir, logsDir: dir, log: () => {}, detail: () => {}});
      return {dir, e};
    };
    const a = await run();
    const fr = a.e.screens.slide.frames!;
    expect(fr.length).toBe(12); // 3 still + 9 recorded
    expect(new Set(fr).size).toBe(10); // the 3 stills are one file
    expect(a.e.screens.slide.elements.go).toBeTruthy(); // measured before the action
    // the red box moves right, evenly, frame after frame: find its right edge in each recorded frame
    const {execFileSync} = await import('node:child_process');
    const edgesOf = (r: {dir: string; e: typeof a.e}) => r.e.screens.slide.frames!.slice(3).map((f) => {
      const raw = execFileSync('magick', [path.join(r.dir, 'main', f.replace('captures/main/', '')), '-crop', '200x30+0+0', '-depth', '8', 'rgb:-'], {maxBuffer: 1e7});
      let last = -1; for (let x = 0; x < 200; x++) if (raw[x * 3] > 180 && raw[x * 3 + 1] < 60) last = x; return last;
    });
    const xs = edgesOf(a);
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1]); // moves every frame, in order
    expect(xs[0]).toBeGreaterThan(59); // frame 1 is already moving
    expect(xs[xs.length - 1]).toBeLessThan(200);
    // repeatable: a second run gives exactly the same positions
    expect(edgesOf(await run())).toEqual(xs);
    srv.close();
  }, 120000);
});

describe('live transition in the spec', () => {
  it('accepts record steps and transition live, and refuses a record step with other keys', () => {
    const ok = AdSpec.safeParse({brand: {name: 'T'}, scenes: [{block: 'tapFlow', bars: 1, start: {screen: 'a', transition: 'live'}, steps: [{type: 'screen', at: 0, screen: 'b', transition: 'live'}]}],
      capture: {app: {url: 'http://x'}, sets: {main: {screens: [{name: 'a', steps: [{goto: '/'}]}, {name: 'b', steps: [{record: {click: '#x', frames: 12}}]}]}}}});
    expect(ok.success).toBe(true);
    const bad = AdSpec.safeParse({brand: {name: 'T'}, scenes: [{block: 'whip'}], capture: {app: {url: 'http://x'}, sets: {main: {screens: [{name: 'b', steps: [{record: {click: '#x'}, wait: 5}]}]}}}});
    expect(bad.success).toBe(false);
  });
});

describe('slow recording and the live-smooth measure', () => {
  it('slow 0.5 advances the page clock half as far per frame (real in-between states, no blending)', async () => {
    const srv = http.createServer((_q, r) => { r.setHeader('content-type', 'text/html'); r.end(PAGE); });
    await new Promise<void>((ok) => srv.listen(0, ok));
    const port = (srv.address() as {port: number}).port;
    const {execFileSync} = await import('node:child_process');
    const rec = async (slow: number) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adkit-slow-'));
      const spec = AdSpec.parse({brand: {name: 'T'}, scenes: [{block: 'whip'}],
        capture: {app: {url: `http://localhost:${port}`}, viewport: {width: 200, height: 300, scale: 1}, sets: {main: {screens: [
          {name: 'slide', settleMs: 100, steps: [{goto: '/'}, {record: {click: '#go', before: 0, frames: 4, slow}}]}]}}}});
      const e = await shootSet({cap: spec.capture, specDir: dir, setName: 'main', screens: spec.capture.sets.main.screens, accent: '#d00', base: `http://localhost:${port}`, outDir: dir, logsDir: dir, log: () => {}, detail: () => {}});
      return e.screens.slide.frames!.slice(-4).map((f) => {
        const raw = execFileSync('magick', [path.join(dir, 'main', f.replace('captures/main/', '')), '-crop', '200x30+0+0', '-depth', '8', 'rgb:-'], {maxBuffer: 1e7});
        let last = -1; for (let x = 0; x < 200; x++) if (raw[x * 3] > 180 && raw[x * 3 + 1] < 60) last = x; return last;
      });
    };
    const full = await rec(1), half = await rec(0.5);
    // linear 0 -> 120 px in 300 ms: frame k is at 60 + 120 * (k*33.3*slow/300) px (right edge)
    expect(full[3] - full[0]).toBeGreaterThan(2 * (half[3] - half[0]) - 6);
    expect(half[3]).toBeLessThan(full[1] + 2); // 4 slow frames = 2 real frames
    // the first recorded frame is one step in (about 7 px at slow 0.5, 60 + 120 * 16.7 / 300), not the real time the screenshot and the round trips took
    expect(half[0]).toBeLessThan(60 + 7 + 8);
    srv.close();
  }, 120000);

  it('smoothness: a one-frame jump is a spike, a long ease is not', () => {
    expect(smoothness([30, 0.1, 0]).spike).toBeGreaterThan(0.9);
    const ease = smoothness([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    expect(ease.spike).toBeLessThan(0.3);
    expect(ease.motionFrames).toBe(10);
    expect(smoothness([10, 7.7, 6, 4.8, 3.4, 2.3, 1.5, 0.2, 0]).motionFrames).toBe(7); // the real 300 ms ease at 30 fps: too short
    expect(smoothness([11.4, 2.9, 2.6, 2.1, 1.4, 1.1, 0.7, 0.5, 0.3, 0.4, 0.2, 0]).motionFrames).toBe(10); // an old page vanishing in frame 1 does not hide the ease
  });
});

describe('take: one continuous recording with several actions', () => {
  it('runs the actions at their frames, slow only in their motion window, and the next take starts on exactly the last frame', async () => {
    const page2 = PAGE.replace('</body>', `<script>fetch('http://example.invalid/live.json').catch(()=>{})</script><button id=back style="position:absolute;left:100px;top:200px" onclick="document.getElementById('b').style.left='0px'">back</button></body>`);
    const srv = http.createServer((_q, r) => { r.setHeader('content-type', 'text/html'); r.end(page2); });
    await new Promise<void>((ok) => srv.listen(0, ok));
    const port = (srv.address() as {port: number}).port;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adkit-take-'));
    const spec = AdSpec.parse({brand: {name: 'T'}, scenes: [{block: 'whip'}],
      capture: {app: {url: `http://localhost:${port}`}, viewport: {width: 200, height: 300, scale: 1}, sets: {main: {screens: [
        {name: 'one', settleMs: 100, steps: [{goto: '/'}, {record: {frames: 20, slow: 0.5, actions: [{at: 4, click: '#go', elements: {go: '#go'}, measure: {box: '#b'}, motion: 8}]}}]},
        {name: 'two', settleMs: 100, steps: [{record: {frames: 14, slow: 0.5, actions: [{at: 3, click: '#back', elements: {back: '#back'}, motion: 6}]}}]},
      ]}}}});
    const e = await shootSet({cap: spec.capture, specDir: dir, setName: 'main', screens: spec.capture.sets.main.screens, accent: '#d00', base: `http://localhost:${port}`, outDir: dir, logsDir: dir, log: () => {}, detail: () => {}});
    const one = e.screens.one, two = e.screens.two;
    expect(one.frames!.length).toBe(21); // the start still + 20
    expect(two.frames!.length).toBe(15);
    expect(one.actions).toEqual([{at: 4, motion: 8}]);
    expect(one.unmocked).toEqual(['http://example.invalid/live.json']); // asked the network, no route answered: the `unmocked` check fails it
    expect(one.elements.go && one.elements.box).toBeTruthy(); // measured before / after the motion window
    const {execFileSync} = await import('node:child_process');
    const file = (f: string) => path.join(dir, 'main', f.replace('captures/main/', ''));
    const edge = (f: string) => { const raw = execFileSync('magick', [file(f), '-crop', '200x30+0+0', '-depth', '8', 'rgb:-'], {maxBuffer: 1e7}); let last = -1; for (let x = 0; x < 200; x++) if (raw[x * 3] > 180 && raw[x * 3 + 1] < 60) last = x; return last; };
    const xs = one.frames!.map(edge);
    expect(xs[3]).toBe(59); // nothing moves before the action
    expect(xs[4]).toBeGreaterThan(59); // the action frame already moves
    for (let i = 5; i < 14; i++) expect(xs[i]).toBeGreaterThanOrEqual(xs[i - 1]); // monotone, no restart
    // slow window: 8 frames of 16.7 ms (133 ms), then real time (33 ms per frame): 300 ms linear is done after 8 + 5 frames
    expect(xs[11] - xs[10]).toBeLessThan(8); // last slow frame: 8.3 ms = 3.3 px
    expect(xs[12] - xs[11]).toBeGreaterThan(10); // first real-time frame: 33 ms = 13 px
    expect(xs[20]).toBe(179); // arrived at 120 + 60 px, and stayed (the page lived on in real time between actions)
    // the second take starts on exactly the last frame of the first one
    const sha = (f: string) => createHash('sha256').update(fs.readFileSync(file(f))).digest('hex');
    expect(sha(two.frames![0])).toBe(sha(one.frames![20]));
    const ys = two.frames!.map(edge);
    expect(ys[0]).toBe(179);
    expect(ys[14]).toBe(59);
    srv.close();
  }, 120000);
});

import {sameTakeFindings, takeSyncFindings} from '../src/engine/take';
describe('take rules', () => {
  const isTake = (r: string) => r === 'take';
  const tf = (extra: object = {}, steps: object[] = [{type: 'tap', at: 1, element: 'a'}]) => ({block: 'tapFlow', bars: 1, start: {screen: 'take', transition: 'live'}, steps, ...extra}) as never;
  it('accepts consecutive blocks on one take joined live', () => {
    expect(sameTakeFindings([tf(), tf()], isTake)).toEqual([]);
  });
  it('refuses a fade, a zoom enter or a screen step inside a take', () => {
    expect(sameTakeFindings([tf(), tf({start: {screen: 'take', transition: 'fade'}})], isTake)[0]).toMatch(/use "live"/);
    expect(sameTakeFindings([tf(), tf({start: {screen: 'take', transition: 'live', enter: 'fade'}})], isTake)[0]).toMatch(/use "cut"/);
    expect(sameTakeFindings([tf({}, [{type: 'screen', at: 1, screen: 'x'}])], isTake)[0]).toMatch(/screen/);
  });
  it('lets two different takes join with any transition', () => {
    expect(sameTakeFindings([tf(), tf({start: {screen: 'other', transition: 'fade'}})], isTake)).toEqual([]);
  });
  it('finds a tap that is not on an action', () => {
    const blocks = [{kind: 'tapFlow', start: 100, spec: tf({}, [{type: 'tap', at: 1, element: 'a'}, {type: 'tap', at: 3, element: 'b'}])}];
    expect(takeSyncFindings(blocks, 10, () => [10, 100], 3)).toEqual(['tapFlow tap at take frame 30 is 20 frames from the nearest action (actions at 10, 100)']);
  });
});
