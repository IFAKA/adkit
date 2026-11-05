"""Sample layer: reads a WAV from the ad folder. A license string is required and must be CC0, own or public-domain.
The file's bytes are part of the sound's hash (see content_hash), so changing the file changes the cache key.

Params:
  file        path of the wav, relative to the ad folder (no ".." out of it)   [required]
  license     'CC0' | 'own' | 'public-domain'                                   [required]
  start, end  seconds to keep [0..]; end 0 = to the end
  semitones   resample pitch shift [-24..24] (also changes length)
  reverse     bool
  normalize   bool, default true: peak 0.5 like every other model
  velocity    [0..1]
"""
import hashlib, os, wave
import numpy as np
from .core import *

ALLOWED = {'cc0', 'cc0-1.0', 'own', 'public-domain'}


def _path(p, base_dir):
    f = p.get('file')
    if not f: raise ValueError('sample: "file" is required')
    lic = str(p.get('license') or '').strip()
    if lic.lower() not in ALLOWED:
        raise ValueError(f'sample "{f}": license is required and must be one of CC0, own, public-domain (got "{lic}")')
    base = os.path.realpath(base_dir or '.')
    full = os.path.realpath(os.path.join(base, f))
    if not (full == base or full.startswith(base + os.sep)):
        raise ValueError(f'sample "{f}": file must be inside the ad folder')
    if not os.path.isfile(full): raise ValueError(f'sample file not found: {full}')
    return full


def content_hash(p, base_dir=None):
    """sha256 of the file bytes plus the license string."""
    full = _path(p, base_dir)
    h = hashlib.sha256()
    with open(full, 'rb') as fh: h.update(fh.read())
    h.update(str(p['license']).encode())
    return h.hexdigest()


def read_wav(path):
    with wave.open(path, 'rb') as w:
        ch, sw, sr, n = w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()
        raw = w.readframes(n)
    if sw == 2: x = np.frombuffer(raw, '<i2').astype(float) / 32768
    elif sw == 3:
        b = np.frombuffer(raw, np.uint8).reshape(-1, 3).astype(np.int32)
        v = b[:, 0] | (b[:, 1] << 8) | (b[:, 2] << 16); v = np.where(v >= 1 << 23, v - (1 << 24), v); x = v / 8388608.0
    elif sw == 4: x = np.frombuffer(raw, '<i4').astype(float) / 2147483648
    elif sw == 1: x = (np.frombuffer(raw, np.uint8).astype(float) - 128) / 128
    else: raise ValueError(f'unsupported wav sample width {sw}')
    x = x.reshape(-1, ch)
    return x, sr


def render(p, seed=0, base_dir=None):
    full = _path(p, base_dir)
    x, sr = read_wav(full)
    x = x.mean(1)  # samples are folded to mono; the layer pan places them
    if sr != SR:
        x = np.interp(np.arange(int(len(x) * SR / sr)) * sr / SR, np.arange(len(x)), x)
    s = int(float(p.get('start') or 0) * SR)
    e = int(float(p['end']) * SR) if p.get('end') else len(x)
    x = x[s:e]
    st = float(pget(p, 'semitones', 0, -24, 24))
    if st:
        k = 2 ** (st / 12)
        x = np.interp(np.arange(int(len(x) / k)) * k, np.arange(len(x)), x)
    if p.get('reverse'): x = x[::-1]
    if len(x) < 2: raise ValueError('sample: nothing left after start/end')
    x = fade(x, 1, 5)
    return finish(x, float(pget(p, 'velocity', 1, 0, 1))) if p.get('normalize', True) else x * float(pget(p, 'velocity', 1, 0, 1))
