#!/usr/bin/env python3
"""Render MUSIC (JSON) to stems, a mix and a cue list. Every sound comes from audio/synth models; there is no default song.

    python3 audio/score.py MUSIC.json --out-dir DIR [--seed N] [--base-dir DIR] [--no-stems]
    -> DIR/mix.wav, DIR/stems/<instrument>.wav, DIR/cues.json

MUSIC = {
  "bpm": 172, "meter": {"beats": 3, "unit": 4}, "swing": 0, "key": "D minor", "seed": 1,
  "instruments": {"bass": {"model": "pluck", "preset": "bass", "params": {}, "octave": 2, "gain": -6, "pan": 0, "fx": [...],
                           "choke": false, "humanize": {"timing_ms": 6, "velocity": 0.08}, "variations": 3, "meter_accent": 0.0}},
  "patterns": {"bassline": {"bars": 1, "notes": [[0, "c1", 1, 0.9], [1, 5, 0.5, 0.6]], "hits": []}},
  "sections": [{"name": "A", "bars": 4, "mood": "free text", "key": "optional", "chords": ["Dm", "A7"],
                "tracks": {"bass": "bassline", "palmas": {"pattern": "clap3", "transpose": 0}, "lead": ["p1", "p2"]},
                "automation": {"lead": {"gain": [[0, -18], [4, 0]], "lowpass": [[0, 800], [4, 9000]]}, "master": {...}}}],
  "master": {"fx": [...], "gain": 0}
}
Meter: beats per bar x unit note. Pattern positions are in units of the meter's unit (3/4: positions 0,1,2 are quarters;
6/8: 0..5 are eighths); fractions are subdivisions. bpm counts quarter notes for x/4; for x/8 with 6, 9 or 12 beats it counts
dotted quarters (groups of three eighths), otherwise eighths. Override with meter.bpm_counts: "unit" | "group".
Pitch: note name "D4" | scale degree integer (1 = tonic, 8 = octave up, 0 and negatives go below) | "c1".."c4" chord tone
(root, third, fifth, seventh) with optional "+" or "-" suffix for an octave | "chord" (whole chord) | a list of these | "r" rest.
Pattern notes: [beat, pitch, length in units = 1, velocity = 0.8]. Hits (drums): [beat, kind, velocity = 0.8]; kind is the model preset.
Automation points are [bar position in the section (can be fractional), value]; gain in dB, lowpass/highpass in Hz; linear between points.
"""
import argparse, hashlib, json, os, re, sys, zlib
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import synth  # noqa: E402
from synth.core import SR, db, nsamp, pan_stereo, as_stereo, note_to_midi, mtof, biquad, sweep_lp, fade, rng  # noqa: E402
from synth.wavio import write_wav  # noqa: E402
from synth import fx as fxm  # noqa: E402
from synth import sampler as samplerm, samplelib  # noqa: E402


class ScoreError(Exception):
    pass


SCALES = {'major': [0, 2, 4, 5, 7, 9, 11], 'minor': [0, 2, 3, 5, 7, 8, 10], 'harmonic minor': [0, 2, 3, 5, 7, 8, 11],
          'dorian': [0, 2, 3, 5, 7, 9, 10], 'phrygian': [0, 1, 3, 5, 7, 8, 10], 'phrygian dominant': [0, 1, 4, 5, 7, 8, 10],
          'mixolydian': [0, 2, 4, 5, 7, 9, 10], 'lydian': [0, 2, 4, 6, 7, 9, 11], 'pentatonic': [0, 2, 4, 7, 9],
          'minor pentatonic': [0, 3, 5, 7, 10]}
