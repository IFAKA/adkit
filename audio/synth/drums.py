"""Synthesised percussion. Every drum is a model (params, seed) -> mono; `kind` picks the variant.

Models: kick, snare, clap, hat, castanets, palmas, tambourine, cajon, and `drums` which takes kind=<any of them or a variant>.
Variants (kind): kick, snare, clap, hat (closed), hat_open, castanets, palmas (loud hand clap), palmas_sorda (muted, dull),
tambourine, cajon_bass, cajon_slap, rim.
Common params: tune [0.5..2] pitch multiplier; decay [0.3..3] length multiplier; velocity [0..1].
  kick      body Hz [35..120] (start 3x higher, falls); click [0..1]
  snare     tone Hz [120..300]; snap [0..1] noise amount
  clap      bursts [2..6] number of hands
  hat       open [0..1]
  castanets rattle [1..4] number of clicks in one hit (a roll uses 3-4)
"""
import numpy as np
from .core import *


def _burst(r, n, lo, hi, tau, order=2):
    t = tvec(n)
    return bp(r.standard_normal(n), lo, hi, order) * np.exp(-t / tau)


def _norm(x): return x / max(np.abs(x).max(), 1e-9)


def kick(p, seed=0):
    r = rng(seed, 'kick'); tune = float(pget(p, 'tune', 1, .5, 2)); dec = float(pget(p, 'decay', 1, .3, 3))
    n = nsamp(.5 * dec); t = tvec(n)
    f_end = float(pget(p, 'body', 52, 35, 120)) * tune
    f = f_end * (1 + 2.2 * np.exp(-t / .035))
    ph = TAU * np.cumsum(f) / SR
    y = np.sin(ph) * np.exp(-t / (.14 * dec)) * np.minimum(t / .001, 1)
    k = nsamp(.004)
    y[:k] += float(pget(p, 'click', .4, 0, 1)) * .5 * hp(r.standard_normal(k), 1500) * np.exp(-np.arange(k) / (.001 * SR))
    return finish(fade(y, .1, 8), float(pget(p, 'velocity', 1, 0, 1)))


def snare(p, seed=0):
    r = rng(seed, 'snare'); tune = float(pget(p, 'tune', 1, .5, 2)); dec = float(pget(p, 'decay', 1, .3, 3))
    n = nsamp(.3 * dec); t = tvec(n)
    f = float(pget(p, 'tone', 190, 120, 300)) * tune
    body = (np.sin(TAU * f * t * (1 + .15 * np.exp(-t / .02))) + .5 * np.sin(TAU * f * 1.6 * t)) * np.exp(-t / (.07 * dec))
    snap = float(pget(p, 'snap', .8, 0, 1))
    noise = bp(r.standard_normal(n), 1800, 9000, 2) * np.exp(-t / (.09 * dec))
    return finish(fade(_norm(body) * .55 + _norm(noise) * snap, .1, 8), float(pget(p, 'velocity', 1, 0, 1)))


def clap(p, seed=0):
    r = rng(seed, 'clap'); dec = float(pget(p, 'decay', 1, .3, 3)); nb = int(pget(p, 'bursts', 4, 2, 6)); tune = float(pget(p, 'tune', 1, .5, 2))
    n = nsamp(.25 * dec); y = np.zeros(n)
    for i in range(nb):
        s = int(i * .009 * SR + r.uniform(0, .002) * SR)
        b = _burst(r, min(nsamp(.012), n - s), 900 * tune, 3500 * tune, .004)
        y[s:s + len(b)] += b * (1 if i < nb - 1 else .6)
    tail = _burst(r, n, 900 * tune, 3000 * tune, .06 * dec)
    s = int((nb - 1) * .009 * SR)
    y[s:] += .5 * tail[:n - s]
    return finish(fade(y, .1, 8), float(pget(p, 'velocity', 1, 0, 1)))


def hat(p, seed=0):
    r = rng(seed, 'hat'); op = float(pget(p, 'open', 0, 0, 1)); dec = float(pget(p, 'decay', 1, .3, 3)); tune = float(pget(p, 'tune', 1, .5, 2))
    tau = (.03 + .4 * op) * dec; n = nsamp(tau * 6 + .02); t = tvec(n)
    metal = sum(np.sign(np.sin(TAU * f * tune * t + r.uniform(0, TAU))) for f in (205.3, 304.4, 369.6, 522.7, 800, 540)) / 6
    y = hp(metal * .6 + r.standard_normal(n) * .4, 6000 * tune, 4) * np.exp(-t / tau)
    return finish(fade(y, .1, 5), float(pget(p, 'velocity', 1, 0, 1)))


