#!/usr/bin/env python3
"""Render one SOUND (JSON) to a wav. The engine only plays what the data describes.

    python3 audio/sounddesign.py SOUND.json --out OUT.wav [--seed N] [--base-dir DIR]
    python3 audio/sounddesign.py --models        (list models, presets and where their params are documented)

SOUND = {
  "meaning": "what object in the product's world this is, and why",   (required, at least 3 words)
  "seed": 1, "bpm": 120,                                               (optional; bpm only for at_beats)
  "layers": [{"model": "modal", "preset": "tram_bell", "params": {...}, "note": "E6",
              "at": 0.0 | "at_beats": 1.5, "gain": -6, "pan": 0.0, "fx": [...], "reverse": false, "repeat": {"count": 3, "every": 0.2, "gain_step": -3}}],
  "fx": [{"type": "reverb", ...}]                                     (applied to the sum; see synth/fx.py)
}
Exit code 1 with a clear message on any problem (no meaning, unknown model, bad license ...).
"""
import argparse, hashlib, json, os, sys
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import synth  # noqa: E402
from synth import sample as sample_mod  # noqa: E402
from synth.core import SR, db, nsamp, pan_stereo, as_stereo, to_freq  # noqa: E402
from synth.wavio import write_wav  # noqa: E402


class SoundError(Exception):
    pass


def validate(sound):
    if not isinstance(sound, dict): raise SoundError('sound must be a JSON object')
    m = sound.get('meaning')
    if not isinstance(m, str) or len(m.split()) < 3:
        raise SoundError('sound has no "meaning". Say what object in the product\'s world this is and why it is in the ad '
                         '(at least 3 words, e.g. "tram bell at the stop: the city map app is about trams").')
    layers = sound.get('layers')
    if not isinstance(layers, list) or not layers: raise SoundError('sound needs a non-empty "layers" list')
    for i, L in enumerate(layers):
        if not isinstance(L, dict) or 'model' not in L: raise SoundError(f'layer {i}: "model" is required')


def content_hash(sound, seed=None, base_dir=None):
    """sha256 over the canonical JSON, the seed and the bytes of every sample file."""
    h = hashlib.sha256()
    h.update(json.dumps(sound, sort_keys=True, separators=(',', ':')).encode())
    h.update(str(seed if seed is not None else sound.get('seed', 0)).encode())
    for L in sound.get('layers', []):
        if L.get('model') == 'sample':
            h.update(sample_mod.content_hash(L.get('params', {}), base_dir).encode())
    return h.hexdigest()


def render_layer(L, i, seed, base_dir, bpm=None):
    params = dict(L.get('params') or {})
    if L.get('note') is not None: params['freq'] = to_freq(L['note'])
    lseed = int(np.random.SeedSequence([int(seed) & 0xFFFFFFFF, i]).generate_state(1)[0] & 0x7FFFFFFF)
    try:
        y = synth.render_model(L['model'], params, lseed, L.get('preset'), base_dir)
    except (ValueError, KeyError) as e:
        raise SoundError(f'layer {i} ({L["model"]}): {e}')
    if L.get('reverse'): y = y[::-1].copy()
    st = pan_stereo(y, float(L.get('pan', 0))) * db(float(L.get('gain', 0)))
    if L.get('fx'): st = synth.fx.apply_fx(st, L['fx'], lseed)
    return st


def render_sound(sound, seed=None, base_dir=None):
    validate(sound)
    seed = int(seed if seed is not None else sound.get('seed', 0))
    bpm = sound.get('bpm')
    parts = []
    for i, L in enumerate(sound['layers']):
        st = render_layer(L, i, seed, base_dir, bpm)
        if 'at_beats' in L:
            if not bpm: raise SoundError(f'layer {i}: at_beats needs "bpm" on the sound')
            at = float(L['at_beats']) * 60.0 / float(bpm)
        else:
            at = float(L.get('at', 0))
        rep = L.get('repeat') or {}
        for k in range(int(rep.get('count', 1))):
            parts.append((at + k * float(rep.get('every', 0)), st * db(k * float(rep.get('gain_step', 0)))))
    n = max(nsamp(a) + len(s) for a, s in parts)
    mix = np.zeros((n, 2))
    for a, s in parts:
        i = int(round(a * SR)); mix[i:i + len(s)] += s
    if sound.get('fx'):
        mix = synth.fx.apply_fx(mix, sound['fx'], seed)
    pk = np.abs(mix).max()
    if pk > 0.98: mix = mix * (0.98 / pk)   # safety only; levels come from the layer gains
    return mix


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('sound', nargs='?'); ap.add_argument('--out'); ap.add_argument('--seed', type=int); ap.add_argument('--base-dir')
    ap.add_argument('--models', action='store_true')
    a = ap.parse_args(argv)
    if a.models:
        for m in sorted(synth.MODELS) + ['sample']:
            print(m, '| presets:', ', '.join(synth.PRESETS.get(m, [])) or '-')
        return 0
    if not a.sound or not a.out: ap.error('SOUND.json and --out are required')
    try:
        with open(a.sound) as fh: sound = json.load(fh)
        base = a.base_dir or os.path.dirname(os.path.abspath(a.sound))
        y = render_sound(sound, a.seed, base)
        os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
        write_wav(a.out, y)
    except (SoundError, ValueError, OSError, json.JSONDecodeError) as e:
        print(f'sounddesign: {e}', file=sys.stderr); return 1
    print(f'sound ok {len(y) / SR:.2f} s hash {content_hash(sound, a.seed, base)[:12]}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
