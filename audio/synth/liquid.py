"""Liquid and particle sounds.

Water bubbles follow van den Doel (2005), "Physically based models for liquid sounds": a bubble of radius r rings at
the Minnaert frequency f0 = 3/r (r in metres), as a damped sine whose pitch rises, f(t) = f0 (1 + xi t), with damping
d = 0.043 f0 + 0.0014 f0^1.5 and xi = 0.1 d. Many random bubbles make a pour or a fountain.
Particle sounds (shaker, gravel, rain, crowd claps) follow the PhISEM idea (Cook): random impacts whose density
decays like the energy of a system, each exciting a few resonances.

Models (each is a function (params, seed) -> mono array):
  drop     one bubble.  freq [200..6000] Hz or note name (tune it to the music) or radius_mm [0.5..15];
           rise [0..3] (1 = the paper's value, more = a clearer upward chirp); damping [0.2..4] (1 = paper);
           plink [0..1] impact click; dur [0.03..3]
  bubbles  stream of bubbles. rate [1..200]/s, f_lo, f_hi [200..6000] Hz (log distribution), dur [0.1..10],
           taper 'flat'|'decay'|'swell'
  pour     water filling a glass: dense bubbles rising in pitch plus a wash. dur [0.3..8],
           fill [0..1] (how much the pitch rises), density [10..300]/s, wash [0..1]
  splash   a hit on water: noise burst + a few big bubbles. size [0.2..1], dur [0.1..4]
  shaker / gravel / rain   PhISEM particles: dur [0.05..20], density [0.1..4], pitch [0.3..3]
  claps_crowd   applause: dur [0.5..20], people [3..300], shape 'swell'|'steady'|'decay'
Common: velocity [0..1].
"""
import numpy as np
from .core import *


def _bubble(f0, dur_s, rise=1.0, damping=1.0, plink=0.0, r=None):
    n = nsamp(dur_s)
    t = tvec(n)
    d = (0.043 * f0 + 0.0014 * f0 ** 1.5) * damping
    xi = 0.1 * d * rise
    ph = TAU * f0 * (t + xi * t * t / 2)
    env = np.exp(-d * t) * np.minimum(t / 0.0008, 1.0)
    y = np.sin(ph) * env
    if plink > 0 and r is not None:
        k = min(n, nsamp(.002))
        c = r.standard_normal(k) * np.exp(-np.arange(k) / (.0004 * SR))
        y[:k] += hp(c, 2000) * plink * .3
    return y


def drop(p, seed=0):
    vel = float(pget(p, 'velocity', 1, 0, 1))
    f0 = 3.0 / (float(p['radius_mm']) / 1000) if p.get('radius_mm') else to_freq(p.get('freq', 1200))
    f0 = float(np.clip(f0, 200, 6000))
    damping = float(pget(p, 'damping', 1, .2, 4))
    d = (0.043 * f0 + 0.0014 * f0 ** 1.5) * damping
    dur = float(pget(p, 'dur', min(3.0, 7 / d), .03, 3))
    r = rng(seed, 'drop')
    y = _bubble(f0, dur, float(pget(p, 'rise', 1, 0, 3)), damping, float(pget(p, 'plink', .3, 0, 1)), r)
    return finish(fade(y, .2, 3), vel)


def _stream(r, n, count, flo, fhi, shape, fill=None, damping=1.0):
    y = np.zeros(n)
    times = np.sort(r.uniform(0, 1, max(1, count) * 3))
    if shape == 'decay': keep = r.uniform(0, 1, len(times)) < np.exp(-3 * times)
    elif shape == 'swell': keep = r.uniform(0, 1, len(times)) < np.sin(np.pi * times) ** 1.5
    else: keep = np.ones(len(times), bool)
    times = times[keep][:max(1, count)]
    for tt in times:
        i = int(tt * (n - 1))
        if fill is None:
            f = np.exp(r.uniform(np.log(flo), np.log(fhi)))
        else:  # pour: the pitch climbs as the glass fills
            f = flo * (fhi / flo) ** (fill * tt) * np.exp(r.normal(0, .25))
        f = float(np.clip(f, 200, 6000))
        bub = _bubble(f, min(.12, (n - i) / SR), 1.0, damping) * r.uniform(.3, 1)
        m = min(len(bub), n - i)
        y[i:i + m] += bub[:m]
    return y


def bubbles(p, seed=0):
    r = rng(seed, 'bubbles'); dur = float(pget(p, 'dur', 1.5, .1, 10)); n = nsamp(dur)
    y = _stream(r, n, int(float(pget(p, 'rate', 30, 1, 200)) * dur), float(pget(p, 'f_lo', 500, 200, 6000)),
                float(pget(p, 'f_hi', 3000, 200, 6000)), p.get('taper', 'flat'))
    return finish(fade(y), float(pget(p, 'velocity', 1, 0, 1)))


