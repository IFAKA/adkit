"""Effects on a stereo (n,2) float array. All deterministic (reverb impulse responses are seeded).

apply_fx(x, chain, seed, keys=None) -> stereo array (reverb and delay lengthen it by their tail).
Each chain item is {"type": ..., params}:
  gain        db [-60..24]
  pan         pan [-1..1]
  lowpass / highpass   hz [20..20000], q [0.3..10]
  eq          bands: [{type: lowshelf|highshelf|peak|lowpass|highpass|notch, hz, gain_db [-24..24], q}]
  saturate    drive [0..1], mix [0..1]  (tanh waveshaper, level kept)
  reverb      rt60 [0.1..8] s, wet [0..1], predelay_ms [0..200], damp_hz [1000..16000], size [0.3..2] (early reflections), width [0..1]
  delay       time [0.02..2] s, feedback [0..0.9], wet [0..1], pingpong bool, damp_hz
  widen       amount [0..1] (mid/side)
  duck        key (name of another stem, in score.py), depth_db [0..24], release [0.02..1] s
  limit       ceiling_db [-12..0]
  compress    threshold_db [-40..0], ratio [1..20], attack_ms [0.5..100], release_ms [10..1000], makeup_db [0..24], detect_hz [0..400] (highpass on the level detector, so bass does not pump the bus)
"""
import numpy as np
from .core import *


def _ext(x, extra):
    return np.concatenate([x, np.zeros((extra, x.shape[1]))], 0)


def reverb(x, seed, rt60=1.2, wet=.25, predelay_ms=12, damp_hz=5500, size=1.0, width=1.0):
    rt60 = float(np.clip(rt60, .1, 8)); r = rng(seed, 'reverb')
    n = nsamp(rt60 * 1.1 + .05); t = tvec(n)
    late = r.standard_normal((n, 2))
    lo = lp(late, float(np.clip(damp_hz, 1000, 16000)), 2); hi = late - lo
    ir = lo * decay_env(n, rt60)[:, None] + hi * decay_env(n, rt60 * .35)[:, None]
    ir *= np.minimum(t / (.02 * size), 1)[:, None]
    # early reflections: sparse taps in the first 60 ms
    for _ in range(14):
        i = int(r.uniform(.003, .06) * size * SR)
        if i < n: ir[i] += r.choice([-1, 1], 2) * r.uniform(.3, 1) * 2.0 * np.exp(-i / SR / .04)
    if width < 1:
        m = ir.mean(1, keepdims=True); ir = m + (ir - m) * width
    ir /= np.sqrt((ir ** 2).sum(0, keepdims=True))
    pre = nsamp(predelay_ms / 1000) - 1 if predelay_ms > 0 else 0
    ir = np.concatenate([np.zeros((pre, 2)), ir], 0)
    xe = _ext(x, len(ir))
    w = np.stack([fftconv(xe[:, c], ir[:, c])[:len(xe)] for c in range(2)], 1)
    return xe + float(wet) * w * 1.0


def delay(x, seed, time=.3, feedback=.4, wet=.35, pingpong=False, damp_hz=5000):
    time = float(np.clip(time, .02, 2)); fb = float(np.clip(feedback, 0, .9))
    k = 1
    while fb ** k > 1e-3 and k < 40: k += 1
    step = nsamp(time)
    y = _ext(x, step * (k + 1))
    src = lp(x, damp_hz, 2) if damp_hz < 16000 else x
    for i in range(1, k + 1):
        g = wet * fb ** (i - 1)
        s = src if not pingpong else src.mean(1, keepdims=True) * (np.array([[1.0, 0.0]]) if i % 2 else np.array([[0.0, 1.0]]))
        y[i * step:i * step + len(x)] += g * s
    return y


def saturate(x, seed, drive=.4, mix=1.0):
    d = 1 + 9 * float(np.clip(drive, 0, 1))
    wetx = np.tanh(d * x) / np.tanh(d) if d > 1 else x
    wetx *= np.abs(x).max() / max(np.abs(wetx).max(), 1e-9)
    return (1 - mix) * x + mix * wetx


