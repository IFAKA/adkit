"""Shared numpy helpers for audio/synth: constants, seeded randomness, causal biquad filters, envelopes, notes.

Everything is vectorised. Biquads use the closed form impulse response of the poles (no per-sample loop),
so they are causal (no pre-ringing) and cheap with FFT convolution.
"""
import re
import numpy as np

SR = 48000
TAU = 2 * np.pi
PEAK = 0.5  # every model returns audio whose peak is 0.5 (-6 dBFS) at velocity 1


def rng(seed, *salt):
    """Independent deterministic generator for (seed, salt...). Salt may be ints or strings."""
    parts = [int(seed) & 0xFFFFFFFF]
    for s in salt:
        parts.append(int(s) & 0xFFFFFFFF if not isinstance(s, str) else sum((i + 1) * ord(c) for i, c in enumerate(s)) & 0xFFFFFFFF)
    return np.random.default_rng(np.random.SeedSequence(parts))


def mtof(m): return 440.0 * 2.0 ** ((np.asarray(m, dtype=float) - 69) / 12)
def db(v): return 10.0 ** (np.asarray(v, dtype=float) / 20)
def todb(v): return 20 * np.log10(np.maximum(v, 1e-12))
def tvec(n): return np.arange(int(n)) / SR
def nsamp(sec): return max(1, int(round(float(sec) * SR)))


_NOTE = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}


def note_to_midi(n):
    """'D4' 'F#3' 'Bb2' -> midi number (C4 = 60). Numbers pass through as midi."""
    if isinstance(n, (int, float)):
        return float(n)
    m = re.fullmatch(r'([A-Ga-g])([#b]?)(-?\d)', str(n).strip())
    if not m:
        raise ValueError(f"bad note name '{n}' (use e.g. D4, F#3, Bb2)")
    return 12.0 * (int(m.group(3)) + 1) + _NOTE[m.group(1).upper()] + (1 if m.group(2) == '#' else -1 if m.group(2) == 'b' else 0)


def to_freq(v):
    """Hz number, 'hz:440', note name, or midi via 'm:60'."""
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v)
    if s.startswith('m:'):
        return float(mtof(float(s[2:])))
    return float(mtof(note_to_midi(s)))


def finish(x, velocity=1.0, peak=PEAK):
    """Normalise to PEAK * velocity (peak). Keeps the shape. Returns float64."""
    x = np.nan_to_num(np.asarray(x, dtype=float))
    p = np.abs(x).max()
    return x * (peak * float(velocity) / p) if p > 1e-12 else x


