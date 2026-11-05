import {describe, expect, it} from 'vitest';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {compile} from '../src/engine/compile';
import {audioPlan} from '../src/engine/audio-plan';
import {ROOT, load} from './helpers';
import {audioKey, buildAudio} from '../src/audio/index';

// The real minimal example: its music, its nine sounds and its placed cues.
const {spec} = load('minimal');
const plan = audioPlan(spec, compile(spec));

const sha = (f: string) => createHash('sha256').update(readFileSync(f)).digest('hex');
describe('audio', () => {
  it('is deterministic and hits the loudness target', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'adkit-audio-'));
    const planFile = join(dir, 'plan.json');
    writeFileSync(planFile, JSON.stringify(plan));
    for (const f of ['music.json']) writeFileSync(join(dir, f), readFileSync(join(ROOT, 'examples/minimal', f)));
    const a = join(dir, 'a.wav'), b = join(dir, 'b.wav');
    await buildAudio({planFile, outWav: a, projectDir: dir, log: join(dir, 'a.log')});
    await buildAudio({planFile, outWav: b, projectDir: dir, log: join(dir, 'b.log')});
    expect(sha(a)).toBe(sha(b));
    expect(Math.abs(measure(a).i - -14)).toBeLessThanOrEqual(0.5);
    expect(measure(a).tp).toBeLessThanOrEqual(-1.2); // the master checks the peak after the AAC round trip; this wav is the file before it
    expect(audioKey('x')).toMatch(/^[0-9a-f]{64}$/);
    expect(audioKey('x')).not.toBe(audioKey('y'));
  }, 120_000);
});

function measure(f: string): {i: number; tp: number} {
  const out = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', f, '-af', 'ebur128=peak=true', '-f', 'null', '-'], {encoding: 'utf8'}).stderr;
  const tail = out.slice(out.lastIndexOf('Summary:'));
  return {i: Number(/I:\s+(-?[\d.]+) LUFS/.exec(tail)![1]), tp: Number(/Peak:\s+(-?[\d.]+) dBFS/.exec(tail)![1])};
}
