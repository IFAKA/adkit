import fs from 'node:fs';
import path from 'node:path';
import {audioPlan} from '../../engine/audio-plan';
import {audioKey, buildAudio} from '../../audio';
import {fmt, sha} from '../util';
import type {Project} from '../project';

/** Writes plan.json and cues.json, and synthesises the sound track (cached by cues + sound spec). */
export async function build(p: Project, flags: {force?: boolean} = {}) {
  const t0 = Date.now();
  fs.mkdirSync(p.adkit, {recursive: true});
  fs.writeFileSync(path.join(p.adkit, 'plan.json'), JSON.stringify(p.plan, null, 2));
  fs.writeFileSync(path.join(p.adkit, 'cues.json'), JSON.stringify(p.plan.cues, null, 2));
  const ap = JSON.stringify(audioPlan(p.spec, p.plan), null, 2);
  const planFile = path.join(p.adkit, 'audio-plan.json');
  fs.writeFileSync(planFile, ap);
  const key = audioKey(ap);
  const dir = path.join(p.adkit, 'audio');
  fs.mkdirSync(dir, {recursive: true});
  const wav = path.join(dir, `${key.slice(0, 16)}.wav`);
  let cached = true;
  if (flags.force || !fs.existsSync(wav)) {
    cached = false;
    const tmp = `${wav}.tmp`;
    await buildAudio({planFile, outWav: tmp, projectDir: p.dir, log: p.rep.logFile('audio')});
    fs.renameSync(tmp, wav);
  }
  p.rep.line('build', `${p.plan.cues.length} cues, ${p.plan.total} frames, audio ${cached ? 'cached' : 'built'} ${sha(fs.readFileSync(wav)).slice(0, 8)} (${fmt((Date.now() - t0) / 1000)})`);
  return {wav, cached};
}
