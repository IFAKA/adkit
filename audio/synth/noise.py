"""Shaped noise: wind, whoosh, paper, crowd murmur. A filter bank of noise bands whose gains follow slow random
curves (gusts) or a moving centre frequency (whoosh). Deterministic from the seed.

Models:
  wind    gusty wind (like the cierzo). dur [0.3..30]; strength [0..1] mean level; gustiness [0..1] depth of the swells;
          gust_hz [0.05..2] how often gusts come; centre [150..2500] Hz where the body of the wind sits;
          brightness [0..1] how much the gusts open the highs; whistle [0..1] thin resonant whistle that follows gusts;
          whistle_hz [300..3000]
  whoosh  noise sweep: dur [0.1..4]; f_start, f_end [100..12000] Hz; width [0.3..3] octaves; shape 'swell'|'rise'|'fall'
  paper   paper rustle / bag crackle: dur [0.1..5]; density [5..400] crackles per second; bright [0..1]; rustle [0..1] steady noise bed
  murmur  crowd talk far away: dur [0.5..30]; people [1..40]; syllable_hz [2..7]; warmth [0..1]
Common: velocity [0..1].
"""
import numpy as np
from .core import *

BAND_F = np.geomspace(80, 9000, 12)


def _bands(r, n, q=1.6):
    base = pink(r, n)
    return [biquad(base, 'bandpass', f, q) for f in BAND_F]


def _unit(x):
    return x / max(np.abs(x).max(), 1e-9)


def wind(p, seed=0):
    r = rng(seed, 'wind'); dur = float(pget(p, 'dur', 3, .3, 30)); n = nsamp(dur)
    strength = float(pget(p, 'strength', .7, 0, 1)); gust = float(pget(p, 'gustiness', .7, 0, 1))
    ghz = float(pget(p, 'gust_hz', .35, .05, 2)); centre = float(pget(p, 'centre', 600, 150, 2500)); bright = float(pget(p, 'brightness', .5, 0, 1))
    g = (slow_noise(r, n, ghz) * .5 + .5)                 # 0..1 gust level
    g = g ** 1.5
    level = (1 - gust) * .6 + gust * g                   # swell between calm and strong
    bands = _bands(r, n)
    y = np.zeros(n)
    for f, b in zip(BAND_F, bands):
        octs = np.log2(f / centre)
        body = np.exp(-(octs / 1.7) ** 2)
        open_hi = level ** (1 + 2.5 * max(octs, 0) * bright)  # highs only appear in strong gusts
        local = 1 + .35 * slow_noise(r, n, 2.5)           # fast flutter per band
        y += b * body * open_hi * np.maximum(local, 0)
    y *= (.25 + .75 * level)
    w = float(pget(p, 'whistle', 0, 0, 1))
    if w > 0:
        wf = float(pget(p, 'whistle_hz', 900, 300, 3000)) * (1 + .18 * slow_noise(r, n, .4))
        ph = TAU * np.cumsum(wf) / SR
        y += w * 0.25 * np.abs(y).max() * np.sin(ph) * level ** 3 * (1 + .5 * slow_noise(r, n, 5))
    y = hp(y, 60, 2) * strength
    env = np.minimum(np.arange(n) / (.15 * SR), 1) * np.minimum((n - np.arange(n)) / (.25 * SR), 1)
    return finish(y * env, float(pget(p, 'velocity', 1, 0, 1)) * (.3 + .7 * strength))


def whoosh(p, seed=0):
    r = rng(seed, 'whoosh'); dur = float(pget(p, 'dur', .8, .1, 4)); n = nsamp(dur)
    f0, f1 = float(pget(p, 'f_start', 400, 100, 12000)), float(pget(p, 'f_end', 3000, 100, 12000))
    width = float(pget(p, 'width', 1.2, .3, 3)); shape = p.get('shape', 'swell')
    u = np.linspace(0, 1, n)
    fc = f0 * (f1 / f0) ** (u ** 1.3)
    bands = _bands(r, n, q=1.2)
    y = np.zeros(n)
    for f, b in zip(BAND_F, bands):
        y += b * np.exp(-(np.log2(f / fc) / width) ** 2)
    env = {'swell': np.sin(np.pi * u) ** 1.5, 'rise': u ** 2.0, 'fall': (1 - u) ** 2.0}[shape]
    return finish(y * env, float(pget(p, 'velocity', 1, 0, 1)))


def paper(p, seed=0):
    r = rng(seed, 'paper'); dur = float(pget(p, 'dur', .8, .1, 5)); n = nsamp(dur)
    bright = float(pget(p, 'bright', .5, 0, 1))
    cnt = int(float(pget(p, 'density', 80, 5, 400)) * dur)
    x = np.zeros(n)
    clusters = np.sort(r.uniform(0, 1, max(1, cnt // 6)))
    pos = (np.repeat(clusters, 6)[:cnt] + r.exponential(.01, min(cnt, len(clusters) * 6))[:cnt]) % 1.0
    np.add.at(x, (pos * (n - 1)).astype(int)[:cnt], np.exp(r.normal(0, 1.0, min(cnt, len(pos)))) * r.choice([-1, 1], min(cnt, len(pos))))
    k = nsamp(.004)
    grain = r.standard_normal(k) * np.exp(-np.arange(k) / (.0012 * SR))
    y = fftconv(x, grain)[:n]
    y = hp(y, 1200 + 2500 * bright, 2)
    bed = bp(pink(r, n), 1500, 7000, 2) * (.15 + .5 * np.abs(slow_noise(r, n, 12))) * float(pget(p, 'rustle', .3, 0, 1))
    y = _unit(y) + _unit(bed) * .4 * float(pget(p, 'rustle', .3, 0, 1))
    return finish(fade(y, 2, 30), float(pget(p, 'velocity', 1, 0, 1)))


def murmur(p, seed=0):
    r = rng(seed, 'murmur'); dur = float(pget(p, 'dur', 4, .5, 30)); n = nsamp(dur)
    people = int(pget(p, 'people', 12, 1, 40)); syl = float(pget(p, 'syllable_hz', 4, 2, 7)); warm = float(pget(p, 'warmth', .6, 0, 1))
    y = np.zeros(n)
    for i in range(people):
        v = pink(r, n)
        f1, f2 = r.uniform(300, 800), r.uniform(1100, 2600)
        form = biquad(v, 'bandpass', f1, 4) + .6 * biquad(v, 'bandpass', f2, 5)
        am = np.maximum(slow_noise(r, n, syl) * .7 + .2 + .6 * slow_noise(r, n, .5), 0) ** 1.5
        y += form * am
    y = lp(y, 1500 + 4000 * (1 - warm), 2)
    return finish(fade(y, 50, 80), float(pget(p, 'velocity', 1, 0, 1)))


MODELS = {'wind': wind, 'whoosh': whoosh, 'paper': paper, 'murmur': murmur}
