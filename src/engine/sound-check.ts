import type {Ad} from '../spec/schema';
import {CUE_KINDS, CUE_ROLES, OLD_PALETTE} from './cue-roles';
import type {Cue, Placement} from './plan';

export type SoundFindings = {fails: string[]; warns: string[]; placements: Placement[]; mapped: number; silent: number};

const optionalCue = (c: Cue) => c.role === 'cut' || c.role === 'title-out' || (c.role === 'title-in' && !c.strong);
const words = (s: unknown) => (typeof s === 'string' ? s.trim().split(/\s+/).filter(Boolean).length : 0);

/**
 * The genericness check. Fails when a sound is not tailor-made on purpose: a cue without a mapped sound, a sound
 * without a real `meaning`, no music, a name from the old built-in palette. Warns when two cue keys share one sound with no reason.
 */
export function soundFindings(spec: Ad, cues: Cue[], opts: {adBars: number; beatsPerBar: number}): SoundFindings {
  const s = spec.sound;
  const fails: string[] = [];
  const warns: string[] = [];
  const music = s.music as {sections?: {bars?: number}[]; instruments?: Record<string, unknown>} | undefined;

  // music
  if (!music) fails.push('sound.music is missing: there is no default song. Write music for this product (meter, key, instruments that mean something).');
  else {
    const mb = (music.sections ?? []).reduce((n, x) => n + (x.bars ?? 0), 0);
    if (mb < opts.adBars - 1e-9) fails.push(`sound.music has ${mb} bars but the ad is ${opts.adBars} bars long: add sections (the music must cover the whole ad)`);
    else if (mb > Math.ceil(opts.adBars - 1e-9)) warns.push(`sound.music has ${mb} bars, the ad ${opts.adBars}: the music is cut at the end of the ad`);
  }

  // sounds
  const names = Object.keys(s.sounds);
  for (const n of names) {
    const d = s.sounds[n] as {meaning?: unknown; layers?: unknown};
    if (n === 'silent') fails.push('sound "silent" is a reserved word (it means no sound); pick another name');
    if (words(d.meaning) < 4) fails.push(`sound "${n}": meaning is ${d.meaning ? `only ${words(d.meaning)} word(s)` : 'missing'}; say what object in the product's world it is and why (at least 4 words)`);
    if (!Array.isArray(d.layers) || !d.layers.length) fails.push(`sound "${n}": needs at least one layer`);
  }

  // resolve every cue: cue name > role > kind
  const placements: Placement[] = [];
  const unmapped: string[] = [];
  const used = new Set<string>();
  const keyHits = new Map<string, number>();
  const badTarget = new Set<string>();
  let silent = 0;
  for (const c of cues) {
    const key = [c.name, c.role, c.kind].find((k) => k in s.cues);
    if (key === undefined) {
      if (!optionalCue(c)) unmapped.push(`${c.name} (role ${c.role})`);
      continue;
    }
    keyHits.set(key, (keyHits.get(key) ?? 0) + 1);
    const m = s.cues[key];
    const o = typeof m === 'string' ? {sound: m, gain: 0, variations: 3, align: 'start' as const} : m;
    if (o.sound === 'silent') { silent++; continue; }
    if (!(o.sound in s.sounds)) {
      if (!badTarget.has(`${key}>${o.sound}`)) {
        badTarget.add(`${key}>${o.sound}`);
        fails.push(OLD_PALETTE.includes(o.sound)
          ? `sound.cues.${key}: "${o.sound}" is a name from the old built-in palette, which no longer exists. Define your own sound under sound.sounds with a meaning.`
          : `sound.cues.${key}: sound "${o.sound}" is not defined in sound.sounds (defined: ${names.join(', ') || 'none'})`);
      }
      continue;
    }
    used.add(o.sound);
    placements.push({
      cue: c.name, role: c.role, key, sound: o.sound, seconds: c.seconds, ...(c.durationSeconds ? {durationSeconds: c.durationSeconds} : {}),
      gain: o.gain, ...((('pan' in o && o.pan !== undefined) ? o.pan : c.pan) !== undefined ? {pan: ('pan' in o && o.pan !== undefined) ? o.pan : c.pan} : {}),
      ...('duck' in o && o.duck !== undefined ? {duck: o.duck} : {}), variations: o.variations, align: o.align,
    });
  }
  if (unmapped.length) fails.push(`${unmapped.length} cue(s) have no sound in sound.cues: ${unmapped.slice(0, 12).join(', ')}${unmapped.length > 12 ? ', ...' : ''}. Map each cue name, role or kind to a sound, or to "silent" on purpose.`);

  // warnings
  const byValue = new Map<string, {key: string; reason: boolean}[]>();
  for (const [key, m] of Object.entries(s.cues)) {
    const sound = typeof m === 'string' ? m : m.sound;
    const reason = typeof m === 'object' && !!m.reason;
    if (sound === 'silent' || !keyHits.has(key)) continue;
    byValue.set(sound, [...(byValue.get(sound) ?? []), {key, reason}]);
  }
  for (const [sound, ks] of byValue) {
    if (ks.length > 1 && !ks.some((k) => k.reason)) warns.push(`sound "${sound}" is used for ${ks.map((k) => k.key).join(' and ')}; different cues sharing one sound need a "reason" on one of them, or a different sound`);
  }
  for (const k of Object.keys(s.cues)) {
    if (!keyHits.has(k)) warns.push(`sound.cues.${k} matches no cue, role or kind in this ad (typo? roles: ${Object.keys(CUE_ROLES).slice(0, 6).join(', ')}, ...; kinds: ${CUE_KINDS.join(', ')})`);
  }
  for (const n of names) if (!used.has(n)) warns.push(`sound "${n}" is defined but no cue uses it`);

  return {fails, warns, placements, mapped: placements.length, silent};
}
