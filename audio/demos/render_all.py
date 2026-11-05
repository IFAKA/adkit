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
sys.exit(rc)
