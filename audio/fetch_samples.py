#!/usr/bin/env python3
"""Download the sample packs named in audio/samples.lock.json into ~/.cache/adkit/samples/ and verify every sha256.

    python3 audio/fetch_samples.py [PACK ...] [--check] [--licenses]

--check     only report which packs are missing (exit 1 if any)
--licenses  print source and license of every pack
Recordings are never committed to git. Downloads go into a new temp directory, only audio files are kept, nothing is run.
"""
import argparse, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from synth import samplelib  # noqa: E402


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('packs', nargs='*'); ap.add_argument('--check', action='store_true'); ap.add_argument('--licenses', action='store_true')
    a = ap.parse_args(argv)
    try:
        lock = samplelib.load_lock()
        names = a.packs or list(lock['packs'])
        for n in names: samplelib.pack_of(n, lock)
        if a.licenses:
            for n in names:
                p = lock['packs'][n]; print(f'{n}: {p["license"]} | {p["source"]} | {p["licenseUrl"]}')
            return 0
        if a.check:
            m = samplelib.missing(names, lock)
            print('missing: ' + ', '.join(m) if m else 'all packs present')
            return 1 if m else 0
        samplelib.fetch(names, lock)
    except (samplelib.SampleError, OSError) as e:
        print(f'fetch_samples: {e}', file=sys.stderr); return 1
    print('samples ok')
    return 0


if __name__ == '__main__':
    sys.exit(main())
