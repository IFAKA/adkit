"""Sampled instruments: multisample sets read from the locked sample packs (see samplelib.py).

A SET maps notes (or named hits) to recordings. Rules:
  - pitch: the nearest recorded pitch is used, resampled by at most +-3 semitones (an error is raised beyond that);
  - velocity layers: the velocity picks the layer (soft ... hard); the level follows velocity too;
  - round robin: among the recordings that fit (other strings, other takes) one is chosen with the seed, never the
    same one twice in a row;
  - every recording is trimmed to its attack (leading silence removed) and normalised to peak 0.5;
  - a note with a length is released at that length with a short fade (set `ring` to let it ring out).
Sets (instrument "preset" in score.py, model "sampler"):
  nylon_guitar   Meta nylon guitar: 6 strings x 3 layers (finger, pick, hard pick), E2-B5. Same pitch on another string = round robin.
  mandolin       Philharmonia mandolin A3-E6: artic "normal" (default) or "tremolo" (pattern params {"artic": "tremolo"}).
  bass           Meatbass double bass pizzicato C1-Eb3 (soft/hard, 2 takes).
  castanets      hits: strike, roll, phrase_roll, phrase_rhythm  (one recorded strike: each hit gets a tiny pitch/level change)
  hands          hits: palma (clap), palma_soft, palma_sorda (finger clap), palmas_group (several people), pandereta, pandereta_shake, pandereta_roll
"""
import re
import numpy as np
from .core import SR, rng, note_to_midi
from . import samplelib

MAX_SHIFT = 3.0
_PC = {'c': 0, 'd': 2, 'e': 4, 'f': 5, 'g': 7, 'a': 9, 'b': 11}


def parse_note(s):
    """'Gs3' / 'eb1' / 'A4' -> midi."""
    m = re.fullmatch(r'([A-Ga-g])(s|#|b)?(-?\d)', s)
    if not m: raise samplelib.SampleError(f'cannot read note name "{s}" in a sample file name')
    pc = _PC[m.group(1).lower()] + (1 if m.group(2) in ('s', '#') else -1 if m.group(2) == 'b' else 0)
    return 12 * (int(m.group(3)) + 1) + pc


def Z(pack, rel, midi=None, layer=0, artic='', rr='', kind=''):
    return dict(pack=pack, rel=rel, midi=midi, layer=layer, artic=artic, rr=rr, kind=kind)


def _nylon(files):
    out = []
    for rel in files:
        m = re.search(r'Nylon_String(\w+?)_Vel0(\d)(?:Finger|Pick)_(\w+?)_(\d+)\.ogg$', rel)
        if m: out.append(Z('meta-nylon-guitar', rel, parse_note(m.group(3)), int(m.group(2)) - 1, '', m.group(1) + m.group(4)))
    return out


def _mandolin(files):
    out = []
    for rel in files:
        m = re.search(r'^mandolin_(\w+?)_very-long_(piano|forte)_(normal|tremolo)\.mp3$', rel)
        if m: out.append(Z('philharmonia-mandolin', rel, parse_note(m.group(1)), 0 if m.group(2) == 'piano' else 1, m.group(3), 'a'))
    return out


def _bass(files):
    out = []
    for rel in files:
        m = re.search(r'/(\w+?)_vl(\d)_rr(\d)\.wav$', rel)
        if m: out.append(Z('meatbass-pizz', rel, parse_note(m.group(1)), 0 if m.group(2) == '1' else 1, '', 'rr' + m.group(3)))
    return out


def _castanets(files):
    names = {'struck-singly': 'strike', 'long_mezzo-forte_roll': 'roll', 'phrase_forte_rhythm': 'phrase_rhythm', 'phrase_mezzo-forte_roll': 'phrase_roll'}
    out = []
    for rel in files:
        for k, v in names.items():
            if k in rel: out.append(Z('philharmonia-castanets', rel, None, 0, '', 'a', v))
    return out


def _hands(lock):
    out = []
    for rel in lock['packs']['body-percussion']['files']:
        m = re.search(r'/(handclap|fingerclap)_vl(\d)_rr(\d)\.wav$', rel)
        if m: out.append(Z('body-percussion', rel, None, int(m.group(2)) - 1, '', 'rr' + m.group(3), 'palma' if m.group(1) == 'handclap' else 'palma_sorda'))
    for rel in lock['packs']['vcsl-percussion']['files']:
        m = re.search(r'/Clap_rr(\d)\.wav$', rel)
        if m: out.append(Z('vcsl-percussion', rel, None, 0, '', 'rr' + m.group(1), 'palmas_group'))
        m = re.search(r'Tamb1_Hit_v(\d)_', rel)
        if m: out.append(Z('vcsl-percussion', rel, None, int(m.group(1)) - 1, '', 'a', 'pandereta'))
        m = re.search(r'Tamb1_Shake_rr(\d)', rel)
        if m: out.append(Z('vcsl-percussion', rel, None, 0, '', 'rr' + m.group(1), 'pandereta_shake'))
        if 'Tamb1_Roll' in rel: out.append(Z('vcsl-percussion', rel, None, 0, '', 'a', 'pandereta_roll'))
    return out


SETS = {
    'nylon_guitar': dict(packs=['meta-nylon-guitar'], zones=lambda lk: _nylon(lk['packs']['meta-nylon-guitar']['files']), release=.22),
    'mandolin': dict(packs=['philharmonia-mandolin'], zones=lambda lk: _mandolin(lk['packs']['philharmonia-mandolin']['files']), release=.14),
    'bass': dict(packs=['meatbass-pizz'], zones=lambda lk: _bass(lk['packs']['meatbass-pizz']['files']), release=.35),
    'castanets': dict(packs=['philharmonia-castanets'], zones=lambda lk: _castanets(lk['packs']['philharmonia-castanets']['files']), release=.05),
    'hands': dict(packs=['body-percussion', 'vcsl-percussion'], zones=_hands, release=.05),
}