def fade(x, ms_in=0.5, ms_out=5.0):
    """Short fades so a sound never starts or ends with a click."""
    n = len(x)
    a, b = min(n // 2, int(ms_in * SR / 1000)), min(n // 2, int(ms_out * SR / 1000))
    x = x.copy()
    if a > 0: x[:a] *= np.linspace(0, 1, a, endpoint=False).reshape((-1,) + (1,) * (x.ndim - 1))
    if b > 0: x[-b:] *= np.linspace(1, 0, b).reshape((-1,) + (1,) * (x.ndim - 1))
    return x


def pget(p, key, default, lo=None, hi=None):
    """Read a param with a default and clamp to the documented range."""
    v = p.get(key, default)
    if v is None: v = default
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        if lo is not None: v = max(lo, v)
        if hi is not None: v = min(hi, v)
    return v


def _nfft(n):
    k = 1
    while k < n: k *= 2
    return k


def fftconv(x, h):
    """Full convolution along axis 0. x (n,) or (n,c); h (m,) or (m,c)."""
    n = x.shape[0] + h.shape[0] - 1
    nf = _nfft(n)
    X = np.fft.rfft(x, nf, axis=0); H = np.fft.rfft(h, nf, axis=0)
    if X.ndim == 2 and H.ndim == 1: H = H[:, None]
    if H.ndim == 2 and X.ndim == 1: X = X[:, None]
    return np.fft.irfft(X * H, nf, axis=0)[:n]


# ---------------------------------------------------------------- biquads (RBJ cookbook)

def biquad_coefs(kind, fc, q=0.7071, gain_db=0.0):
    fc = float(np.clip(fc, 10.0, SR * 0.49))
    w = TAU * fc / SR; cw, sw = np.cos(w), np.sin(w)
    A = 10 ** (gain_db / 40); al = sw / (2 * q)
    if kind == 'lowpass':   b = [(1 - cw) / 2, 1 - cw, (1 - cw) / 2]; a = [1 + al, -2 * cw, 1 - al]
    elif kind == 'highpass': b = [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2]; a = [1 + al, -2 * cw, 1 - al]
    elif kind == 'bandpass': b = [al, 0, -al]; a = [1 + al, -2 * cw, 1 - al]
    elif kind == 'notch':   b = [1, -2 * cw, 1]; a = [1 + al, -2 * cw, 1 - al]
    elif kind == 'peak':    b = [1 + al * A, -2 * cw, 1 - al * A]; a = [1 + al / A, -2 * cw, 1 - al / A]
    elif kind in ('lowshelf', 'highshelf'):
        s = 2 * np.sqrt(A) * al
        if kind == 'lowshelf':
            b = [A * ((A + 1) - (A - 1) * cw + s), 2 * A * ((A - 1) - (A + 1) * cw), A * ((A + 1) - (A - 1) * cw - s)]
            a = [(A + 1) + (A - 1) * cw + s, -2 * ((A - 1) + (A + 1) * cw), (A + 1) + (A - 1) * cw - s]
        else:
            b = [A * ((A + 1) + (A - 1) * cw + s), -2 * A * ((A - 1) + (A + 1) * cw), A * ((A + 1) + (A - 1) * cw - s)]
            a = [(A + 1) - (A - 1) * cw + s, 2 * ((A - 1) - (A + 1) * cw), (A + 1) - (A - 1) * cw - s]
    else:
        raise ValueError(f"unknown filter '{kind}'")
    a0 = a[0]
    return np.array(b) / a0, np.array(a) / a0


def biquad_ir(b, a, n):
    """First n samples of the impulse response, closed form from the two poles."""
    p = np.roots([1.0, a[1], a[2]]).astype(complex)
    r = np.abs(p).max()
    if r >= 0.99999: p = p / r * 0.99999; r = 0.99999
    # stop when the tail is below -120 dB or at n
    m = int(min(n, max(8, np.log(1e-6) / np.log(max(r, 1e-6)) + 8)))
    k = np.arange(m)
    if abs(p[0] - p[1]) < 1e-9:
        g = (k + 1) * p[0] ** k
    else:
        g = (p[0] ** (k + 1) - p[1] ** (k + 1)) / (p[0] - p[1])
    g = g.real
    return np.convolve(g, b)[:m]


def biquad(x, kind, fc, q=0.7071, gain_db=0.0):
    """Causal 2nd-order filter along axis 0 (mono or stereo)."""
    b, a = biquad_coefs(kind, fc, q, gain_db)
    h = biquad_ir(b, a, x.shape[0] + 64)
    return fftconv(x, h)[:x.shape[0]]


def lp(x, fc, order=2, q=0.7071):
    for _ in range(max(1, order // 2)): x = biquad(x, 'lowpass', fc, q)
    return x


def hp(x, fc, order=2, q=0.7071):
    for _ in range(max(1, order // 2)): x = biquad(x, 'highpass', fc, q)
    return x


def bp(x, lo, hi, order=2):
    return lp(hp(x, lo, order), hi, order)


def reson(x, fc, q):
    """Resonant band (peak gain about 1)."""
    return biquad(x, 'bandpass', fc, q)


def sweep_lp(x, fc_curve, kind='lowpass', q=0.7071, steps=10):
    """Filter whose cutoff follows fc_curve (Hz, one value per sample). Cross-fades `steps` fixed filters in log-frequency."""
    fc = np.clip(np.asarray(fc_curve, dtype=float), 20.0, SR * 0.45)
    lo, hi = fc.min(), fc.max()
    if hi / lo < 1.02:
        return biquad(x, kind, float(np.sqrt(lo * hi)), q)
    grid = np.geomspace(lo, hi, steps)
    pos = np.interp(np.log(fc), np.log(grid), np.arange(steps))
    i0 = np.minimum(np.floor(pos).astype(int), steps - 2); f = pos - i0
    outs = [biquad(x, kind, g, q) for g in grid]
    stack = np.stack(outs, 0)
    idx = np.arange(x.shape[0])
    if x.ndim == 1:
        return stack[i0, idx] * (1 - f) + stack[i0 + 1, idx] * f
    return stack[i0, idx] * (1 - f)[:, None] + stack[i0 + 1, idx] * f[:, None]


# ---------------------------------------------------------------- envelopes and noise

def adsr(n_gate, a=0.01, d=0.1, s=0.7, r=0.2, curve=2.0):
    """ADSR over n_gate samples of gate plus release tail of r seconds. Exponential-ish segments."""
    na, nd, nr = nsamp(a), nsamp(d), nsamp(r)
    total = n_gate + nr
    e = np.zeros(total)
    na = min(na, n_gate)
    e[:na] = (np.arange(na) / max(na, 1)) ** (1 / curve)
    nd = min(nd, max(n_gate - na, 0))
    e[na:na + nd] = s + (1 - s) * np.exp(-5.0 * np.arange(nd) / max(nd, 1))
    e[na + nd:n_gate] = s
    lvl = e[n_gate - 1] if n_gate > 0 else 0.0
    e[n_gate:] = lvl * np.exp(-6.0 * np.arange(nr) / max(nr, 1)) * np.linspace(1, 0, nr)
    return e


def decay_env(n, t60):
    """Exponential decay reaching -60 dB at t60 seconds."""
    return 10 ** (-3.0 * np.arange(n) / SR / max(t60, 1e-4))


def white(r, n): return r.standard_normal(n)


def pink(r, n):
    """Pink-ish noise (1/f) by spectral shaping."""
    nf = _nfft(n)
    X = np.fft.rfft(r.standard_normal(nf))
    f = np.maximum(np.arange(len(X)), 1.0)
    return np.fft.irfft(X / np.sqrt(f), nf)[:n] * np.sqrt(nf / 8.0)


def slow_noise(r, n, hz, depth=1.0):
    """Smooth random curve in about [-1, 1] changing at roughly `hz` times per second."""
    nf = _nfft(n)
    X = np.fft.rfft(r.standard_normal(nf))
    f = np.fft.rfftfreq(nf, 1 / SR)
    X *= 1.0 / (1.0 + (f / max(hz, 1e-3)) ** 4)
    y = np.fft.irfft(X, nf)[:n]
    s = y.std()
    return np.clip(y / (s * 2.5 if s > 0 else 1), -1, 1) * depth


def pan_stereo(m, pan=0.0):
    """Mono -> stereo with equal power pan (-1 left .. 1 right). Stereo input passes through with a balance."""
    th = (np.clip(pan, -1, 1) + 1) * np.pi / 4
    l, r_ = np.cos(th) * np.sqrt(2), np.sin(th) * np.sqrt(2)
    if m.ndim == 2:
        return m * np.array([min(1.0, l), min(1.0, r_)])
    return np.stack([m * l, m * r_], 1)


def as_stereo(x):
    return np.stack([x, x], 1) if x.ndim == 1 else x
