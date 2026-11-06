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
    srv.close();
  }, 120000);

  it('smoothness: a one-frame jump is a spike, a long ease is not', () => {
    expect(smoothness([30, 0.1, 0]).spike).toBeGreaterThan(0.9);
    const ease = smoothness([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    expect(ease.spike).toBeLessThan(0.3);
    expect(ease.motionFrames).toBe(10);
    expect(smoothness([10, 7.7, 6, 4.8, 3.4, 2.3, 1.5, 0.5, 0]).motionFrames).toBe(7); // the real 300 ms ease at 30 fps: too short
  });
});
