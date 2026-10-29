#!/usr/bin/env python3
"""adkit audio: plan JSON -> 48 kHz stereo 16-bit WAV, deterministic. Needs numpy + ffmpeg.
Usage: python3 audio/build.py --plan PLAN.json --out OUT.wav [--workdir DIR]"""
import argparse, json, os, re, subprocess, sys, wave
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dsp import SR, db  # noqa: E402
import music, mix  # noqa: E402


def write_wav(path, x):
    pcm = np.clip(np.round(x * 32767.0), -32768, 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def measure(path):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', path, '-af', 'ebur128=peak=true', '-f', 'null', '-'],
                       capture_output=True, text=True)
    tail = r.stderr[r.stderr.rindex('Summary:'):]
    i = float(re.search(r'I:\s+(-?[\d.]+) LUFS', tail).group(1))
    tp = float(re.search(r'Peak:\s+(-?[\d.]+) dBFS', tail).group(1))
    return i, tp


def limit(x, ceil):
    """Look-ahead peak limiter (linked stereo), smooth gain, guaranteed <= ceil (linear) on samples."""
    n = len(x); B = 48; nb = -(-n // B)
    a = np.zeros(nb * B); a[:n] = np.abs(x).max(1)
    need = np.minimum(1.0, ceil / np.maximum(a, 1e-9)).reshape(nb, B).min(1)
    d = need.copy()
    for k in range(1, 4):
        d[k:] = np.minimum(d[k:], need[:-k]); d[:-k] = np.minimum(d[:-k], need[k:])
    g = np.repeat(d, B)
    w = np.hanning(6 * B + 2)[1:-1]; w /= w.sum()
    g = np.convolve(np.pad(g, (len(w) // 2, len(w) // 2), mode='edge'), w, mode='valid')[:nb * B][:n]
    return x * g[:, None]


def master(mixed, target, tp_target, out, tmp):
    gain = target - measure_raw(mixed, tmp)
    ceil_db = tp_target - 0.2
    best = None
    for it in range(8):
        y = limit(mixed * db(gain), db(ceil_db))
        write_wav(out, y)
        i, tp = measure(out)
        ok = abs(i - target) <= 0.1 and tp <= tp_target
        if best is None or (tp <= tp_target and abs(i - target) < abs(best[0] - target)): best = (i, tp, gain, ceil_db)
        if ok: return i, tp
        if tp > tp_target: ceil_db -= (tp - tp_target) + 0.05
        gain += target - i
    # fall back to the best valid state
    if best:
        y = limit(mixed * db(best[2]), db(best[3])); write_wav(out, y); return measure(out)
    return i, tp


def measure_raw(mixed, tmp):
    """Integrated loudness of the unscaled mix (scaled down to fit a 16-bit file, then corrected)."""
    scale = min(1.0, 0.9 / max(float(np.abs(mixed).max()), 1e-9))
    write_wav(tmp, mixed * scale)
    return measure(tmp)[0] - 20 * np.log10(scale)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--plan', required=True); ap.add_argument('--out', required=True); ap.add_argument('--workdir')
    a = ap.parse_args()
    plan = json.load(open(a.plan))
    plan.setdefault('sound', {}); s = plan['sound']
    s.setdefault('motif', {'notes': [[0, 67, 0.75], [0.75, 72, 0.25], [1, 76, 0.75], [1.75, 74, 0.25]], 'ding': 84})
    s.setdefault('loudness', {'lufs': -14, 'truePeak': -1.5})
    work = a.workdir or os.path.dirname(os.path.abspath(a.out)); os.makedirs(work, exist_ok=True)
    pings = sorted(float(c['seconds']) for c in plan['cues'] if c.get('role') == 'ping')
    stems, T = music.build_stems(plan, pings)
    bed = sum(stems.values())
    bus, duck = mix.render(plan, T)
    mixed = bed * db(-duck)[:, None] + bus
    tmp = os.path.join(work, '_pre.wav')
    lufs, tp = master(mixed, float(s['loudness']['lufs']), float(s['loudness']['truePeak']), a.out, tmp)
    os.remove(tmp)
    print(f'audio ok {lufs:.1f} LUFS {tp:.1f} dBTP {T.N / SR:.1f} s')


if __name__ == '__main__':
    main()
