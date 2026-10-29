"""Instruments and the SFX palette. Everything is synthesised from math; arrays returned from cached
functions must be treated as read-only."""
from functools import lru_cache
import numpy as np
from dsp import *


# ---- pitched instruments ------------------------------------------------------
@lru_cache(maxsize=None)
def ep(f, dur, vel=1.0):
    """Warm electric piano (2-op FM, light chorus L/R)."""
    n = int((dur + 0.7) * SR); t = tvec(n)
    amp = np.minimum(t / 0.004, 1) * np.exp(-t * (1.5 + f / 900))
    amp = rel(amp, t, dur, 12)
    I = (0.7 + 1.5 * vel) * np.exp(-t * 4.0) + 0.25
    def v(ff): return np.sin(TAU * ff * t + I * np.sin(TAU * ff * t))
    tine = 0.10 * vel * np.sin(TAU * f * 6 * t) * np.exp(-t * 45)
    return np.stack([(v(f * 1.0012) + tine) * amp, (v(f * 0.9988) + tine) * amp], 1) * 0.22 * vel


@lru_cache(maxsize=None)
def marimba(f, vel=1.0, ring=1.0):
    y = modal(f, [1, 3.93, 9.2], [1, .32, .08], [.5 * ring, .13 * ring, .05], 1.6 * ring)
    return st(y * 0.5 * vel)


@lru_cache(maxsize=None)
def bell(f, dec=0.55, vel=1.0):
    """Oven-timer ding: inharmonic metal partials plus a detuned twin for shimmer."""
    r = [1, 2.76, 5.40, 8.93, 1.0035]
    y = modal(f, r, [1, .42, .2, .1, .5], [dec, dec * .5, dec * .25, dec * .12, dec * .9], dec * 5 + .3)
    return st(y * 0.4 * vel)


@lru_cache(maxsize=None)
def bass(f, dur, vel=1.0):
    n = int((dur + 0.25) * SR); t = tvec(n)
    ph = TAU * f * t
    y = np.sin(ph) + 0.30 * np.sin(2 * ph) + 0.06 * np.sin(3 * ph)
    amp = np.minimum(t / 0.006, 1) * np.exp(-t * 2.2); amp = rel(amp, t, dur, 25)
    return st(y * amp * 0.5 * vel)


@lru_cache(maxsize=None)
def pad(freqs, dur):
    n = int((dur + 0.5) * SR); t = tvec(n); y = np.zeros(n)
    for f in freqs:
        for dt, ph in ((0.997, 0), (1.003, 1.7)):
            y += np.sin(TAU * f * dt * t + ph) + 0.25 * np.sin(TAU * 2 * f * dt * t)
    env = np.minimum(t / 0.3, 1.0) * np.where(t < dur, 1, np.exp(-(t - dur) * 9))
    return st(lp(y, 1800) * env * 0.035 / max(1, len(freqs) / 4))


def ping(f, vel=1.0, cents=0.0, pan=0.0):
    f = f * 2 ** (cents / 1200); t = tvec(int(0.5 * SR))
    y = (np.sin(TAU * f * t) * np.exp(-t / .10) + .35 * np.sin(TAU * 2 * f * t) * np.exp(-t / .04)
         + .12 * np.sin(TAU * 3.01 * f * t) * np.exp(-t / .02)) * np.minimum(t / 0.0012, 1)
    return st(y * 0.35 * vel, pan)


# ---- kitchen percussion ---------------------------------------------------------
@lru_cache(maxsize=None)
def thump(vel=1.0):
    """Rolling pin on a flour sack: pitch-dropping sine + soft low knock."""
    n = int(0.45 * SR); t = tvec(n)
    ph = TAU * np.cumsum(46 + 85 * np.exp(-t * 38)) / SR
    y = np.sin(ph) * np.exp(-t * 11)
    knock = np.sin(TAU * 150 * t) * np.exp(-t * 90) * .5
    nz = lp(np.random.default_rng(3).standard_normal(n), 600) * np.exp(-t * 120) * 1.5
    return st((y + knock + nz) * 0.8 * vel * np.minimum(t / 0.0015, 1))