def duck(x, seed, key=None, depth_db=8, release=.15):
    if key is None: return x
    k = np.abs(key if key.ndim == 1 else key.mean(1))
    k = np.pad(k, (0, max(0, len(x) - len(k))))[:len(x)]
    env = biquad(k, 'lowpass', 1 / (TAU * max(release, .02)), .5)
    env = np.clip(env / max(env.max(), 1e-9) * 1.6, 0, 1)
    g = 1 - (1 - db(-float(depth_db))) * env
    return x * g[:, None]


def limit(x, seed, ceiling_db=-1.0):
    ceil = float(db(ceiling_db)); n = len(x); B = 48; nb = -(-n // B)
    a = np.zeros(nb * B); a[:n] = np.abs(x).max(1)
    need = np.minimum(1.0, ceil / np.maximum(a, 1e-9)).reshape(nb, B).min(1)
    d = need.copy()
    for k in range(1, 4):
        d[k:] = np.minimum(d[k:], need[:-k]); d[:-k] = np.minimum(d[:-k], need[k:])
    g = np.repeat(d, B)
    w = np.hanning(6 * B + 2)[1:-1]; w /= w.sum()
    g = np.convolve(np.pad(g, (len(w) // 2, len(w) // 2), mode='edge'), w, mode='valid')[:nb * B][:n]
    return np.minimum(x * g[:, None], ceil)


def compress(x, seed, threshold_db=-18, ratio=3, attack_ms=12, release_ms=140, makeup_db=0, detect_hz=0):
    """Feed-forward bus compressor (peak detector on 0.7 ms blocks, linked stereo, smooth gain curve)."""
    B = 32; n = len(x); nb = -(-n // B)
    d = hp(x, float(detect_hz), 2) if detect_hz > 0 else x
    a = np.zeros(nb * B); a[:n] = np.abs(d).max(1)
    lv = todb(a.reshape(nb, B).max(1))
    over = np.maximum(lv - float(threshold_db), 0) * (1 - 1 / max(float(ratio), 1.0))
    ca = np.exp(-B / SR / (max(attack_ms, .5) / 1000)); cr = np.exp(-B / SR / (max(release_ms, 10) / 1000))
    gr = np.zeros(nb); cur = 0.0
    for i in range(nb):
        o = over[i]
        cur = ca * cur + (1 - ca) * o if o > cur else cr * cur + (1 - cr) * o
        gr[i] = cur
    g = db(-gr + float(makeup_db))
    gs = np.interp(np.arange(n), (np.arange(nb) + .5) * B, g)
    return x * gs[:, None]


def apply_fx(x, chain, seed=0, keys=None):
    x = as_stereo(np.asarray(x, dtype=float))
    for i, it in enumerate(chain or []):
        t = it.get('type'); s = (int(seed) * 131 + i)
        q = {k: v for k, v in it.items() if k != 'type'}
        if t == 'gain': x = x * db(float(q.get('db', 0)))
        elif t == 'pan': x = pan_stereo(x, float(q.get('pan', 0)))
        elif t in ('lowpass', 'highpass'): x = biquad(x, t, float(q.get('hz', 1000)), float(q.get('q', .7071)))
        elif t == 'eq':
            for b in q.get('bands', []):
                x = biquad(x, b.get('type', 'peak'), float(b['hz']), float(b.get('q', 1.0)), float(b.get('gain_db', 0)))
        elif t == 'saturate': x = saturate(x, s, **q)
        elif t == 'reverb': x = reverb(x, s, **q)
        elif t == 'delay': x = delay(x, s, **q)
        elif t == 'widen':
            a = float(q.get('amount', .5)); m = x.mean(1, keepdims=True); sd = x - m
            x = m + sd * (1 + 2 * a)
        elif t == 'duck':
            name = q.pop('key', None)
            x = duck(x, s, (keys or {}).get(name), **q)
        elif t == 'limit': x = limit(x, s, **q)
        elif t == 'compress': x = compress(x, s, **q)
        else: raise ValueError(f"unknown fx type '{t}'")
    return x
