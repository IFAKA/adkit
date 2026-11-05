"""Cue placement: renders every cue's sound (sounddesign.py) at its cue time and mixes it over the music.

The plan says which sound each cue plays (the TypeScript side resolved cue name > role > kind and dropped silent cues).
Nothing here picks a sound: a cue without a placement is silent.
"""
import copy, hashlib, json, os, sys
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import score, sounddesign  # noqa: E402
from synth.core import SR, db, nsamp, pan_stereo, to_freq  # noqa: E402


def code_hash():
    """Changes when any audio code changes, so cached renders never go stale."""
    h = hashlib.sha256(); root = os.path.dirname(os.path.abspath(__file__))
    for d, dirs, files in os.walk(root):
        dirs[:] = sorted(x for x in dirs if x not in ('tests', 'demos', '__pycache__', 'out'))
        for f in sorted(files):
            if f.endswith('.py'):
                h.update(os.path.relpath(os.path.join(d, f), root).encode()); h.update(open(os.path.join(d, f), 'rb').read())
    return h.hexdigest()


class Cache:
    def __init__(self, path, code):
        self.path, self.code = path, code
        if path: os.makedirs(path, exist_ok=True)

    def slot(self, key):
        return os.path.join(self.path, hashlib.sha256((self.code + key).encode()).hexdigest()[:24])

    def get(self, key, fn):
        """Return the array for `key` (a string); compute with fn() and store when missing."""
        k = hashlib.sha256((self.code + key).encode()).hexdigest()[:24]
        f = os.path.join(self.path, k + '.npy') if self.path else None
        if f and os.path.exists(f): return np.load(f)
        x = fn()
        if f: np.save(f + '.tmp.npy', x); os.replace(f + '.tmp.npy', f)
        return x


def chord_shift(cues, key, t):
    """Semitones (-5..6) from the music's tonic to the root of the chord playing at time t."""
    tonic, _ = score.parse_key(key)
    name = None
    for b in cues['bars']:
        if b['start'] <= t + 1e-6: name = b['chord']
        else: break
    if not name: return 0
    root, _ = score.parse_chord(name)
    s = (root - tonic) % 12
    return s - 12 if s > 6 else s


def tuned(sound, shift):
    """A copy of the sound with every written note moved by `shift` semitones."""
    if not shift: return sound
    s = copy.deepcopy(sound)
    for L in s['layers']:
        if L.get('note') is not None: L['note'] = float(to_freq(L['note']) * 2 ** (shift / 12))
        if L.get('params', {}).get('freq') is not None: L['params']['freq'] = float(to_freq(L['params']['freq']) * 2 ** (shift / 12))
    return s


def render(plan, music_cues, N, cache, base_dir):
    """Return (cue bus (N,2), duck curve in dB (N,), list of (sound, variation, shift) rendered)."""
    sounds = plan['sounds']; bus = np.zeros((N, 2)); duck = np.zeros(N)
    mix = plan.get('mix') or {}; default_duck = float(mix.get('duckMusic', 0)); base_seed = int(plan.get('seed', 21))
    seen = {}; used = []
    key = (music_cues or {}).get('key', 'C major')
    for p in sorted(plan['placements'], key=lambda p: (p['seconds'], p['cue'])):
        name = p['sound']; sd = sounds[name]
        n = seen.get(name, 0); seen[name] = n + 1
        var = n % max(1, int(p.get('variations', 3)))
        shift = chord_shift(music_cues, key, float(p['seconds'])) if sd.get('tune') == 'chord' else 0
        seed = (int(sd.get('seed', 0)) + base_seed * 1009 + var * 7919) & 0x7FFFFFFF
        sd2 = tuned(sd, shift)
        ck = 'snd:' + sounddesign.content_hash(sd2, seed, base_dir)
        x = cache.get(ck, lambda: sounddesign.render_sound(sd2, seed, base_dir))
        used.append((name, var, shift))
        g = float(p.get('gain', 0)); x = x * db(g)
        if p.get('pan'): x = pan_stereo(x, float(p['pan']))
        t = float(p['seconds']); d = float(p.get('durationSeconds') or 0)
        if p.get('align') == 'end' and d: t = t + d - len(x) / SR
        i = int(round(t * SR))
        if i < 0: x = x[-i:]; i = 0
        if i >= N: continue
        x = x[:N - i]; bus[i:i + len(x)] += x
        dk = float(p['duck']) if p.get('duck') is not None else default_duck
        if dk > 0:
            j = min(N, i + int(0.15 * SR)); duck[i:j] = np.maximum(duck[i:j], dk)
    if not duck.any(): return bus, duck, used
    a = np.exp(-1 / (0.01 * SR)); b = np.exp(-1 / (0.08 * SR)); out = np.zeros(N); cur = 0.0
    for i in range(N):
        d_ = duck[i]; cur = d_ + (cur - d_) * (a if d_ > cur else b); out[i] = cur
    return bus, out, used