def pour(p, seed=0):
    r = rng(seed, 'pour'); dur = float(pget(p, 'dur', 2.5, .3, 8)); n = nsamp(dur)
    y = _stream(r, n, int(float(pget(p, 'density', 120, 10, 300)) * dur), 450, 3200, 'flat', fill=float(pget(p, 'fill', .8, 0, 1)))
    y = y / max(np.abs(y).max(), 1e-9)
    w = bp(pink(r, n), 600, 5000, 2) * (1 + .3 * slow_noise(r, n, 8))
    w = w / max(np.abs(w).max(), 1e-9)
    env = np.minimum(np.arange(n) / (.08 * SR), 1) * np.minimum((n - np.arange(n)) / (.25 * SR), 1)
    return finish(fade((y + float(pget(p, 'wash', .35, 0, 1)) * w * .8) * env), float(pget(p, 'velocity', 1, 0, 1)))


def splash(p, seed=0):
    r = rng(seed, 'splash'); size = float(pget(p, 'size', .6, .2, 1)); dur = float(pget(p, 'dur', .9, .1, 4)); n = nsamp(dur)
    t = tvec(n)
    noise = bp(r.standard_normal(n), 400, 7000, 2) * np.exp(-t / (.04 + .08 * size))
    big = _stream(r, n, int(25 * size * dur), 300, 1400, 'decay', damping=1.4)
    y = noise / max(np.abs(noise).max(), 1e-9) + .6 * big / max(np.abs(big).max(), 1e-9)
    return finish(fade(y), float(pget(p, 'velocity', 1, 0, 1)))


# PhISEM: events per second, energy decay (s), resonance freqs [Hz], Q, event amplitude spread, default dur, energy shape
PARTICLE = {
    'shaker': dict(rate=900, tau=.35, res=[3200, 5200], q=8, spread=.6, dur=.6, shape='decay'),
    'gravel': dict(rate=500, tau=.8, res=[700, 1500, 2600], q=3, spread=1.0, dur=1.2, shape='steady'),
    'rain':   dict(rate=1500, tau=4, res=[3000, 6000], q=1.5, spread=.8, dur=3.0, shape='steady'),
}


def _particles(name, p, seed):
    cfg = dict(PARTICLE[name])
    dur = float(pget(p, 'dur', cfg['dur'], .05, 20)); n = nsamp(dur)
    r = rng(seed, name)
    cnt = int(cfg['rate'] * dur * float(pget(p, 'density', 1, .1, 4)))
    times = r.uniform(0, 1, cnt)
    keep = r.uniform(0, 1, cnt) < (np.exp(-times * dur / cfg['tau']) if cfg['shape'] == 'decay' else 1.0)
    idx = (times[keep] * (n - 1)).astype(int)
    x = np.zeros(n)
    np.add.at(x, idx, np.exp(r.normal(0, cfg['spread'], len(idx))) * r.choice([-1, 1], len(idx)))
    y = np.zeros(n)
    for fr in cfg['res']:
        y += reson(x, fr * float(pget(p, 'pitch', 1, .3, 3)), cfg['q'])
    y = hp(y, 200, 2)
    if cfg['shape'] == 'decay': y *= np.minimum(np.arange(n) / (.004 * SR), 1)
    return finish(fade(y, .5, 15), float(pget(p, 'velocity', 1, 0, 1)))


def shaker(p, seed=0): return _particles('shaker', p, seed)
def gravel(p, seed=0): return _particles('gravel', p, seed)
def rain(p, seed=0): return _particles('rain', p, seed)


def claps_crowd(p, seed=0):
    r = rng(seed, 'crowd'); dur = float(pget(p, 'dur', 3, .5, 20)); n = nsamp(dur)
    people = int(pget(p, 'people', 60, 3, 300))
    k = nsamp(.012)
    clap = bp(r.standard_normal(k), 900, 3500, 2) * np.exp(-np.arange(k) / (.003 * SR))
    cnt = int(people * 6 * dur)
    times = r.uniform(0, 1, cnt)
    shape = p.get('shape', 'swell')
    prob = {'swell': np.sin(np.pi * times) ** 1.2, 'steady': np.ones(cnt), 'decay': np.exp(-3 * times)}[shape]
    times = times[r.uniform(0, 1, cnt) < prob]
    x = np.zeros(n)
    np.add.at(x, (times * (n - 1)).astype(int), np.exp(r.normal(0, .5, len(times))))
    return finish(fade(fftconv(x, clap)[:n], 5, 30), float(pget(p, 'velocity', 1, 0, 1)))


MODELS = {'drop': drop, 'bubbles': bubbles, 'pour': pour, 'splash': splash, 'shaker': shaker, 'gravel': gravel,
          'rain': rain, 'claps_crowd': claps_crowd}
