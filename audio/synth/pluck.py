"""Plucked strings: Karplus-Strong extended after Jaffe & Smith (1983): decay stretching, dynamics filter,
pick position, plus a small modal body resonance. Block-vectorised: one numpy step per period of the string.

Params:
  freq         Hz or note name [30..4000]
  dur          length in seconds [0.05..12]; default from decay
  decay        T60 in seconds [0.1..12]
  brightness   loop filter, 0 dark (fast high loss) .. 1 bright [0..1]
  pick_pos     pluck position along the string 0..0.5 (0.5 = middle, hollow); comb on the excitation [0.02..0.5]
  pick_hard    excitation noise colour via the dynamics filter, depends on velocity too [0..1]
  body         body resonance amount [0..1]
  body_modes   list of [Hz, T60 s, gain] added to / replacing the preset body
  tremolo_hz   repeat the pluck this often for the whole dur (bandurria / mandolin tremolo) [0..30]
  velocity     [0..1]
"""
import numpy as np
from .core import *

PRESETS = {
    'guitar': dict(decay=2.6, brightness=.55, pick_pos=.18, pick_hard=.5, body=.55, body_modes=[[98, .12, 1.0], [205, .08, .8], [410, .05, .5], [1100, .03, .25]]),
    'bandurria': dict(decay=1.1, brightness=.8, pick_pos=.12, pick_hard=.8, body=.4, body_modes=[[310, .06, 1.0], [620, .04, .7], [1250, .025, .5], [2500, .015, .3]]),
    'lute': dict(decay=1.5, brightness=.7, pick_pos=.15, pick_hard=.6, body=.5, body_modes=[[180, .08, 1.0], [360, .05, .7], [900, .03, .4]]),
    'harp': dict(decay=4.5, brightness=.4, pick_pos=.28, pick_hard=.3, body=.3, body_modes=[[140, .2, .8], [300, .1, .5]]),
    'bass': dict(decay=2.2, brightness=.18, pick_pos=.25, pick_hard=.2, body=.45, body_modes=[[70, .15, 1.0], [140, .1, .6]]),
}


def _pluck(f, dur, decay, bright, pick_pos, hard, vel, r):
    N = SR / f
    n = nsamp(dur)
    w = 0.5 + 0.5 * bright            # loop lowpass [w, 1-w]; w=.5 averages (darkest)
    D = N - (1 - w)                   # delay the integer line + interpolation must supply
    Pi = int(np.floor(D)); fr = D - Pi
    Pi = max(Pi, 3)
    c = np.array([w * (1 - fr), w * fr + (1 - w) * (1 - fr), (1 - w) * fr])
    g = 10 ** (-3 * (N / SR) / decay)
    c = c * g / c.sum()               # DC gain g -> T60 = decay at low frequencies
    # excitation: noise burst, dynamics filter (brighter when hard / loud), pick position comb
    ex = r.uniform(-1, 1, Pi)
    cutoff = f * (1.5 + 60 * hard * vel ** 1.5)
    ex = lp(ex, min(cutoff, SR * .45), 2)
    k = int(round(pick_pos * Pi))
    if k > 0: ex = ex - np.roll(ex, k)
    ex -= ex.mean()
    y = np.zeros(n + 3 * Pi)
    y[2 * Pi + 2:2 * Pi + 2 + Pi] = ex[:Pi]
    off = 2 * Pi + 2
    for s in range(off + Pi, off + n, Pi):
        e = min(s + Pi, len(y))
        m = e - s
        y[s:e] = c[0] * y[s - Pi:s - Pi + m] + c[1] * y[s - Pi - 1:s - Pi - 1 + m] + c[2] * y[s - Pi - 2:s - Pi - 2 + m]
    return y[off:off + n]


def _body(modes, gain_scale, r):
    n = nsamp(.25)
    t = tvec(n)
    h = np.zeros(n)
    for f, T, g in modes:
        h += g * np.sin(TAU * f * t + r.uniform(0, TAU)) * 10 ** (-3 * t / max(T, .01))
    h[0] += 0.0
    return h / max(np.abs(h).max(), 1e-9)


def render(p, seed=0):
    base = dict(PRESETS.get(p.get('preset') or 'guitar', PRESETS['guitar']))
    base.update({k: v for k, v in p.items() if v is not None})
    f = float(np.clip(to_freq(base.get('freq', 196)), 30, 4000))
    decay = float(pget(base, 'decay', 2, .1, 12))
    dur = float(pget(base, 'dur', min(12.0, decay * 1.1), .05, 12))
    vel = float(pget(base, 'velocity', 1, 0, 1))
    r = rng(seed, 'pluck')
    trem = float(pget(base, 'tremolo_hz', 0, 0, 30))
    bright, pp, hard = (float(pget(base, 'brightness', .6, 0, 1)), float(pget(base, 'pick_pos', .2, .02, .5)), float(pget(base, 'pick_hard', .5, 0, 1)))
    if trem > 0:
        step = nsamp(1 / trem); n = nsamp(dur)
        one_len = min(n, step * 3 + nsamp(.1))
        y = np.zeros(n)
        for i, s in enumerate(range(0, n, step)):
            seg = _pluck(f, one_len / SR, decay, bright, pp, hard, vel * (1.0 if i % 2 == 0 else .8), r)
            m = min(len(seg), n - s)
            y[s:s + m] += seg[:m]
    else:
        y = _pluck(f, dur, decay, bright, pp, hard, vel, r)
    body = float(pget(base, 'body', .4, 0, 1))
    modes = base.get('body_modes') or []
    if body > 0 and modes:
        h = _body(modes, body, r)
        yb = fftconv(y, h)[:len(y)]
        y = y + body * 0.9 * yb * (np.abs(y).max() / max(np.abs(yb).max(), 1e-9))
    y = hp(y, 40, 2)
    return finish(fade(y, .3, 8), vel)
