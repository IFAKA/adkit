#!/usr/bin/env python3
"""Look at a sound. PNG with a waveform strip on top and a log-frequency spectrogram below, plus a one-line stats print.

    python3 audio/tools/spectrogram.py IN.wav [--out OUT.png] [--fmax 16000] [--width 1000]
    -> IN.wav: 1.20 s peak -6.0 dBFS rms -22.1 dBFS -24.3 LUFS centroid 2410 Hz peaks 1650 2620 3530 Hz

Axes: x = seconds, y = Hz (log, 50 Hz to fmax; labelled on the left). Colour = level, 80 dB range below the loudest
point (black = quiet, yellow/white = loud). Needs numpy only.
"""
import argparse, os, struct, sys, zlib
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from synth.core import SR, biquad_ir  # noqa: E402
from synth.sample import read_wav  # noqa: E402
from synth.core import fftconv  # noqa: E402

# 3x5 bitmap font
_F = {'0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111', '4': '101101111001001',
      '5': '111100111001111', '6': '111100111101111', '7': '111001001001001', '8': '111101111101111', '9': '111101111001111',
      '.': '000000000000010', 'k': '101101110101101', 's': '011100010001110', 'H': '101101111101101', 'z': '111001010100111',
      '-': '000000111000000', ' ': '000000000000000', 'd': '001001111101111', 'B': '110101110101110', 'L': '100100100100111'}


def png_write(path, rgb):
    h, w, _ = rgb.shape
    raw = b''.join(b'\x00' + rgb[y].tobytes() for y in range(h))
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xFFFFFFFF)
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 6)) + chunk(b'IEND', b''))


