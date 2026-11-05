#!/usr/bin/env python3
"""Render every demo json in this folder to audio/demos/out/ (wav + spectrogram png) and print the stats lines."""
import glob, json, os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..')); sys.path.insert(0, os.path.join(HERE, '..', 'tools'))
import sounddesign, score, spectrogram  # noqa: E402

out = os.path.join(HERE, 'out'); os.makedirs(out, exist_ok=True)
rc = 0
for f in sorted(glob.glob(os.path.join(HERE, '*.json'))):
    name = os.path.splitext(os.path.basename(f))[0]; t = time.time()
    music = 'instruments' in json.load(open(f))
    if music:
        rc |= score.main([f, '--out-dir', os.path.join(out, name)]); wav = os.path.join(out, name, 'mix.wav')
    else:
        wav = os.path.join(out, name + '.wav'); rc |= sounddesign.main([f, '--out', wav])
    spectrogram.main([wav])
    print(f'  {name}: {time.time() - t:.1f} s')

# sampled-instrument versions (need `python3 audio/fetch_samples.py` once): out/jota/mix_samples.wav and out/jota/ad15.wav
from synth import samplelib  # noqa: E402
from synth.core import SR  # noqa: E402
from synth.wavio import write_wav  # noqa: E402
import numpy as np  # noqa: E402


def render_real():
    miss = samplelib.missing()
    if miss:
        print(f'  sampled demos skipped: packs not downloaded ({", ".join(miss)}). Run: {samplelib.FETCH_CMD}'); return 1
    d = os.path.join(out, 'jota'); os.makedirs(d, exist_ok=True); r = 0
    for name, dest in (('jota_samples', 'mix_samples.wav'), ('ad15', 'ad15.wav')):
        f = os.path.join(HERE, 'real', name + '.json'); t = time.time()
        music = json.load(open(f))
        mix, stems, cues = score.render_music(music, os.path.join(HERE, 'real'))
        if name == 'ad15':  # the ad is exactly 15 bars long: cut the reverb tail there, with a short fade
            n = int(round(cues['seconds'] * SR)); mix = mix[:n].copy(); k = int(.35 * SR); mix[-k:] *= np.linspace(1, 0, k)[:, None]
            stems = {k_: v[:n] for k_, v in stems.items()}
        write_wav(os.path.join(d, dest), mix)
        sd = os.path.join(d, name + '_stems'); os.makedirs(sd, exist_ok=True)
        for k_, v in stems.items(): write_wav(os.path.join(sd, k_ + '.wav'), v)
        json.dump(cues, open(os.path.join(d, name + '_cues.json'), 'w'), indent=1)
        spectrogram.main([os.path.join(d, dest)])
        print(f'  {name} -> jota/{dest}: {time.time() - t:.1f} s')
    return r


rc |= render_real()
sys.exit(rc)
