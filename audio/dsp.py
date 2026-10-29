"""Numpy-only DSP helpers: filters (FFT, zero phase), reverb, panning, envelopes. No scipy, no samples."""
import numpy as np

SR = 48000
TAU = 2 * np.pi


def mtof(m): return 440.0 * 2 ** ((m - 69) / 12)
def db(v): return 10 ** (np.asarray(v, dtype=float) / 20) if not np.isscalar(v) else 10 ** (v / 20)
def tvec(n): return np.arange(n) / SR


def st(m, pan=0.0):
    """Mono -> stereo (pan -1..1, equal power)."""
    a = np.sqrt((1 - pan) / 2) * 1.414
    b = np.sqrt((1 + pan) / 2) * 1.414
    return np.stack([m * a, m * b], 1)


def _nfft(n):
    k = 1
    while k < n:
        k *= 2
    return k


_MASK = {}


def _mask(nfft, kind, fc, o):
    key = (nfft, kind, fc, o)
    m = _MASK.get(key)
    if m is None:
        f = np.fft.rfftfreq(nfft, 1.0 / SR)
        if kind == 'low':
            m = 1.0 / np.sqrt(1.0 + (f / fc) ** (2 * o))
        else:
            m = 1.0 / np.sqrt(1.0 + (fc / np.maximum(f, 1e-9)) ** (2 * o))
            m[0] = 0.0
        _MASK[key] = m
    return m


def _apply(x, masks):
    n = x.shape[0]
    nf = _nfft(n + 4096)
    X = np.fft.rfft(x, nf, axis=0)
    for m in masks:
        X = X * (m[:, None] if x.ndim == 2 else m)
    return np.fft.irfft(X, nf, axis=0)[:n]


def lp(x, fc, o=2): return _apply(x, [_mask(_nfft(x.shape[0] + 4096), 'low', float(fc), o)])
def hp(x, fc, o=2): return _apply(x, [_mask(_nfft(x.shape[0] + 4096), 'high', float(fc), o)])
def bp(x, lo, hi, o=2):
    nf = _nfft(x.shape[0] + 4096)
    return _apply(x, [_mask(nf, 'high', float(lo), o), _mask(nf, 'low', float(hi), o)])


def fftconv(x, h):
    n = x.shape[0] + h.shape[0] - 1
    nf = _nfft(n)
    X = np.fft.rfft(x, nf, axis=0)
    H = np.fft.rfft(h, nf, axis=0)
    return np.fft.irfft(X * H, nf, axis=0)[:n]


def rel(y, t, dur, r):
    return y * np.where(t < dur, 1.0, np.exp(-(t - dur) * r))


def modal(f, ratios, amps, decs, length, detune=0.0):
    t = tvec(int(length * SR))
    y = np.zeros(len(t))
    for r, a, d in zip(ratios, amps, decs):
        y += a * np.sin(TAU * f * r * (1 + detune) * t) * np.exp(-t / d)
    return y * np.minimum(t / 0.0015, 1)


def reverb(x, secs=1.8, seed=1, damp=4500):
    r = np.random.default_rng(seed)
    n = int(secs * SR)
    ir = r.standard_normal((n, 2)) * np.exp(-np.arange(n) / (secs * SR / 5.5))[:, None]
    ir = lp(ir, damp, 2)
    k = int(.012 * SR)
    ir[:k] *= np.linspace(0, 1, k)[:, None]
    ir /= np.sqrt((ir ** 2).sum(0))
    return fftconv(x, ir)[:len(x)]


def reverb_mix(x, wet, seed=3):
    return x + wet * reverb(x, 1.8, seed)
