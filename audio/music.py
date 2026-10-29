"""Music arrangement driven by the plan: sections decide which layers play, sound.* decides the notes."""
import re
import numpy as np
from dsp import *
import instruments as I

_PC = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
# reference voicings (key of C), used when the chord matches exactly
_VOICE = {'C': [64, 67, 71, 74], 'F': [65, 69, 72, 76], 'Am': [64, 67, 69, 72], 'G': [62, 65, 67, 71]}
CLASH = [66, 72, 71, 73, 78, 65, 70, 77, 67, 75]


def parse_chord(name):
    m = re.match(r'^([A-Ga-g])([#b]?)(.*)$', name or 'C')
    if not m:
        return 0, 'maj'
    pc = (_PC[m.group(1).upper()] + (1 if m.group(2) == '#' else -1 if m.group(2) == 'b' else 0)) % 12
    q = m.group(3)
    qual = 'min' if q.startswith('m') and not q.startswith('maj') else 'dom' if q in ('7', '9', '13') else 'maj'
    return pc, qual


def chord_root(name, lo=65):
    """Root pitch class folded into midi lo..lo+11 (C->72, F->65, Am->69, G->67)."""
    pc, _ = parse_chord(name)
    return lo + ((pc - lo) % 12)


def chord_voice(name):
    if name in _VOICE:
        return list(_VOICE[name])
    pc, q = parse_chord(name)
    third = 3 if q == 'min' else 4
    seventh = 10 if q in ('min', 'dom') else 11
    out = []
    for iv in (third, 7, seventh, 14):
        m = 60 + pc + iv
        while m > 77: m -= 12
        while m < 62: m += 12
        out.append(m)
    return sorted(out)


def chord_bass(name):
    pc, _ = parse_chord(name)
    return 36 + pc if pc < 12 else 36


