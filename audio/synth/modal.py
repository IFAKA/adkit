"""Modal synthesis: struck or rubbed objects as a sum of damped sinusoids (Cook, "Real Sound Synthesis", ch. modal).

Params (all optional unless noted; ranges in brackets):
  freq        fundamental Hz or note name [30..12000]
  ratios      list of mode frequency ratios to freq (preset has one)
  amps        list of mode amplitudes (default: falls off with the ratio)
  decays      list of T60 decay times in seconds per mode (default: decay * ratio^-damp_exp)
  decay       T60 of the lowest mode in seconds [0.02..12]
  damp_exp    how much faster high modes die, 0 = same, 1 = like 1/ratio [0..2]
  strike_pos  where the object is hit, 0 edge .. 0.5 centre [0.02..0.5]; kills modes with a node there
  strike_depth how strong the strike position effect is [0..1]
  hardness    mallet hardness: 0 soft (dull) .. 1 hard (bright, with a click) [0..1]
  beat_hz     split each mode in two, this many Hz apart (the shimmering beat of a real bell) [0..8]
  detune_cents random detune of each mode, seeded [0..50]
  pitch_drop  membrane-like pitch fall at the strike, fraction of freq [0..1]; lasts pitch_drop_ms
  mode        'strike' (default) or 'rub' (noise-excited, for a rubbed glass or scraped plate)
  dur         length in seconds, default derived from decay [0.05..15]
  velocity    [0..1]
"""
import numpy as np
from .core import *

# preset: ratios, per-mode amps, decay(T60 of mode 1), damp_exp, default freq, hardness, extras
PRESETS = {
    # free-free bar (xylophone/glockenspiel bar family)
    'metal_bar': dict(freq=1200, ratios=[1, 2.756, 5.404, 8.933, 13.34, 18.64], amps=[1, .6, .35, .2, .1, .05], decay=2.5, damp_exp=.7, hardness=.7),
    # European church/hand bell: hum, prime, tierce, quint, nominal ...
    'bell': dict(freq=880, ratios=[.5, 1, 1.183, 1.506, 2, 2.514, 2.662, 3.011, 4.166, 5.433], amps=[.5, 1, .8, .5, .8, .45, .35, .3, .2, .12], decay=5.0, damp_exp=.9, hardness=.8, beat_hz=1.2),
    'handbell': dict(freq=1568, ratios=[1, 2.0, 2.43, 3.0, 4.17, 5.43, 6.8], amps=[1, .55, .45, .4, .25, .15, .08], decay=3.2, damp_exp=.8, hardness=.8, beat_hz=2.0),
    # Struck metal dome (tram / bicycle bell): high, bright, close partials that beat, rings about a second.
    'tram_bell': dict(freq=1650, ratios=[1, 1.59, 2.14, 2.30, 2.65, 3.51, 4.07, 5.43, 6.77, 8.4], amps=[1, .5, .7, .45, .5, .4, .3, .25, .15, .1], decay=2.4, damp_exp=.55, hardness=.9, beat_hz=3.0, detune_cents=6),
    'glass': dict(freq=1400, ratios=[1, 2.32, 4.25, 6.63, 9.38], amps=[1, .55, .3, .15, .08], decay=2.2, damp_exp=.5, hardness=.85),
    'ceramic_cup': dict(freq=2300, ratios=[1, 2.12, 3.45, 5.1, 7.2, 9.6], amps=[1, .6, .5, .3, .18, .1], decay=.32, damp_exp=.6, hardness=.8, detune_cents=8),
    'wood_block': dict(freq=900, ratios=[1, 2.4, 4.3, 6.9], amps=[1, .5, .2, .08], decay=.12, damp_exp=.9, hardness=.7),
    # circular membrane (Bessel zeros) with pitch fall
    'membrane': dict(freq=110, ratios=[1, 1.594, 2.136, 2.296, 2.653, 2.918, 3.156, 3.5], amps=[1, .7, .5, .45, .35, .3, .22, .15], decay=.45, damp_exp=.6, hardness=.5, pitch_drop=.25, strike_pos=.25),
    # simply supported square plate: modes proportional to m^2 + n^2
    'plate': dict(freq=700, ratios=[1, 2.5, 2.53, 4, 5, 5.02, 6.5, 6.53, 8, 9], amps=[1, .6, .6, .4, .35, .35, .22, .22, .15, .1], decay=1.6, damp_exp=.7, hardness=.7, beat_hz=1.5),
}


