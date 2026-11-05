#!/usr/bin/env python3
"""adkit audio: plan JSON -> 48 kHz stereo 16-bit WAV, deterministic. Needs numpy + ffmpeg.
The music (score.py) and every cue's sound (sounddesign.py) come from the plan; there is no built-in song or palette.
Usage: python3 audio/build.py --plan PLAN.json --out OUT.wav [--workdir DIR] [--cache-dir DIR] [--base-dir DIR] [--png-dir DIR] [--pngs-only]"""
import argparse, json, os, re, subprocess, sys, wave
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'tools'))
from synth.core import SR, db, nsamp  # noqa: E402
import score, sounddesign, mix  # noqa: E402
import spectrogram  # noqa: E402


def write_wav(path, x):
    pcm = np.clip(np.round(x * 32767.0), -32768, 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def measure(path, aac=False):
    """Loudness and true peak. With aac=True the file is first passed through the same AAC encode the video gets,
    because AAC adds up to 2 dB of overshoot and the limit must hold in the final file, not only in the WAV."""
    if aac:
        coded = path + '.aac.m4a'
        subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', path, '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
                        '-fflags', '+bitexact', '-flags:a', '+bitexact', '-map_metadata', '-1', coded], check=True)
        path = coded
    r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', path, '-af', 'ebur128=peak=true', '-f', 'null', '-'],
                       capture_output=True, text=True)
    if aac:
        os.remove(path)
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
        i, tp = measure(out, aac=True)
        ok = abs(i - target) <= 0.1 and tp <= tp_target
        if best is None or (tp <= tp_target and abs(i - target) < abs(best[0] - target)): best = (i, tp, gain, ceil_db)
        if ok: return i, tp
        if tp > tp_target: ceil_db -= (tp - tp_target) + 0.05
        gain += target - i
    # fall back to the best valid state
    if best:
        y = limit(mixed * db(best[2]), db(best[3])); write_wav(out, y); return measure(out, aac=True)
    return i, tp


def measure_raw(mixed, tmp):
    """Integrated loudness of the unscaled mix (scaled down to fit a 16-bit file, then corrected)."""
    scale = min(1.0, 0.9 / max(float(np.abs(mixed).max()), 1e-9))
    write_wav(tmp, mixed * scale)
    return measure(tmp)[0] - 20 * np.log10(scale)


def fit_music(x, N):
    """Pad or cut the music to the ad length; a cut gets a short fade-out."""
    if len(x) >= N:
        y = x[:N].copy()
        if len(x) > N:
            k = min(N, int(0.12 * SR)); y[-k:] *= np.linspace(1, 0, k)[:, None]
        return y
    return np.pad(x, ((0, N - len(x)), (0, 0)))


def write_pngs(plan, used_sounds, music_mix, final, png_dir, cache, base_dir):
    """Spectrogram PNGs (and wavs) of the final mix, the music and each sound, so an agent can look at them."""
    os.makedirs(os.path.join(png_dir, 'sounds'), exist_ok=True)
    paths = {}
    if final is not None:
        spectrogram.render_png(final, os.path.join(png_dir, 'mix.png')); paths['mix'] = os.path.join(png_dir, 'mix.png')
    if music_mix is not None:
        spectrogram.render_png(music_mix, os.path.join(png_dir, 'music.png')); paths['music'] = os.path.join(png_dir, 'music.png')
    for name in sorted(plan['sounds']):
        sd = plan['sounds'][name]
        seed = (int(sd.get('seed', 0)) + int(plan.get('seed', 21)) * 1009) & 0x7FFFFFFF
        x = cache.get('snd:' + sounddesign.content_hash(sd, seed, base_dir), lambda: sounddesign.render_sound(sd, seed, base_dir))
        f = os.path.join(png_dir, 'sounds', f'{name}.png')
        spectrogram.render_png(x, f); paths[name] = f
        from synth.wavio import write_wav
        write_wav(os.path.join(png_dir, 'sounds', f'{name}.wav'), x)
    return paths


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--plan', required=True); ap.add_argument('--out', required=True); ap.add_argument('--workdir')
    ap.add_argument('--cache-dir'); ap.add_argument('--base-dir'); ap.add_argument('--png-dir'); ap.add_argument('--pngs-only', action='store_true')
    a = ap.parse_args()
    plan = json.load(open(a.plan))
    base = a.base_dir or os.path.dirname(os.path.abspath(a.plan))
    work = a.workdir or os.path.dirname(os.path.abspath(a.out)); os.makedirs(work, exist_ok=True)
    cache = mix.Cache(a.cache_dir or os.path.join(work, 'cache'), mix.code_hash())
    try:
        if not plan.get('music'): raise score.ScoreError('the plan has no music: there is no default song')
        if a.pngs_only:  # the mastered wav exists; only the pictures are missing
            from synth.sample import read_wav
            final, _ = read_wav(a.out)
            written = write_pngs(plan, None, None, final, a.png_dir, cache, base)
            for k, v in written.items(): print(f'png {k} {v}')
            return
        N = nsamp(float(plan['durationSeconds']))
        mkey = 'music:' + score.content_hash(plan['music'], None, base)
        slot = cache.slot(mkey)
        if os.path.exists(slot + '.npy') and os.path.exists(slot + '.json'):
            mixm = np.load(slot + '.npy'); mcues = json.load(open(slot + '.json'))
        else:
            mixm, _st, mcues = score.render_music(plan['music'], base)
            json.dump(mcues, open(slot + '.json', 'w')); np.save(slot + '.npy', mixm)
        mus = fit_music(mixm, N) * db(float((plan.get('mix') or {}).get('musicGain', 0)))
        bus, duck, used = mix.render(plan, mcues, N, cache, base)
    except (score.ScoreError, sounddesign.SoundError, ValueError, KeyError, OSError) as e:
        print(f'audio: {e}', file=sys.stderr); sys.exit(1)
    mixed = mus * db(-duck)[:, None] + bus
    loud = (plan.get('mix') or {}).get('loudness') or {}
    tmp = os.path.join(work, '_pre.wav')
    lufs, tp = master(mixed, float(loud.get('lufs', -14)), float(loud.get('truePeak', -1.5)), a.out, tmp)
    os.remove(tmp)
    if a.png_dir:
        from synth.sample import read_wav
        final, _ = read_wav(a.out)
        for k, v in write_pngs(plan, used, mus, final, a.png_dir, cache, base).items(): print(f'png {k} {v}')
    print(f'audio ok {lufs:.1f} LUFS {tp:.1f} dBTP {N / SR:.1f} s, {len(plan["placements"])} cues, {len(plan["sounds"])} sounds')


if __name__ == '__main__':
    main()