_PC = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
CHORDS = {'': [0, 4, 7], 'm': [0, 3, 7], 'min': [0, 3, 7], '7': [0, 4, 7, 10], 'm7': [0, 3, 7, 10], 'maj7': [0, 4, 7, 11],
          'M7': [0, 4, 7, 11], 'dim': [0, 3, 6], 'aug': [0, 4, 8], 'sus4': [0, 5, 7], 'sus2': [0, 2, 7], '5': [0, 7, 12],
          '6': [0, 4, 7, 9], 'm6': [0, 3, 7, 9], '9': [0, 4, 7, 10, 14], 'm7b5': [0, 3, 6, 10], 'dim7': [0, 3, 6, 9]}


def pc_of(name):
    m = re.fullmatch(r'([A-Ga-g])([#b]?)', name)
    if not m: raise ScoreError(f'bad note name "{name}" in key/chord')
    return (_PC[m.group(1).upper()] + (1 if m.group(2) == '#' else -1 if m.group(2) == 'b' else 0)) % 12


def parse_key(key):
    m = re.fullmatch(r'\s*([A-Ga-g][#b]?)\s*(.*?)\s*', str(key))
    if not m: raise ScoreError(f'bad key "{key}" (use e.g. "D minor", "A phrygian dominant", "C major")')
    mode = m.group(2).lower() or 'major'
    mode = {'m': 'minor', 'min': 'minor', 'maj': 'major'}.get(mode, mode)
    if mode not in SCALES: raise ScoreError(f'unknown mode "{mode}" (modes: {", ".join(SCALES)})')
    return pc_of(m.group(1)), SCALES[mode]


def parse_chord(name):
    m = re.fullmatch(r'([A-G][#b]?)(.*)', str(name).strip())
    if not m or m.group(2) not in CHORDS: raise ScoreError(f'bad chord "{name}" (root A-G, then one of: {", ".join(repr(k) for k in CHORDS)})')
    return pc_of(m.group(1)), CHORDS[m.group(2)]


def tonic_chord(key):
    pc, sc = parse_key(key)
    third = sc[2] if len(sc) > 2 else 4
    return pc, ([0, 3, 7] if third == 3 else [0, 4, 7])


class Meter:
    def __init__(self, m, bpm):
        m = m or {}
        self.beats, self.unit = int(m.get('beats', 4)), int(m.get('unit', 4))
        if not 2 <= self.beats <= 12 or self.unit not in (4, 8): raise ScoreError('meter: beats 2..12, unit 4 or 8')
        counts = m.get('bpm_counts') or ('group' if self.unit == 8 and self.beats % 3 == 0 else 'unit')
        self.unit_s = 60.0 / bpm / (3 if (self.unit == 8 and counts == 'group') else 1)
        self.bar_s = self.beats * self.unit_s
        if m.get('accents'):
            if len(m['accents']) != self.beats: raise ScoreError('meter.accents needs one value per beat')
            self.accents = [float(a) for a in m['accents']]
        elif self.beats == 3: self.accents = [1, .55, .55]
        elif self.beats == 4: self.accents = [1, .4, .7, .4]
        elif self.beats % 3 == 0:  # 6, 9, 12: groups of three
            self.accents = [1 if i == 0 else .7 if i % 3 == 0 else .35 for i in range(self.beats)]
        else: self.accents = [1] + [.4 if i % 2 else .7 for i in range(1, self.beats)]

    def to_s(self, pos, swing=0.0):
        u = np.floor(pos); p = pos - u
        if swing > 0:
            r = 0.5 + swing * (2 / 3 - 0.5)
            p = p * r / .5 if p < .5 else r + (p - .5) * (1 - r) / .5
        return (u + p) * self.unit_s


# ---------------------------------------------------------------- pitch