@lru_cache(maxsize=None)
def clink(f=2300, vel=1.0):
    """Spoon on a ceramic cup."""
    y = modal(f, [1, 2.41, 4.12, 6.37], [1, .6, .35, .2], [.11, .07, .045, .03], 0.4)
    t = tvec(len(y))
    y = y + hp(np.random.default_rng(int(f)).standard_normal(len(y)), 3000) * np.exp(-t / .004) * .3
    return st(y * 0.45 * vel)


@lru_cache(maxsize=None)
def board(vel=1.0):
    """Knife tap on a wooden board."""
    t = tvec(int(0.12 * SR))
    y = np.sin(TAU * 920 * t) * np.exp(-t / .012) + .5 * np.sin(TAU * 1480 * t) * np.exp(-t / .008)
    return st(y * 0.5 * vel)


_NZ = np.random.default_rng(11).standard_normal(SR)


@lru_cache(maxsize=None)
def whisk(vel=1.0, k=0):
    """Whisk / shaker: short band noise with a quick swell."""
    n = int(0.085 * SR); t = tvec(n); nz = np.roll(_NZ, k * 997)[:n]
    y = bp(nz, 4500, 11000) * np.minimum(t / 0.009, 1) * np.exp(-t / 0.028)
    return st(y * 0.55 * vel)


# ---- sonic logo -----------------------------------------------------------------
def motif(buf, t0, notes, ding, beat_s, vel=1.0, ep_layer=True, mar=True):
    """Add the motif to stereo buffer `buf` starting at t0 seconds. notes = [(beat, midi, beats)]."""
    def put(x, t, g=1.0):
        i = int(round(t * SR))
        if i < 0 or i >= len(buf): return
        x = x[:len(buf) - i] * g
        buf[i:i + len(x)] += x
    for b, m, d in notes:
        t = t0 + b * beat_s; f = mtof(m)
        if mar: put(marimba(f, 1.0, 1.0), t, vel)
        if ep_layer: put(ep(f, d * beat_s + 0.15, 0.8), t, vel * 0.8)
        put(st(modal(f * 2, [1], [1], [.25], .6)) * 0.07, t, vel)
    if ding:
        put(bell(mtof(ding), 0.55, 1.0), t0 + 2 * beat_s, vel * 0.9)


# ---- SFX palette ----------------------------------------------------------------
# Each function takes the chord root (midi) and a seed; all are deterministic.
def _rng(seed, k): return np.random.default_rng(int(seed) * 1000 + k)


def sfx_tap(root, seed=0): return clink(mtof(root + 24), 1.0)
def sfx_tick(root, seed=0): return board(0.8)


def sfx_pop(root, seed=0):
    n = int(0.25 * SR); t = tvec(n); f = mtof(root + 12) * (0.55 + 0.45 * (1 - np.exp(-t * 90)))
    y = np.sin(TAU * np.cumsum(f) / SR) * np.exp(-t / 0.05) + .2 * np.sin(TAU * 2 * np.cumsum(f) / SR) * np.exp(-t / .02)
    return st(y * np.minimum(t / .001, 1))


def sfx_ding(root, seed=0): return bell(mtof(root + 12), 0.55)


def sfx_ping(root, seed=0): return ping(mtof(root + 24), 1.0)


def sfx_bag(root, seed=0):
    rng = _rng(seed, 1); n = int(0.6 * SR); t = tvec(n); nz = rng.standard_normal(n)
    sw = bp(nz, 1200, 6500) * (np.sin(np.pi * np.clip(t / 0.45, 0, 1)) ** 2) * 0.5
    cr = np.zeros(n)
    for k in np.sort(rng.uniform(0.02, 0.45, 28)):
        i = int(k * SR); m = int(rng.integers(40, 160)); m = min(m, n - i)
        cr[i:i + m] += rng.standard_normal(m) * np.exp(-np.arange(m) / 30) * rng.uniform(.2, 1)
    return st(sw + hp(cr, 1500) * 0.9)


def sfx_door_bell(root, seed=0):
    rng = _rng(seed, 2); out = np.zeros((int(1.4 * SR), 2))
    for i in range(7):
        t0 = int((i * 0.035 + rng.uniform(0, .01)) * SR)
        f = mtof(root + 36) * rng.choice([1, 1.5, 2.0, 2.98]) * (1 + rng.normal(0, .004))
        s = modal(f, [1, 2.76, 5.4], [1, .4, .15], [.45, .2, .08], .9)
        s = st(s * 0.2 * (1 - i * 0.07), rng.uniform(-.5, .5)); out[t0:t0 + len(s)] += s[:len(out) - t0]
    b = bell(mtof(root + 24), 0.5, 0.6); i0 = int(.05 * SR); out[i0:i0 + len(b)] += b[:len(out) - i0]
    return out