def text(img, x, y, s, col=(230, 230, 230), sc=2):
    for ch in s:
        g = _F.get(ch, _F[' '])
        for i in range(15):
            if g[i] == '1':
                yy, xx = y + (i // 3) * sc, x + (i % 3) * sc
                if 0 <= yy < img.shape[0] - sc and 0 <= xx < img.shape[1] - sc: img[yy:yy + sc, xx:xx + sc] = col
        x += 4 * sc


_CM = np.array([[0, 0, 0], [20, 10, 60], [90, 20, 110], [170, 40, 90], [235, 90, 40], [250, 180, 40], [255, 255, 170]], dtype=float)


def cmap(v):
    v = np.clip(v, 0, 1) * (len(_CM) - 1); i = np.minimum(v.astype(int), len(_CM) - 2); f = (v - i)[..., None]
    return (_CM[i] * (1 - f) + _CM[i + 1] * f).astype(np.uint8)


def stft_mag(x, nfft=4096, hop=None, width=1000):
    hop = hop or max(64, len(x) // width)
    win = np.hanning(nfft)
    xp = np.pad(x, (nfft // 2, nfft // 2 + hop))
    nf = max(1, (len(xp) - nfft) // hop)
    idx = np.arange(nfft)[None, :] + hop * np.arange(nf)[:, None]
    return np.abs(np.fft.rfft(xp[idx] * win, axis=1)).T / (nfft / 4), hop


def lufs(x):
    """ITU-R BS.1770-4 integrated loudness (K-weighting + gating), numpy only. x (n,) or (n,2)."""
    x = x if x.ndim == 2 else x[:, None]
    b1, a1 = np.array([1.53512485958697, -2.69169618940638, 1.19839281085285]), np.array([1, -1.69065929318241, 0.73248077421585])
    b2, a2 = np.array([1.0, -2.0, 1.0]), np.array([1, -1.99004745483398, 0.99007225036621])
    h1, h2 = biquad_ir(b1, a1, 20000), biquad_ir(b2, a2, 48000)
    h = fftconv(h1, h2)
    y = np.stack([fftconv(x[:, c], h)[:len(x)] for c in range(x.shape[1])], 1)
    blk, hop = int(.4 * SR), int(.1 * SR)
    if len(y) < blk:
        ms = (y ** 2).mean(0).sum()
        return -0.691 + 10 * np.log10(max(ms, 1e-12))
    z = np.array([(y[i:i + blk] ** 2).mean(0).sum() for i in range(0, len(y) - blk + 1, hop)])
    l = -0.691 + 10 * np.log10(np.maximum(z, 1e-12))
    z1 = z[l > -70]
    if len(z1) == 0: return -70.0
    rel = -0.691 + 10 * np.log10(z1.mean()) - 10
    z2 = z[l > max(rel, -70)]
    return -0.691 + 10 * np.log10(max(z2.mean(), 1e-12)) if len(z2) else -70.0


def stats(path):
    x, sr = read_wav(path)
    if sr != SR: raise SystemExit(f'expected 48000 Hz, got {sr}')
    mono = x.mean(1)
    pk = np.abs(x).max(); rms = np.sqrt((x ** 2).mean())
    mag, _ = stft_mag(mono, 4096, 2048)
    freqs = np.fft.rfftfreq(4096, 1 / SR)
    en = (mag ** 2).sum(1)
    cen = float((freqs * en).sum() / max(en.sum(), 1e-12))
    # peaks: loudest local maxima of the long-term spectrum
    sp = en.copy(); loc = np.where((sp[1:-1] > sp[:-2]) & (sp[1:-1] >= sp[2:]))[0] + 1
    loc = loc[(freqs[loc] > 60)]
    top = sorted(loc[np.argsort(sp[loc])[::-1]][:12], key=lambda i: -sp[i])
    pks = []
    for i in top:
        if all(abs(freqs[i] - q) > freqs[i] * .04 for q in pks) and sp[i] > sp.max() * 1e-4: pks.append(freqs[i])
        if len(pks) == 6: break
    d = lambda v: 20 * np.log10(max(v, 1e-9))
    return dict(seconds=len(x) / SR, peak_db=d(pk), rms_db=d(rms), lufs=lufs(x), centroid=cen, peaks=sorted(pks)), x


def render_png(x, out, fmax=16000, width=1000):
    mono = x.mean(1) if x.ndim == 2 else x
    mag, hop = stft_mag(mono, 4096, None, width)
    freqs = np.fft.rfftfreq(4096, 1 / SR)
    H, W = 380, mag.shape[1]
    fmax = min(fmax, SR / 2 - 1)
    yf = np.geomspace(50, fmax, H)
    spec = np.stack([np.interp(yf, freqs, mag[:, j]) for j in range(W)], 1)[::-1]
    dbm = 20 * np.log10(np.maximum(spec, 1e-9)); top = dbm.max()
    img = cmap((dbm - (top - 80)) / 80)
    WF = 90; L = 70; B = 24
    full = np.zeros((WF + H + B, L + W, 3), np.uint8)
    full[WF:WF + H, L:] = img
    # waveform strip: min/max per column
    n = len(mono); edges = np.linspace(0, n, W + 1).astype(int)
    mid = WF // 2
    mono = np.sign(mono) * np.sqrt(np.abs(mono) / max(np.abs(mono).max(), 1e-9))  # sqrt scale so tails are visible
    for j in range(W):
        seg = mono[edges[j]:max(edges[j + 1], edges[j] + 1)]
        a, b = seg.min(), seg.max()
        y0, y1 = int(mid - np.clip(b, -1, 1) * (mid - 2)), int(mid - np.clip(a, -1, 1) * (mid - 2))
        full[y0:max(y1, y0 + 1) + 1, L + j] = (110, 200, 255)
    full[mid, L:] = np.maximum(full[mid, L:], (60, 60, 60))
    # axes
    for f in (100, 200, 500, 1000, 2000, 5000, 10000):
        if f >= fmax: continue
        y = WF + int(H - 1 - np.log(f / 50) / np.log(fmax / 50) * (H - 1))
        full[y, L:] = np.maximum(full[y, L:], (70, 70, 70))
        text(full, 2, y - 5, f'{f // 1000}k' if f >= 1000 else str(f))
    dur = n / SR; step = 0.1 if dur < 1 else 0.25 if dur < 2.5 else 0.5 if dur < 6 else 1.0 if dur < 15 else 2.0
    s = 0.0
    while s <= dur:
        x_ = L + int(s / dur * (W - 1))
        full[WF:WF + H, x_] = np.maximum(full[WF:WF + H, x_], (60, 60, 60))
        text(full, x_ + 2, WF + H + 6, f'{s:g}s'); s += step
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    png_write(out, full)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('wav'); ap.add_argument('--out'); ap.add_argument('--fmax', type=float, default=16000); ap.add_argument('--width', type=int, default=1000)
    ap.add_argument('--stats-only', action='store_true')
    a = ap.parse_args(argv)
    s, x = stats(a.wav)
    if not a.stats_only: render_png(x, a.out or os.path.splitext(a.wav)[0] + '.png', a.fmax, a.width)
    print(f"{os.path.basename(a.wav)}: {s['seconds']:.2f} s peak {s['peak_db']:.1f} dBFS rms {s['rms_db']:.1f} dBFS "
          f"{s['lufs']:.1f} LUFS centroid {s['centroid']:.0f} Hz peaks {' '.join(f'{p:.0f}' for p in s['peaks'])} Hz")
    return 0


if __name__ == '__main__':
    sys.exit(main())