def castanets(p, seed=0):
    """Two wooden shells: each click is a very short modal wood pair; a roll is a quick run of clicks."""
    r = rng(seed, 'cast'); tune = float(pget(p, 'tune', 1, .5, 2)); dec = float(pget(p, 'decay', 1, .3, 3)); nk = int(pget(p, 'rattle', 1, 1, 4))
    n = nsamp(.1 * dec + .02 * nk); y = np.zeros(n); t = tvec(n)
    pos = 0
    for k in range(nk):
        g = 1 - .18 * k
        f1 = (2300 + r.uniform(-150, 150)) * tune; f2 = f1 * 1.62
        c = (np.sin(TAU * f1 * t) * np.exp(-t / (.012 * dec)) + .6 * np.sin(TAU * f2 * t) * np.exp(-t / (.008 * dec)))
        c += .5 * hp(r.standard_normal(n), 2500) * np.exp(-t / .002)
        c = np.roll(c, pos); c[:pos] = 0
        y += c * g
        pos += int((.014 + r.uniform(0, .005)) * SR)
    y = hp(y, 700)
    return finish(fade(y, .05, 6), float(pget(p, 'velocity', 1, 0, 1)))


def palmas(p, seed=0, muted=False):
    """Flamenco handclap: palmas fuertes (open, ringing cup of air) or sordas (muted, dull)."""
    r = rng(seed, 'palmas'); tune = float(pget(p, 'tune', 1, .5, 2)); dec = float(pget(p, 'decay', 1, .3, 3))
    muted = bool(p.get('muted', muted))
    n = nsamp(.28 * dec); t = tvec(n)
    crack = _burst(r, n, 1200 * tune, 5000 * tune, .0035)
    cup = np.sin(TAU * (900 if not muted else 520) * tune * t) * np.exp(-t / ((.04 if not muted else .02) * dec)) * .6
    air = bp(r.standard_normal(n), 400 * tune, 2200 * tune, 2) * np.exp(-t / ((.06 if not muted else .025) * dec))
    y = _norm(crack) + .5 * _norm(cup) + .5 * _norm(air)
    return finish(fade(y, .1, 8), float(pget(p, 'velocity', 1, 0, 1)))


def tambourine(p, seed=0):
    r = rng(seed, 'tamb'); tune = float(pget(p, 'tune', 1, .5, 2)); dec = float(pget(p, 'decay', 1, .3, 3))
    n = nsamp(.4 * dec); t = tvec(n); y = np.zeros(n)
    for f in (5200, 6400, 7800, 9300, 11000):
        for _ in range(2):
            y += np.sin(TAU * f * tune * r.uniform(.97, 1.03) * t + r.uniform(0, TAU)) * np.exp(-t / (r.uniform(.04, .16) * dec))
    y = _norm(y) + .8 * hp(r.standard_normal(n), 5000) * np.exp(-t / (.05 * dec))
    y *= np.minimum(t / .002, 1)
    return finish(fade(y, .1, 8), float(pget(p, 'velocity', 1, 0, 1)))


def cajon(p, seed=0, kind='bass'):
    r = rng(seed, 'cajon'); tune = float(pget(p, 'tune', 1, .5, 2)); dec = float(pget(p, 'decay', 1, .3, 3))
    kind = p.get('kind', kind)
    n = nsamp(.35 * dec); t = tvec(n)
    if 'slap' in str(kind):
        y = bp(r.standard_normal(n), 2500 * tune, 8000, 2) * np.exp(-t / (.05 * dec)) + .5 * np.sin(TAU * 220 * tune * t) * np.exp(-t / (.03 * dec))
    else:
        f = 85 * tune * (1 + .5 * np.exp(-t / .03))
        y = np.sin(TAU * np.cumsum(f) / SR) * np.exp(-t / (.11 * dec)) + .25 * bp(r.standard_normal(n), 1500, 6000) * np.exp(-t / (.04 * dec))
    return finish(fade(y, .1, 8), float(pget(p, 'velocity', 1, 0, 1)))


VARIANTS = {
    'kick': (kick, {}), 'snare': (snare, {}), 'clap': (clap, {}), 'hat': (hat, {}), 'hat_open': (hat, {'open': .8}),
    'castanets': (castanets, {}), 'castanets_roll': (castanets, {'rattle': 3}), 'palmas': (palmas, {}),
    'palmas_sorda': (palmas, {'muted': True}), 'tambourine': (tambourine, {}),
    'cajon_bass': (cajon, {'kind': 'bass'}), 'cajon_slap': (cajon, {'kind': 'slap'}),
    'rim': (snare, {'tone': 280, 'snap': .3, 'decay': .4}),
}


def drums(p, seed=0):
    kind = p.get('kind') or p.get('preset')
    if kind not in VARIANTS: raise ValueError(f"drums: unknown kind '{kind}' (use {', '.join(VARIANTS)})")
    fn, extra = VARIANTS[kind]
    q = dict(extra); q.update({k: v for k, v in p.items() if v is not None and k not in ('kind', 'preset')})
    return fn(q, seed)


MODELS = {'drums': drums, 'kick': kick, 'snare': snare, 'clap': clap, 'hat': hat, 'castanets': castanets, 'palmas': palmas,
          'tambourine': tambourine, 'cajon': cajon}