def resample(x, ratio):
    """Pitch up by `ratio` (>1 = higher, shorter) with cubic (Catmull-Rom) interpolation."""
    n = int((len(x) - 3) / ratio)
    t = np.arange(n) * ratio + 1
    i = t.astype(int); f = (t - i)[:]
    p0, p1, p2, p3 = x[i - 1], x[i], x[i + 1], x[i + 2]
    return p1 + .5 * f * (p2 - p0 + f * (2 * p0 - 5 * p1 + 4 * p2 - p3 + f * (3 * (p1 - p2) + p3 - p0)))


def prep(x, trim_db=-48.0):
    """Cut the silence before the attack (keep 2 ms), normalise to peak 0.5."""
    pk = np.abs(x).max()
    if pk < 1e-6: raise samplelib.SampleError('silent sample')
    on = int(np.argmax(np.abs(x) > pk * 10 ** (trim_db / 20)))
    x = x[max(0, on - int(.002 * SR)):]
    return x * (0.5 / pk)


class Sampler:
    def __init__(self, set_name, seed=0, idx=0, lock=None):
        if set_name not in SETS: raise samplelib.SampleError(f'unknown sampler set "{set_name}" (sets: {", ".join(SETS)})')
        self.name, self.cfg, self.lock = set_name, SETS[set_name], lock or samplelib.load_lock()
        gone = samplelib.missing(self.cfg['packs'], self.lock)
        if gone: raise samplelib.SampleError(f'sample pack(s) {", ".join(gone)} not downloaded. Run: {samplelib.FETCH_CMD}')
        self.zones = self.cfg['zones'](self.lock)
        if not self.zones: raise samplelib.SampleError(f'sampler set "{set_name}" found no files in the lock')
        self.r = rng(seed, 'sampler', set_name, idx)
        self.last = {}
        self.cache = {}

    def audio(self, z):
        k = (z['pack'], z['rel'])
        if k not in self.cache: self.cache[k] = prep(samplelib.load_audio(z['pack'], z['rel'], self.lock))
        return self.cache[k]

    def _choose(self, near, key, vel):
        layers = sorted({z['layer'] for z in near})
        L = layers[min(int(vel * len(layers)), len(layers) - 1)]
        pool = [z for z in near if z['layer'] == L]
        pool.sort(key=lambda z: z['rel'])
        if len(pool) > 1:
            last = self.last.get((key, L))
            opts = [i for i in range(len(pool)) if i != last]
            i = opts[int(self.r.integers(len(opts)))]
            self.last[(key, L)] = i
            pool = [pool[i]]
        return pool[0], L, len(layers)

    def pick(self, midi, vel, artic=None):
        """-> (zone, semitone shift to apply)."""
        zs = [z for z in self.zones if z['midi'] is not None]
        if artic:
            sub = [z for z in zs if z['artic'] == artic]
            if not sub: raise samplelib.SampleError(f'{self.name}: no articulation "{artic}"')
            zs = sub
        elif any(z['artic'] == 'normal' for z in zs):
            zs = [z for z in zs if z['artic'] == 'normal']
        if not zs: raise samplelib.SampleError(f'{self.name} has no pitched samples (use hits)')
        d = min(abs(z['midi'] - midi) for z in zs)
        if d > MAX_SHIFT:
            lo, hi = min(z['midi'] for z in zs), max(z['midi'] for z in zs)
            raise samplelib.SampleError(f'{self.name}: midi note {midi} is {d} semitones from the nearest recording (range {lo}-{hi}, max shift {MAX_SHIFT:g})')
        near = [z for z in zs if abs(z['midi'] - midi) == d]
        up = [z for z in near if z['midi'] > midi]  # tie between two roots: use the higher one (shifting down keeps the tone natural)
        near = up or near
        root = near[0]['midi']
        z, L, nl = self._choose([z for z in near if z['midi'] == root], (root, artic), vel)
        return z, midi - z['midi']

    def note(self, midi, vel=.8, dur_s=None, artic=None, ring=False):
        z, shift = self.pick(int(midi), vel, artic)
        x = self.audio(z)
        if shift: x = resample(x, 2 ** (shift / 12))
        lay = z['layer']
        y = x * (float(np.clip(vel, .05, 1)) ** 1.4)
        if dur_s is not None and not ring:
            rel = int(self.cfg['release'] * SR); end = int(dur_s * SR)
            if end + rel < len(y):
                y = y[:end + rel].copy(); y[end:] *= np.cos(np.linspace(0, np.pi / 2, rel)) ** 2
        return y

    def hit(self, name, vel=.8):
        zs = [z for z in self.zones if z['kind'] == name]
        if not zs: raise samplelib.SampleError(f'{self.name}: no hit "{name}" (hits: {", ".join(sorted({z["kind"] for z in self.zones if z["kind"]}))})')
        z, L, nl = self._choose(zs, name, vel)
        x = self.audio(z)
        if len({q['rel'] for q in zs}) < 3:  # too few takes: make each hit slightly different
            x = resample(x, 2 ** (float(self.r.uniform(-.5, .5)) / 12))
            vel = vel * float(self.r.uniform(.92, 1.0))
        return x * (float(np.clip(vel, .05, 1)) ** 1.3)