class Harmony:
    def __init__(self, key, octave):
        self.pc, self.scale = parse_key(key)
        self.octave = octave

    def degree(self, d, octave):
        d = int(d)
        if d == 0: raise ScoreError('degree 0 does not exist (1 = tonic)')
        i = d - 1 if d > 0 else d
        L = len(self.scale)
        return 12 * (octave + 1) + self.pc + self.scale[i % L] + 12 * (i // L)

    def chord_tones(self, chord, octave):
        pc, iv = chord
        base = 12 * (octave + 1) + pc
        return [base + x for x in iv]

    def pitches(self, p, chord, octave):
        """-> list of midi numbers (empty for a rest)."""
        if isinstance(p, list): return [m for q in p for m in self.pitches(q, chord, octave)]
        if p is None or p == 'r': return []
        if isinstance(p, bool): raise ScoreError('bad pitch true/false')
        if isinstance(p, (int, float)): return [self.degree(p, octave)]
        s = str(p)
        if s == 'chord': return self.chord_tones(chord, octave)
        m = re.fullmatch(r'c([1-4])([+-]*)', s)
        if m:
            tones = self.chord_tones(chord, octave)
            k = int(m.group(1)) - 1
            if k >= len(tones): tones = tones + [tones[0] + 12]
            return [tones[k] + 12 * (m.group(2).count('+') - m.group(2).count('-'))]
        try: return [int(note_to_midi(s))]
        except ValueError: raise ScoreError(f'bad pitch "{p}" (note name like D4, degree number, "c1".."c4", "chord", "r")')


# ---------------------------------------------------------------- build events

def pattern_bars(pt, name):
    b = int(pt.get('bars', 1))
    if b < 1: raise ScoreError(f'pattern "{name}": bars must be >= 1')
    return b


def resolve_item(it, patterns, where):
    if isinstance(it, str):
        if it not in patterns: raise ScoreError(f'{where}: unknown pattern "{it}" (patterns: {", ".join(patterns) or "none"})')
        return patterns[it], 0, it
    if isinstance(it, dict):
        if 'pattern' in it:
            pt, _, n = resolve_item(it['pattern'], patterns, where)
            return pt, int(it.get('transpose', 0)), n
        return it, int(it.get('transpose', 0)), 'inline'
    raise ScoreError(f'{where}: a track is a pattern name, an inline pattern, or a list of those')


def build(music, base_dir=None, seed=None):
    if not isinstance(music, dict) or not music:
        raise ScoreError('no music: this ad needs a MUSIC json (there is no default song)')
    for k in ('bpm', 'instruments', 'sections'):
        if not music.get(k): raise ScoreError(f'music is missing "{k}" (there is no default song)')
    bpm = float(music['bpm'])
    if not 30 <= bpm <= 400: raise ScoreError('bpm must be 30..400')
    meter = Meter(music.get('meter'), bpm)
    swing = float(music.get('swing', 0))
    key = music.get('key', 'C major')
    parse_key(key)
    seed = int(seed if seed is not None else music.get('seed', 0))
    insts, pats = music['instruments'], music.get('patterns') or {}
    for n, p in insts.items():
        if 'model' not in p: raise ScoreError(f'instrument "{n}": "model" is required')
    names = list(insts)
    events = {n: [] for n in names}
    bars, sections, t0, bar_no = [], [], 0.0, 0
    for si, sec in enumerate(music['sections']):
        nb = int(sec.get('bars', 0))
        if nb < 1: raise ScoreError(f'section {si} "{sec.get("name")}": bars must be >= 1')
        skey = sec.get('key', key)
        chords = [parse_chord(c) for c in sec.get('chords', [])] or [tonic_chord(skey)]
        cnames = list(sec.get('chords', [])) or [None]
        sec_start = t0
        for b in range(nb):
            c = chords[b % len(chords)]
            bars.append(dict(bar=bar_no + b + 1, section=sec.get('name', f'S{si}'), start=round(sec_start + b * meter.bar_s, 6),
                             chord=cnames[b % len(cnames)], beats=[dict(beat=k + 1, t=round(sec_start + b * meter.bar_s + k * meter.unit_s, 6), accent=meter.accents[k]) for k in range(meter.beats)]))
        sections.append(dict(name=sec.get('name', f'S{si}'), start_bar=bar_no + 1, bars=nb, start=round(sec_start, 6), end=round(sec_start + nb * meter.bar_s, 6), mood=sec.get('mood')))
        for inst, track in (sec.get('tracks') or {}).items():
            if inst not in insts: raise ScoreError(f'section "{sec.get("name")}": track "{inst}" is not in instruments ({", ".join(names)})')
            items = track if isinstance(track, list) else [track]
            where = f'section "{sec.get("name")}" track "{inst}"'
            seq = [resolve_item(i, pats, where) for i in items]
            h = Harmony(skey, int(insts[inst].get('octave', 4)))
            b = 0
            k = 0
            while b < nb:
                pt, tr, pname = seq[k % len(seq)]; k += 1
                pb = pattern_bars(pt, pname)
                for n_ in pt.get('notes', []):
                    if len(n_) < 2: raise ScoreError(f'{where}: note {n_} needs [beat, pitch, length, velocity]')
                    beat, pitch = float(n_[0]), n_[1]
                    ln = float(n_[2]) if len(n_) > 2 else 1.0; vel = float(n_[3]) if len(n_) > 3 else .8
                    sdir = str(n_[4]) if len(n_) > 4 else None
                    if not 0 <= beat < pb * meter.beats: raise ScoreError(f'{where}: note at beat {beat} is outside pattern "{pname}" ({pb} bar(s) x {meter.beats} beats)')
                    bar_in = b + int(beat // meter.beats)
                    if bar_in >= nb: continue
                    cc = chords[bar_in % len(chords)]
                    for m in h.pitches(pitch, cc, h.octave):
                        events[inst].append(dict(pos=bar_no * meter.beats + b * meter.beats + beat, kind='note', midi=m + tr, len=ln, vel=vel, beatinbar=int(beat % meter.beats), pp=pt.get('params'), dir=sdir))
                for h_ in pt.get('hits', []):
                    if len(h_) < 2: raise ScoreError(f'{where}: hit {h_} needs [beat, kind, velocity]')
                    beat = float(h_[0])
                    if not 0 <= beat < pb * meter.beats: raise ScoreError(f'{where}: hit at beat {beat} is outside pattern "{pname}"')
                    if b + int(beat // meter.beats) >= nb: continue
                    events[inst].append(dict(pos=bar_no * meter.beats + b * meter.beats + beat, kind='hit', name=str(h_[1]), vel=float(h_[2]) if len(h_) > 2 else .8, len=1.0, beatinbar=int(beat % meter.beats), pp=pt.get('params')))
                b += pb
        bar_no += nb; t0 += nb * meter.bar_s
    return dict(bpm=bpm, meter=meter, swing=swing, key=key, seed=seed, events=events, bars=bars, sections=sections, total_s=t0)


# ---------------------------------------------------------------- automation

def curve(music, plan, inst, param, neutral, log=False):
    """Per-sample automation curve over the whole song, or None if no section sets it."""
    pts, used = [], False
    meter = plan['meter']
    for sec, info in zip(music['sections'], plan['sections']):
        a = ((sec.get('automation') or {}).get(inst) or {}).get(param)
        t0, t1 = info['start'], info['end']
        if a:
            used = True
            a = sorted([(float(p), float(v)) for p, v in a])
            ps = [(t0 + p * meter.bar_s, v) for p, v in a]
            ps = [(min(max(t, t0), t1), v) for t, v in ps]
            if ps[0][0] > t0: ps.insert(0, (t0, ps[0][1]))
            if ps[-1][0] < t1: ps.append((t1, ps[-1][1]))
        else:
            ps = [(t0, neutral), (t1, neutral)]
        ps[0] = (ps[0][0] + .01, ps[0][1]) if pts else ps[0]
        pts += ps
    if not used: return None
    xs = np.array([p[0] for p in pts]) * SR; ys = np.array([p[1] for p in pts])
    return xs, np.log(ys) if log else ys


def eval_curve(c, n, log=False):
    xs, ys = c
    y = np.interp(np.arange(n), xs, ys)
    return np.exp(y) if log else y


# ---------------------------------------------------------------- render

def render_instrument(name, patch, evs, plan, base_dir, seed, N, idx):
    if patch['model'] == 'sampler': return render_sampler(name, patch, evs, plan, seed, N, idx)
    meter, swing = plan['meter'], plan['swing']
    model, preset, params = patch['model'], patch.get('preset'), dict(patch.get('params') or {})
    nvar = max(1, int(patch.get('variations', 3)))
    hum = patch.get('humanize') or {}
    r = rng(seed, 'human', idx)
    acc = float(patch.get('meter_accent', 0))
    stem = np.zeros((N, 2))
    cache = {}
    ordered = sorted(evs, key=lambda e: (e['pos'], e.get('midi', 0), e.get('name', '')))
    for k, e in enumerate(ordered):
        t = meter.to_s(e['pos'], swing)
        if hum.get('timing_ms'): t += r.uniform(-1, 1) * float(hum['timing_ms']) / 1000
        vel = e['vel']
        if hum.get('velocity'): vel += r.uniform(-1, 1) * float(hum['velocity'])
        if acc:  # on-beat hits follow the meter's accent grid, off-beat hits are played softer
            vel *= 1 - acc * (1 - meter.accents[e['beatinbar']]) if abs(e['pos'] % 1) < 1e-9 else 1 - acc * .6
        vel = float(np.clip(round(vel * 10) / 10, .1, 1.0))
        p = dict(params); p.update(e.get('pp') or {}); p['velocity'] = vel
        dur_s = e['len'] * meter.unit_s
        if e['kind'] == 'note':
            freq = float(mtof(e['midi'])); p['freq'] = freq
            if model in ('fm', 'subtractive') or (model == 'pluck' and p.get('tremolo_hz')): p['dur'] = dur_s
            pr, ckey = preset, round(freq, 3)
        else:
            pr, ckey = e['name'], e['name']
            if model not in ('drums',) and model in synth.PRESETS and e['name'] not in synth.PRESETS[model]:
                raise ScoreError(f'instrument "{name}": hit "{e["name"]}" is not a preset of model "{model}"')
        key = (ckey, vel, round(dur_s, 3) if 'dur' in p else 0, k % nvar, json.dumps(e.get('pp'), sort_keys=True))
        if key not in cache:
            es = int(np.random.SeedSequence([seed, idx, k % nvar, zlib.crc32(str(ckey).encode())]).generate_state(1)[0] & 0x7FFFFFFF)
            try:
                y = synth.render_model(model, p, es, pr, base_dir)
            except (ValueError, KeyError) as ex:
                raise ScoreError(f'instrument "{name}": {ex}')
            if patch.get('choke'):
                m = min(len(y), nsamp(dur_s + .04)); y = y[:m].copy(); f = min(m, nsamp(.04)); y[-f:] *= np.linspace(1, 0, f)
            cache[key] = y
        y = cache[key]
        i = max(0, int(round(t * SR)))  # humanize can push the first hit before 0
        if i >= N: continue
        m = min(len(y), N - i)
        yy = y[:m] if y.ndim == 1 else y[:m].mean(1)
        stem[i:i + m, 0] += yy; stem[i:i + m, 1] += yy
    return stem


def render_sampler(name, patch, evs, plan, seed, N, idx):
    """Sampled instrument (audio/synth/sampler.py). Notes that share a beat and a pattern with `strum_ms` are a strum:
    the notes of the chord start strum_ms apart (+-20%), low to high on a down strum ("d"), high to low on an up strum ("u",
    softer; 5th element of a note, or params.strum_dir). params: strum_ms, strum_dir, artic ("tremolo"), ring (no release cut)."""
    meter, swing = plan['meter'], plan['swing']
    S = samplerm.Sampler(patch.get('preset') or patch.get('set') or '', seed, idx)
    base = dict(patch.get('params') or {})
    hum = patch.get('humanize') or {}
    r = rng(seed, 'human', idx)
    acc = float(patch.get('meter_accent', 0))
    stem = np.zeros((N, 2))
    ordered = sorted(evs, key=lambda e: (e['pos'], e.get('midi', 0), e.get('name', '')))
    groups, order = {}, []
    for e in ordered:
        k = (e['pos'], e['kind'])
        if k not in groups: groups[k] = []; order.append(k)
        groups[k].append(e)
    for k in order:
        g = groups[k]
        p = dict(base); p.update(g[0].get('pp') or {})
        t0 = meter.to_s(g[0]['pos'], swing)
        if hum.get('timing_ms'): t0 += r.uniform(-1, 1) * float(hum['timing_ms']) / 1000
        strum = float(p.get('strum_ms', 0)) if g[0]['kind'] == 'note' and len(g) > 1 else 0.0
        sdir = (g[0].get('dir') or p.get('strum_dir') or 'd')[0]
        if strum: g = sorted(g, key=lambda e: e['midi'], reverse=(sdir == 'u'))
        for j, e in enumerate(g):
            vel = e['vel']
            if hum.get('velocity'): vel += r.uniform(-1, 1) * float(hum['velocity'])
            if acc: vel *= 1 - acc * (1 - meter.accents[e['beatinbar']]) if abs(e['pos'] % 1) < 1e-9 else 1 - acc * .6
            t = t0
            if strum:
                t += j * strum / 1000 * float(r.uniform(.8, 1.2))
                vel *= (1 - .18 * j / max(1, len(g) - 1)) * (.88 if sdir == 'u' else 1.0)
            vel = float(np.clip(vel, .05, 1.0))
            ep = dict(p); ep.update(e.get('pp') or {})
            if e['kind'] == 'note':
                y = S.note(e['midi'], vel, e['len'] * meter.unit_s, ep.get('artic'), bool(ep.get('ring')))
            else:
                y = S.hit(e['name'], vel)
                if 'roll' in e['name']:  # a roll fills `roll_beats` (default 1) and is cut with a short fade
                    n = int(float(ep.get('roll_beats', 1)) * meter.unit_s * SR); f = min(n, int(.12 * SR))
                    if n < len(y): y = y[:n].copy(); y[-f:] *= np.linspace(1, 0, f)
            i = int(round(t * SR))
            if i < 0: y = y[-i:]; i = 0
            if i >= N: continue
            m = min(len(y), N - i)
            stem[i:i + m, 0] += y[:m]; stem[i:i + m, 1] += y[:m]
    return stem


def render_music(music, base_dir=None, seed=None):
    plan = build(music, base_dir, seed)
    seed = plan['seed']; tail = 3.0
    N = nsamp(plan['total_s'] + tail)
    names = list(music['instruments'])
    raw = {}
    for i, n in enumerate(names):
        raw[n] = render_instrument(n, music['instruments'][n], plan['events'][n], plan, base_dir, seed, N, i)
    stems = {}
    for i, n in enumerate(names):
        patch = music['instruments'][n]
        x = raw[n]
        lpc = curve(music, plan, n, 'lowpass', 20000.0, True)
        if lpc is not None: x = sweep_lp(x, eval_curve(lpc, N, True), 'lowpass', .7071, 8)
        hpc = curve(music, plan, n, 'highpass', 20.0, True)
        if hpc is not None: x = sweep_lp(x, eval_curve(hpc, N, True), 'highpass', .7071, 8)
        x = pan_stereo(x, float(patch.get('pan', 0)))
        if patch.get('fx'): x = fxm.apply_fx(x, patch['fx'], seed * 17 + i, keys=raw)
        x = x * db(float(patch.get('gain', 0)))
        gc = curve(music, plan, n, 'gain', 0.0)
        if gc is not None: x = x * db(eval_curve(gc, len(x)))[:, None]
        stems[n] = x
    L = max(len(s) for s in stems.values())
    mix = np.zeros((L, 2))
    for s in stems.values(): mix[:len(s)] += s
    ms = music.get('master') or {}
    gc = curve(music, plan, 'master', 'gain', 0.0)
    if gc is not None: mix = mix * db(eval_curve(gc, L))[:, None]
    lpc = curve(music, plan, 'master', 'lowpass', 20000.0, True)
    if lpc is not None: mix = sweep_lp(mix, eval_curve(lpc, L, True), 'lowpass', .7071, 8)
    if ms.get('fx'): mix = fxm.apply_fx(mix, ms['fx'], seed * 31)
    mix = mix * db(float(ms.get('gain', 0)))
    mix = fxm.limit(mix, 0, -1.0)
    stems = {k: np.pad(v, ((0, len(mix) - len(v)), (0, 0)))[:len(mix)] for k, v in stems.items()}
    live = np.where(np.abs(mix).max(1) > 1e-4)[0]  # trim the silent end of the reverb tail
    end = min(len(mix), max(int(live[-1]) + nsamp(.05), nsamp(plan['total_s'])) if len(live) else nsamp(plan['total_s']))
    mix = fade(mix[:end], 0, 30); stems = {k: v[:end] for k, v in stems.items()}
    cues = dict(bpm=plan['bpm'], meter=dict(beats=plan['meter'].beats, unit=plan['meter'].unit, accents=plan['meter'].accents),
                unit_seconds=plan['meter'].unit_s, bar_seconds=plan['meter'].bar_s, swing=plan['swing'], key=plan['key'],
                total_bars=len(plan['bars']), seconds=plan['total_s'], audio_seconds=len(mix) / SR, sections=plan['sections'], bars=plan['bars'])
    return mix, stems, cues


def content_hash(music, seed=None, base_dir=None):
    h = hashlib.sha256()
    h.update(json.dumps(music, sort_keys=True, separators=(',', ':')).encode()); h.update(str(seed if seed is not None else music.get('seed', 0)).encode())
    for p in music.get('instruments', {}).values():
        if p.get('model') == 'sample': h.update(synth.sample.content_hash(p.get('params', {}), base_dir).encode())
        if p.get('model') == 'sampler':
            lk = samplelib.load_lock()
            for pk in samplerm.SETS[p.get('preset') or p.get('set')]['packs']: h.update(samplelib.pack_key(lk['packs'][pk]).encode())
    return h.hexdigest()


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('music'); ap.add_argument('--out-dir', required=True); ap.add_argument('--seed', type=int); ap.add_argument('--base-dir'); ap.add_argument('--no-stems', action='store_true')
    a = ap.parse_args(argv)
    try:
        if not os.path.isfile(a.music): raise ScoreError(f'no music file {a.music} (there is no default song)')
        with open(a.music) as fh: music = json.load(fh)
        base = a.base_dir or os.path.dirname(os.path.abspath(a.music))
        mix, stems, cues = render_music(music, base, a.seed)
        os.makedirs(a.out_dir, exist_ok=True)
        write_wav(os.path.join(a.out_dir, 'mix.wav'), mix)
        if not a.no_stems:
            os.makedirs(os.path.join(a.out_dir, 'stems'), exist_ok=True)
            for n, s in stems.items(): write_wav(os.path.join(a.out_dir, 'stems', f'{n}.wav'), s)
        with open(os.path.join(a.out_dir, 'cues.json'), 'w') as fh: json.dump(cues, fh, indent=1)
    except (ScoreError, samplelib.SampleError, ValueError, OSError, json.JSONDecodeError, KeyError) as e:
        print(f'score: {e}', file=sys.stderr); return 1
    print(f"music ok {len(mix) / SR:.1f} s {cues['total_bars']} bars {cues['meter']['beats']}/{cues['meter']['unit']} hash {content_hash(music, a.seed, base)[:12]}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
