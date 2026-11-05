"""Tonal instruments: FM (electric piano, bells, bass) and subtractive (pad, bass, lead), with ADSR.

Models:
  fm      two-operator-pair FM. Params: freq [20..8000]; dur gate length s [0.02..20]; ratio carrier:modulator [0.25..16];
          index modulation depth [0..12]; index_decay seconds the index falls to 1/e [0.02..10]; fb feedback of modulator [0..1];
          a,d,s,r ADSR (s,sustain level 0..1; times in s); tine [0..1] extra bright attack partial (electric piano tine)
          presets: e_piano, fm_bell, fm_bass
  subtractive  oscillators + lowpass with envelope. Params: freq; dur; wave 'saw'|'square'|'tri'|'sine'; voices [1..7]
          unison saws; detune cents [0..40]; sub sine one octave below [0..1]; cutoff Hz [100..16000]; env_amt octaves the
          filter opens on the attack [0..6]; fenv_decay s [0.02..4]; res Q [0.5..8]; pwm pulse width [0.1..0.5]; a,d,s,r
          presets: pad, sub_bass, lead
  Common: velocity [0..1].
"""
import numpy as np
from .core import *

FM_PRESETS = {
    'e_piano': dict(ratio=1.0, index=1.8, index_decay=.5, a=.003, d=1.2, s=.15, r=.35, fb=0, tine=.5),
    'fm_bell': dict(ratio=3.5, index=4.0, index_decay=1.2, a=.001, d=2.0, s=0.0, r=1.0, fb=0, tine=0),
    'fm_bass': dict(ratio=1.0, index=2.5, index_decay=.15, a=.002, d=.25, s=.6, r=.1, fb=.3, tine=0),
}
SUB_PRESETS = {
    'pad':      dict(wave='saw', voices=5, detune=14, sub=0, cutoff=1400, env_amt=1.0, fenv_decay=1.5, res=.9, a=.35, d=.6, s=.8, r=.9),
    'sub_bass': dict(wave='saw', voices=1, detune=0, sub=.8, cutoff=500, env_amt=2.5, fenv_decay=.18, res=1.2, a=.004, d=.2, s=.7, r=.08),
    'lead':     dict(wave='square', voices=2, detune=8, sub=0, cutoff=3500, env_amt=2.0, fenv_decay=.3, res=1.5, a=.01, d=.2, s=.7, r=.15),
}


def fm(p, seed=0):
    base = dict(FM_PRESETS.get(p.get('preset') or 'e_piano', FM_PRESETS['e_piano'])); base.update({k: v for k, v in p.items() if v is not None})
    f = float(np.clip(to_freq(base.get('freq', 261.6)), 20, 8000)); gate = float(pget(base, 'dur', .5, .02, 20))
    ng = nsamp(gate)
    env = adsr(ng, base['a'], base['d'], base['s'], base['r']); n = len(env); t = tvec(n)
    ratio = float(pget(base, 'ratio', 1, .25, 16)); idx = float(pget(base, 'index', 2, 0, 12)) * (float(pget(base, 'velocity', 1, 0, 1)) * .5 + .5)
    ie = idx * (0.15 + 0.85 * np.exp(-t / float(pget(base, 'index_decay', .5, .02, 10))))
    mod = np.sin(TAU * f * ratio * t + float(pget(base, 'fb', 0, 0, 1)) * 2 * np.sin(TAU * f * ratio * t * .999))
    y = np.sin(TAU * f * t + ie * mod)
    tine = float(pget(base, 'tine', 0, 0, 1))
    if tine > 0:
        y += tine * .25 * np.sin(TAU * f * 7 * t + 2 * mod) * np.exp(-t / .06)
    return finish(fade(y * env, .5, 5), float(pget(p, 'velocity', 1, 0, 1)))


def _osc(wave, f, n, ph0, pwm=.5):
    ph = (f * np.arange(n) / SR + ph0) % 1.0
    dt = f / SR

    def blep(x):
        y = np.zeros_like(x)
        a = x < dt; b = x > 1 - dt
        u = x[a] / dt; y[a] = u + u - u * u - 1
        u = (x[b] - 1) / dt; y[b] = u * u + u + u + 1
        return y
    if wave == 'sine': return np.sin(TAU * ph)
    if wave == 'tri': return 2 * np.abs(2 * ph - 1) - 1
    if wave == 'square':
        return np.where(ph < pwm, 1.0, -1.0) + blep(ph) - blep((ph + (1 - pwm)) % 1.0)
    return 2 * ph - 1 - blep(ph)  # saw


def subtractive(p, seed=0):
    base = dict(SUB_PRESETS.get(p.get('preset') or 'pad', SUB_PRESETS['pad'])); base.update({k: v for k, v in p.items() if v is not None})
    f = float(np.clip(to_freq(base.get('freq', 130.8)), 20, 8000)); gate = float(pget(base, 'dur', 1.0, .02, 20))
    env = adsr(nsamp(gate), base['a'], base['d'], base['s'], base['r']); n = len(env)
    r = rng(seed, 'sub'); voices = int(pget(base, 'voices', 1, 1, 7)); det = float(pget(base, 'detune', 0, 0, 40))
    y = np.zeros(n)
    for v in range(voices):
        c = 0 if voices == 1 else (v / (voices - 1) * 2 - 1) * det
        y += _osc(base.get('wave', 'saw'), f * 2 ** (c / 1200), n, r.random(), float(pget(base, 'pwm', .5, .1, .5)))
    y /= voices
    sub = float(pget(base, 'sub', 0, 0, 1))
    if sub: y = y + sub * np.sin(TAU * f / 2 * tvec(n))
    t = tvec(n)
    cutoff = float(pget(base, 'cutoff', 2000, 100, 16000)); amt = float(pget(base, 'env_amt', 1, 0, 6))
    vel = float(pget(p, 'velocity', 1, 0, 1))
    fc = cutoff * 2 ** (amt * vel * np.exp(-t / float(pget(base, 'fenv_decay', .3, .02, 4))))
    y = sweep_lp(y, np.minimum(fc, 16000), 'lowpass', float(pget(base, 'res', .9, .5, 8)), steps=7)
    return finish(fade(y * env, .5, 5), vel)


MODELS = {'fm': fm, 'subtractive': subtractive}