def sfx_receipt(root, seed=0):
    rng = _rng(seed, 3); n = int(1.5 * SR); y = np.zeros(n); t = tvec(n)
    for g0, g1 in ((0.0, 0.4), (0.5, 0.95), (1.05, 1.35)):
        k = g0
        while k < g1:
            i = int(k * SR); m = int(0.006 * SR)
            y[i:i + m] += rng.standard_normal(m) * np.exp(-np.arange(m) / (0.0012 * SR)); k += 1 / 38
    y = bp(y, 1800, 5200) * 1.2
    gate = ((t < .4) | ((t > .5) & (t < .95)) | ((t > 1.05) & (t < 1.35))).astype(float)
    whine = np.sin(TAU * mtof(root + 24) * t + 3 * np.sin(TAU * 38 * t)) * 0.05 * gate * np.minimum(t / 0.05, 1)
    return st(y + whine)


def sfx_shimmer(root, seed=0):
    rng = _rng(seed, 4); n = int(1.4 * SR); y = np.zeros(n)
    for k in np.sort(rng.exponential(0.3, 160)):
        if k > 1.1: continue
        i = int(k * SR); f = rng.uniform(5000, 11000); m = int(.012 * SR); tm = tvec(m)
        y[i:i + m] += np.sin(TAU * f * tm) * np.exp(-tm / .003) * rng.uniform(.1, .5) * (1 - k / 1.3)
    s = st(y); s[:, 1] = np.roll(s[:, 1], 40)
    for j, iv in enumerate((0, 4, 7, 11, 16)):
        a = st(modal(mtof(root + 36 + iv), [1, 2.0], [1, .2], [.4, .2], 1.0) * 0.12)
        i = int((.05 + j * .09) * SR); s[i:i + len(a)] += a[:n - i]
    return s


def sfx_swap(root, seed=0):
    rng = _rng(seed, 5)
    y = modal(mtof(root + 12), [1, 1.59, 2.14, 2.65, 3.6], [1, .6, .4, .3, .15], [.28, .2, .14, .1, .06], 0.8)
    t = tvec(len(y)); y = y + lp(rng.standard_normal(len(y)), 2500) * np.exp(-t / .006) * .4
    return st(y)


def sfx_hit(root, seed=0):
    t = tvec(int(1.0 * SR))
    boom = st(np.sin(TAU * np.cumsum(38 + 40 * np.exp(-t * 6)) / SR) * np.exp(-t * 3.2) * 0.55)
    th = thump(1.2)
    boom[:len(th)] += th[:len(boom)]
    return boom


def sfx_whoosh(root, seed=0, dur=0.5):
    dur = max(dur, 0.4); n = int(dur * SR); t = np.arange(n) / SR
    nz = np.random.default_rng(9).standard_normal(n); out = np.zeros(n)
    for k, (lo, hi) in enumerate(((250, 800), (800, 2400), (2400, 6500))):
        c = (k + 0.5) / 3; w = np.exp(-((t / dur - (0.25 + 0.5 * c)) ** 2) / 0.035); out += bp(nz, lo, hi) * w
    out *= np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 1.5
    return st(out / np.abs(out).max() * 0.5)


def sfx_rise(root, seed=0, dur=1.0):
    pent = [0, 2, 4, 7, 9, 12, 14, 16]; buf = np.zeros((int((dur + 1.2) * SR), 2))
    for j, iv in enumerate(pent):
        m = marimba(mtof(72 + iv), 0.45 + 0.07 * j, 0.7); i = int(j * dur / len(pent) * SR)
        buf[i:i + len(m)] += m[:len(buf) - i]
    return buf


PALETTE = {
    'tap': sfx_tap, 'tick': sfx_tick, 'pop': sfx_pop, 'payment_ding': sfx_ding, 'ping': sfx_ping,
    'bag_swish': sfx_bag, 'order_bell': sfx_door_bell, 'receipt_chatter': sfx_receipt,
    'shimmer': sfx_shimmer, 'swap': sfx_swap, 'hit': sfx_hit, 'whoosh': sfx_whoosh, 'rise': sfx_rise,
}