def _modes(p, seed):
    base = dict(PRESETS.get(p.get('preset') or 'metal_bar', PRESETS['metal_bar']))
    base.update({k: v for k, v in p.items() if v is not None})
    f0 = to_freq(base['freq'])
    ratios = np.array(base['ratios'], dtype=float)
    k = np.arange(len(ratios))
    amps = np.array(base['amps'], dtype=float) if base.get('amps') else 1.0 / (ratios ** 0.8)
    if len(amps) != len(ratios): raise ValueError('modal: amps and ratios must have the same length')
    T = float(pget(base, 'decay', 1.0, .02, 12))
    if base.get('decays'):
        decs = np.array(base['decays'], dtype=float)
        if len(decs) != len(ratios): raise ValueError('modal: decays and ratios must have the same length')
    else:
        decs = T * (ratios / ratios.min()) ** (-float(pget(base, 'damp_exp', .6, 0, 2)))
    r = rng(seed, 'modal')
    cents = float(pget(base, 'detune_cents', 0, 0, 50))
    ratios = ratios * 2 ** (r.uniform(-cents, cents, len(ratios)) / 1200)
    pos = float(pget(base, 'strike_pos', .3, .02, .5))
    depth = float(pget(base, 'strike_depth', .5, 0, 1))
    w = np.abs(np.sin(np.pi * (k + 1) * pos))
    amps = amps * ((1 - depth) + depth * w)
    hard = float(pget(base, 'hardness', .6, 0, 1))
    amps = amps * ratios ** (-(1 - hard) * 1.6)  # soft mallets lose highs
    return base, f0, ratios, amps, decs, hard, r


def render(p, seed=0):
    base, f0, ratios, amps, decs, hard, r = _modes(p, seed)
    vel = float(pget(base, 'velocity', 1, 0, 1))
    decs = np.maximum(decs, 0.01)
    dur = float(pget(base, 'dur', min(15.0, float(decs.max()) * 1.05 + .02), .05, 15))
    n = nsamp(dur)
    t = tvec(n)
    beat = float(pget(base, 'beat_hz', 0, 0, 8))
    drop = float(pget(base, 'pitch_drop', 0, 0, 1))
    drop_s = float(pget(base, 'pitch_drop_ms', 60, 5, 500)) / 1000
    mode = base.get('mode', 'strike')
    y = np.zeros(n)
    for i, (rt, a, d) in enumerate(zip(ratios, amps, decs)):
        fm = f0 * rt
        if fm >= SR * 0.47: continue
        env = 10 ** (-3 * t / d)
        pairs = [(0.0, 1.0)] if beat == 0 else [(-beat / 2 * (0.5 + r.random()), .7), (beat / 2 * (0.5 + r.random()), .7)]
        for off, g in pairs:
            ph0 = r.uniform(0, TAU)
            if drop:
                ff = (fm + off) * (1 + drop * np.exp(-t / drop_s))
                ph = TAU * np.cumsum(ff) / SR + ph0
            else:
                ph = TAU * (fm + off) * t + ph0
            y += a * g * np.sin(ph) * env
    if mode == 'rub':
        # excite the modal filter with noise instead of an impulse (a rubbed rim, a scraped plate)
        dur_ex = float(pget(base, 'rub_dur', dur * .6, .05, 15))
        ne = min(n, nsamp(dur_ex))
        ex = r.standard_normal(ne)
        ex = lp(ex, 400 + 6000 * hard, 2)
        ex *= np.minimum(np.arange(ne) / (.15 * SR), 1) * np.minimum((ne - np.arange(ne)) / (.2 * SR), 1)
        y = fftconv(ex, y / max(np.abs(y).max(), 1e-9))[:n]
    else:
        y *= np.minimum(t / (0.0004 + (1 - hard) * 0.006), 1.0)  # mallet contact time
        if hard > .3:  # contact click: a very short filtered noise burst
            k = nsamp(.003)
            click = r.standard_normal(k) * np.exp(-np.arange(k) / (.0006 * SR))
            click = hp(click, 1500 + 3000 * hard)
            y[:k] += click * (hard - .3) * .5 * np.abs(y).max()
    return finish(fade(y), vel)
