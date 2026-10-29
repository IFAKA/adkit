import {describe, expect, it} from 'vitest';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {audioKey, buildAudio} from '../src/audio/index';

const plan = {
  fps: 30, bpm: 120, totalFrames: 150, durationSeconds: 5, bars: 3,
  cues: [
    {name: 'a:ping-01', frame: 0, seconds: 0, kind: 'ping', role: 'ping', block: 'a'},
    {name: 'a:ping-02', frame: 15, seconds: 0.5, kind: 'ping', role: 'ping', block: 'a'},
    {name: 'a:tap-1', frame: 75, seconds: 2.5, kind: 'tap', role: 'tap', block: 'b', pan: -0.2},
    {name: 'b:paid', frame: 100, seconds: 3.33, kind: 'chime', role: 'paid', block: 'b'},
    {name: 'b:macro-1', frame: 120, seconds: 4, kind: 'whoosh', role: 'macro', block: 'b', dur: 8, durationSeconds: 0.27},
  ],
  sections: [
    {role: 'chaos', startFrame: 0, endFrame: 45, startSeconds: 0, endSeconds: 1.5, block: 'a'},
    {role: 'breath', startFrame: 45, endFrame: 60, startSeconds: 1.5, endSeconds: 2, block: 'a'},
    {role: 'drop', startFrame: 60, endFrame: 60, startSeconds: 2, endSeconds: 2, block: 'b'},
    {role: 'groove', startFrame: 60, endFrame: 120, startSeconds: 2, endSeconds: 4, block: 'b'},
    {role: 'final', startFrame: 120, endFrame: 150, startSeconds: 4, endSeconds: 5, block: 'c'},
  ],
  sound: {
    key: 'C', progression: ['C', 'F', 'Am', 'G'], chords: {},
    motif: {notes: [[0, 67, 0.75], [0.75, 72, 0.25], [1, 76, 0.75], [1.75, 74, 0.25]], ding: 84},
    sfx: {}, seed: 21, loudness: {lufs: -14, truePeak: -1.5},
  },
};

const sha = (f: string) => createHash('sha256').update(readFileSync(f)).digest('hex');
describe('audio', () => {
  it('is deterministic and hits the loudness target', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'adkit-audio-'));
    const planFile = join(dir, 'plan.json');
    writeFileSync(planFile, JSON.stringify(plan));
    const a = join(dir, 'a.wav'), b = join(dir, 'b.wav');
    await buildAudio({planFile, outWav: a, projectDir: dir, log: join(dir, 'a.log')});
    await buildAudio({planFile, outWav: b, projectDir: dir, log: join(dir, 'b.log')});
    expect(sha(a)).toBe(sha(b));
    expect(Math.abs(measure(a).i - -14)).toBeLessThanOrEqual(0.5);
    expect(measure(a).tp).toBeLessThanOrEqual(-1.5);
    expect(audioKey('x')).toMatch(/^[0-9a-f]{64}$/);
    expect(audioKey('x')).not.toBe(audioKey('y'));
  }, 120_000);
});

function measure(f: string): {i: number; tp: number} {
  const out = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', f, '-af', 'ebur128=peak=true', '-f', 'null', '-'], {encoding: 'utf8'}).stderr;
  const tail = out.slice(out.lastIndexOf('Summary:'));
  return {i: Number(/I:\s+(-?[\d.]+) LUFS/.exec(tail)![1]), tp: Number(/Peak:\s+(-?[\d.]+) dBFS/.exec(tail)![1])};
}