class Timeline:
    def __init__(self, plan):
        self.plan = plan
        self.dur = float(plan['durationSeconds'])
        self.N = int(round(self.dur * SR))
        self.beat = 60.0 / float(plan['bpm'])
        self.bar = 4 * self.beat
        snd = plan.get('sound', {})
        self.prog = snd.get('progression') or ['C', 'F', 'Am', 'G']
        self.over = {int(k): v for k, v in (snd.get('chords') or {}).items()}
        self.key = snd.get('key', 'C')
        secs = {}
        for s in plan.get('sections', []):
            secs.setdefault(s['role'], []).append((float(s['startSeconds']), float(s['endSeconds'])))
        self.secs = secs
        first = lambda r: secs[r][0] if r in secs else None
        self.chaos, self.breath = first('chaos'), first('breath')
        d = first('drop')
        g = first('groove')
        self.drop = d[0] if d else (g[0] if g else (self.breath[1] if self.breath else 0.0))
        self.groove = g if g else (self.drop, self.dur)
        self.lift, self.swaps, self.final = first('lift'), first('swaps'), first('final')
        nbars = max(1, int(plan.get('bars') or int(np.ceil(self.dur / self.bar))))
        self.lastbar = min(nbars, max(1, int(np.ceil(self.dur / self.bar - 1e-6))))
        self.last_t = max(self.drop, (self.lastbar - 1) * self.bar)
        if self.last_t >= self.dur - 0.5: self.last_t = self.drop
        self.first_bar = int(self.drop // self.bar + 1e-6) + 1

    def bt(self, bar, beat=0.0): return (bar - 1) * self.bar + beat * self.beat

    def chord(self, bar):
        if bar in self.over: return self.over[bar]
        if self.bt(bar) >= self.last_t - 1e-6 and self.bt(bar) > self.drop: return self.key if self.key else self.prog[0]
        return self.prog[(bar - self.first_bar) % len(self.prog)]

    def chord_at(self, t): return self.chord(int(t // self.bar) + 1)

    def in_sec(self, sec, t): return sec is not None and sec[0] - 1e-6 <= t < sec[1] - 1e-6


KT = 10 ** (4.5 / 20)   # chaos level, tuned against the golden ad
KL = 10 ** (3.2 / 20)   # lift layer level


def build_stems(plan, ping_times, kT=KT, kL=KL):
    T = Timeline(plan)
    N, beat = T.N, T.beat
    seed = int(plan.get('sound', {}).get('seed', 21))
    notes = [tuple(n) for n in plan['sound']['motif']['notes']]
    ding = plan['sound']['motif'].get('ding', 84)
    ding = int(ding) if ding else 0

    def new(): return np.zeros((N, 2))
    def put(buf, x, t, g=1.0, pan=0.0):
        i = int(round(t * SR))
        if i < 0 or i >= N: return
        x = x[:N - i] * g
        if pan: x = x * np.array([1 - max(pan, 0), 1 + min(pan, 0)])
        buf[i:i + len(x)] += x
    def env(buf, pts):
        t = np.arange(N) / SR
        return buf * db(np.interp(t, [p[0] for p in pts], [p[1] for p in pts]))[:, None]

    drums, bass, harm, mot, fx = new(), new(), new(), new(), new()
    rng = np.random.default_rng(seed)

    # ---------- chaos ----------
    if T.chaos:
        c0, c1 = T.chaos
        pts = [t for t in ping_times if c0 <= t < c1]
        if not pts:
            t, i = c0 + 0.12, 0
            while t < c1 - 0.12: pts.append(t); t += max(0.05, 0.62 * 0.83 ** i); i += 1
        span = max(c1 - c0, 0.1)
        for i, t in enumerate(pts):
            prog = min(1.0, (t - c0) / (0.97 * span))
            for s in range(1 + (i >= 5) + (i >= 8)):
                m = CLASH[(i * 3 + s * 4) % len(CLASH)]
                put(fx, I.ping(mtof(m), 0.35 + 0.65 * prog, rng.uniform(-28, 28), rng.uniform(-.7, .7)), t + s * 0.011)
        nn = int(span * SR); tt = np.arange(nn) / SR
        d = (np.sin(TAU * 65.41 * tt) + .8 * np.sin(TAU * 92.5 * tt) + .5 * np.sin(TAU * 98.0 * tt)) * np.minimum(tt / (span * 0.43), 1) * 0.12
        nz = lp(np.random.default_rng(seed + 2).standard_normal(nn), 2500)
        dr = st(d + nz * (tt / span) ** 2.5 * 0.35)
        put(fx, dr, c0)
        # pulse in the last 1.5 s: the rolling pin faster
        k = 0; tp = max(c0, c1 - 1.5)
        while tp < c1 - 0.05:
            put(fx, I.thump(round(0.4 + .1 * min(k, 5), 2)), tp); tp += 0.25; k += 1
        # reverse swell that sucks everything in, ending at the end of the chaos
        sl = min(2.0, span + 0.5)
        src = np.zeros((int(sl * SR), 2))
        for m in (60, 66, 71, 73, 78, 84):
            e = I.ep(mtof(m), 0.2, 0.9) * 1.2; e = e[:len(src)]; src[:len(e)] += e
        src = src + reverb(src, 1.9, 4) * 1.8
        sw = src[::-1]; put(fx, sw * 0.22, c1 - len(sw) / SR)
        fx[int(c1 * SR):] = 0
        fx *= kT

    # ---------- the drop ----------
    put(fx, I.thump(1.2), T.drop, 0.6)
    t4 = tvec(int(1.2 * SR))
    put(fx, st(np.sin(TAU * np.cumsum(38 + 40 * np.exp(-t4 * 6)) / SR) * np.exp(-t4 * 3.2) * 0.55), T.drop, 0.6)
    put(fx, I.sfx_shimmer(chord_root(T.chord(T.first_bar)), seed), T.drop, 0.45)

    # ---------- bars ----------
    lastb = int(round(T.last_t / T.bar)) + 1
    fb = T.first_bar
    for bar in range(fb, lastb + 1):
        ch = T.chord(bar); v = chord_voice(ch)
        if bar >= lastb and lastb > fb:
            for k, m in enumerate(chord_voice(T.key)): put(harm, I.ep(mtof(m), 1.5, 0.9), T.bt(bar) + k * 0.006)
            put(harm, I.pad(tuple(mtof(m - 12) for m in chord_voice(T.key)), 2.0), T.bt(bar), 1.2)
            put(bass, I.bass(mtof(chord_bass(T.key)), 1.4, 0.9), T.bt(bar))
            continue
        for b, dd, vel in ((0, 1.4, 1.0), (1.5, 0.9, 0.7), (2.5, 1.2, 0.8)):
            if bar == lastb - 1 and b > 2: continue
            for k, m in enumerate(v):
                put(harm, I.ep(mtof(m), round(dd * beat, 4), vel * (1 - 0.05 * k)), T.bt(bar, b) + k * 0.006)
        put(harm, I.pad(tuple(mtof(m - 12) for m in v), 2.0), T.bt(bar))
        r = chord_bass(ch)
        put(bass, I.bass(mtof(r), 0.62 * 2 * beat, 1.0), T.bt(bar, 0))
        put(bass, I.bass(mtof(r), 0.25 * 2 * beat, 0.7), T.bt(bar, 1.5))
        put(bass, I.bass(mtof(r + 7), 0.5 * 2 * beat, 0.75), T.bt(bar, 2.5))
        if fb + 2 <= bar <= lastb - 2: put(bass, I.bass(mtof(r + 12), 0.2 * 2 * beat, 0.5), T.bt(bar, 3.5))
        # kitchen percussion
        for b in (0, 1.5, 2.5): put(drums, I.thump(0.9 if b == 0 else 0.6), T.bt(bar, b))
        for b in (1, 3):
            put(drums, I.clink(2350 if b == 1 else 2750, 0.8), T.bt(bar, b), 1.0, 0.2); put(drums, I.board(0.55), T.bt(bar, b))
        for s in range(8):
            put(drums, I.whisk(0.9 if s % 2 else 0.5, s + bar), T.bt(bar, s * 0.5), 1.0, (-.3 if s % 2 else .3))
            put(drums, I.whisk(0.25, s + 3 * bar), T.bt(bar, s * 0.5 + 0.25))
        if bar >= fb + 2: put(drums, I.clink(3300, 0.4), T.bt(bar, 3.75), 1.0, -.3)
        if bar in (fb + 1, lastb - 1):
            for j, b in enumerate((3.0, 3.25, 3.5, 3.75)): put(drums, I.board(round(0.35 + .12 * j, 2)), T.bt(bar, b))
        t0 = T.bt(bar)
        if T.in_sec(T.lift, t0):
            v2 = v
            arp = [v2[0] + 12, v2[1] + 12, v2[2] + 12, v2[3] + 12, v2[2] + 12, v2[1] + 12, v2[0] + 12, v2[1] + 12]
            for j, m in enumerate(arp): put(harm, I.marimba(mtof(m), 0.7, 0.6), T.bt(bar, j * 0.5), kL * 0.9, (-.4 if j % 2 else .4))
            for s in range(16): put(drums, I.whisk(0.5, s + bar), T.bt(bar, s * 0.25 + 0.125), kL, (-.4 if s % 2 else .4))
        if T.in_sec(T.swaps, t0):
            for b in range(4):
                put(drums, I.clink(3000 + 400 * b, 0.9), T.bt(bar, b), 0.8)
                put(mot, I.marimba(mtof(v[3] + 12 - (b % 2) * 5), 0.8, 0.5), T.bt(bar, b), 0.8)
    harm = reverb_mix(harm, 0.22)
    bass = bass * 1.7
    if lastb > fb: drums[int(T.last_t * SR):] = 0

    # ---------- the motif ----------
    I.motif(mot, T.drop, notes, 0, beat, 1.0)
    h = 0
    for bar in range(fb + 4, lastb - 1, 4):
        I.motif(mot, T.bt(bar), notes, 0, beat, 0.45 + 0.1 * (h % 2), ep_layer=False); h += 1
    I.motif(mot, T.last_t, notes, ding, beat, 1.1)
    mot = reverb_mix(mot, 0.3)

    stems = {'drums': drums, 'bass': bass, 'harmonic': harm, 'motif': mot, 'fx': fx}
    gap0 = int(T.breath[0] * SR) if T.breath else None
    gap1 = int(T.drop * SR) - 1
    for k in stems:
        s = stems[k].copy()
        if gap0 is not None and gap1 > gap0: s[gap0:gap1] = 0
        stems[k] = env(s, [(0, 0), (max(0, T.dur - 0.8), 0), (T.dur, -45)])
    return stems, T
