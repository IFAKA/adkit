"""SFX placement: cue role/kind -> palette sound, gain, duck, pan. Overrides come from plan.sound.sfx."""
import re
import numpy as np
from dsp import *
import instruments as I
from music import chord_root

# (regex on role, palette name, gain dB, duck dB). First match wins. name None = handled by the music.
ROLES = [
    (r'^(cut|ping|riser-chaos|drop|lockup|final-hit|contact|title-out)$', None, 0, 0),
    (r'^title-in$', 'shimmer', -17, 0),            # only when strong=true (checked in place())
    (r'^bubble-pop', 'pop', -15, 0),
    (r'^icon-morph$', 'swap', -11, 0),
    (r'^app-open$', 'whoosh', -14, 0),
    (r'^(order-lands)$', 'pop', -11, 4),
    (r'^(lift|badge)$', 'pop', -8, 4),
    (r'^tap', 'tap', -8, 4),
    (r'^fly$', 'bag_swish', -10, 0),
    (r'^(macro|whip|cta-whoosh)', 'whoosh', -14, 0),
    (r'^paid$', 'payment_ding', -8, 6),
    (r'^notification$', 'order_bell', -8, 6),
    (r'^count-done$', 'payment_ding', -9, 6),
    (r'^count$', 'receipt_chatter', -13, 0),
    (r'^bars', 'rise', -9, 0),
    (r'^skin-', 'swap', -10, 0),
    (r'^(screen-swap|swap)', 'swap', -12, 0),
]
KINDS = {
    'tap': ('tap', -8, 4), 'pop': ('pop', -8, 4), 'whoosh': ('whoosh', -14, 0), 'hit': ('hit', -10, 0),
    'chime': ('payment_ding', -9, 6), 'ping': ('ping', -14, 0), 'riser': ('rise', -9, 0),
    'swap': ('swap', -12, 0), 'title': ('tick', -20, 0),
}


def place(cue):
    """Return (name, gain, duck, pan) or None."""
    role, kind = cue.get('role', ''), cue.get('kind', '')
    hit = None
    for rx, name, g, dk in ROLES:
        if re.search(rx, role):
            hit = (name, g, dk); break
    if hit is None: hit = KINDS.get(kind)
    if hit is None or hit[0] is None: return None
    if role == 'title-in' and not cue.get('strong'): return None
    return hit[0], hit[1], hit[2], float(cue.get('pan', 0.0) or 0.0)


def override(cue, p, table):
    """Apply sound.sfx overrides: by exact cue name first, then by role."""
    o = {}
    for key in (cue.get('role'), cue.get('name')):
        if key and key in table: o.update(table[key])
    if o.get('mute'): return None
    if not o: return p
    name, g, dk, pan = p if p else ('swap', -10, 0, 0.0)
    if o.get('sound'): name = o['sound']
    if name not in I.PALETTE: raise SystemExit(f"unknown sfx sound '{name}' (palette: {', '.join(sorted(I.PALETTE))})")
    return name, o.get('gain', g), o.get('duck', dk), o.get('pan', pan)


def render(plan, T):
    """Return (sfx bus (N,2), duck curve in dB (N,))."""
    N = T.N; bus = np.zeros((N, 2)); duck = np.zeros(N)
    table = plan.get('sound', {}).get('sfx') or {}
    seed = int(plan['sound'].get('seed', 21))
    for c in sorted(plan['cues'], key=lambda c: (c['seconds'], c['name'])):
        p = override(c, place(c), table)
        if p is None: continue
        name, g, dk, pan = p; t = float(c['seconds']); d = float(c.get('durationSeconds') or 0)
        root = chord_root(T.chord_at(t))
        fn = I.PALETTE[name]
        x = fn(root, seed, dur=d) if name in ('whoosh', 'rise') and d else (fn(root, seed))
        if name == 'receipt_chatter' and d:
            x = x[:int(d * SR)].copy(); k = int(.12 * SR); x[-k:] *= np.linspace(1, 0, k)[:, None]
        x = x * db(g)
        if pan: x = x * np.array([1 - max(pan, 0), 1 + min(pan, 0)])
        i = int(round(t * SR))
        if i >= N: continue
        x = x[:N - i]; bus[i:i + len(x)] += x
        if dk:
            j = min(N, i + int(0.15 * SR)); duck[i:j] = np.maximum(duck[i:j], dk)
    a = np.exp(-1 / (0.01 * SR)); b = np.exp(-1 / (0.08 * SR)); out = np.zeros(N); cur = 0.0
    for i in range(N):
        d = duck[i]; cur = d + (cur - d) * (a if d > cur else b); out[i] = cur
    return bus, out
