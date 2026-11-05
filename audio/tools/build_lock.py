#!/usr/bin/env python3
"""Regenerate audio/samples.lock.json: download each wanted pack, hash every file used, write the lock.
Maintainers only (people who render just run audio/fetch_samples.py).

    python3 audio/tools/build_lock.py [--local URL=PATH ...] [--out audio/samples.lock.json]

--local reuses an archive already on disk instead of downloading it again.
"""
import argparse, hashlib, json, os, sys, tempfile, zipfile, urllib.parse
from concurrent.futures import ThreadPoolExecutor
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..'))
from synth import samplelib  # noqa: E402

CC0_URL = 'https://creativecommons.org/publicdomain/zero/1.0/'
META_ZIP = 'https://github.com/facebookincubator/Meta-open-sound/releases/download/meta-nylon-guitar-v1.0.0/meta-open-sound-meta-nylon-guitar-ogg.zip'
PHIL_STR = 'https://philharmonia-assets.s3-eu-west-1.amazonaws.com/uploads/2020/02/12112005/Strings.zip'
PHIL_PERC = 'https://philharmonia-assets.s3-eu-west-1.amazonaws.com/uploads/2020/02/12112005/Percussion.zip'
VCSL = 'https://raw.githubusercontent.com/sgossner/VCSL/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/'
BODY = 'https://raw.githubusercontent.com/sfzinstruments/body_percussion/4ac9d8966679c648b62fa10a188179e186b97f24/'
MEAT = 'https://raw.githubusercontent.com/sfzinstruments/karoryfer.meatbass/ac9e859564bda286ab5ec672d00ff1aa2fef2895/'
PHIL_TERMS = ('You are free to use these samples as you wish, including releasing them as part of a commercial work. '
              'The only restriction is that they must not be sold or made available "as is" (i.e. as samples or as a sampler instrument).')

PACKS = {
    'meta-nylon-guitar': dict(
        name='Meta Nylon Guitar (nylon-string classical guitar, 6 strings x 3 layers, E2-B5)',
        source='https://github.com/facebookincubator/Meta-open-sound (release meta-nylon-guitar-v1.0.0)',
        license='CC0-1.0', licenseUrl=CC0_URL,
        licenseEvidence=['Meta-open-sound README: "The instruments are public domain under CC0 1.0 Universal"',
                         'GitHub license API for the repo: cc0-1.0', 'repo LICENSE file: CC0 1.0 Universal'],
        archive=dict(url=META_ZIP, prefix='meta-nylon-guitar/'), pick=lambda n: n.startswith('ogg/') and n.endswith('.ogg')),
    'philharmonia-mandolin': dict(
        name='Philharmonia Orchestra free sound samples: mandolin (normal and tremolo, A3-E6)',
        source='https://philharmonia.co.uk/resources/sound-samples/ (Strings.zip)',
        license='Philharmonia free-use terms (not CC0)', licenseUrl='https://philharmonia.co.uk/resources/sound-samples/',
        licenseEvidence=[PHIL_TERMS, 'No attribution required. We use them inside a composition and never redistribute the samples (they are not in git).'],
        archive=dict(url=PHIL_STR, prefix='Strings/mandolin/'), pick=lambda n: n.endswith('.mp3')),
    'philharmonia-castanets': dict(
        name='Philharmonia Orchestra free sound samples: castanets (single strike, rolls, phrases)',
        source='https://philharmonia.co.uk/resources/sound-samples/ (Percussion.zip)',
        license='Philharmonia free-use terms (not CC0)', licenseUrl='https://philharmonia.co.uk/resources/sound-samples/',
        licenseEvidence=[PHIL_TERMS, 'No attribution required. Not redistributed (not in git).'],
        archive=dict(url=PHIL_PERC, prefix='Percussion/castanets/'), pick=lambda n: n.endswith('.mp3')),
    'body-percussion': dict(
        name='sfzinstruments body_percussion (hand claps and finger claps, 2 velocity layers, 4-6 round robins)',
        source='https://github.com/sfzinstruments/body_percussion (commit 4ac9d89)',
        license='CC0-1.0', licenseUrl=CC0_URL,
        licenseEvidence=['GitHub license API for the repo: cc0-1.0', 'repo LICENSE file: CC0 1.0 Universal'],
        baseUrl=BODY, files=[f'Samples/body/{k}_vl{v}_rr{r}.wav' for k in ('handclap', 'fingerclap') for v in (1, 2) for r in range(1, 7) if not (v == 1 and r > 4)]),
    'vcsl-percussion': dict(
        name='Versilian Community Sample Library: group claps and tambourine',
        source='https://github.com/sgossner/VCSL (commit c1ea7bc)',
        license='CC0-1.0', licenseUrl=CC0_URL,
        licenseEvidence=['VCSL README: "open CC0 general-purpose sample library ... no royalties, no credit, no special terms"',
                         'GitHub license API: cc0-1.0', 'repo LICENSE file: CC0 1.0 Universal'],
        baseUrl=VCSL, files=[f'Idiophones/Struck Idiophones/Claps/Clap_rr{r}.wav' for r in range(1, 7)] +
        ['Idiophones/Struck Idiophones/Tambourine 1/' + f for f in ('Tamb1_Hit_v1_rr1_Mid.wav', 'Tamb1_Hit_v2_rr1_Mid.wav', 'Tamb1_Shake_rr1_Mid.wav', 'Tamb1_Shake_rr2_Mid.wav', 'Tamb1_Roll_v2_rr1_Mid.wav')]),
    'meatbass-pizz': dict(
        name='Karoryfer Meatbass: 1958 Otto Rubner acoustic double bass, pizzicato',
        source='https://github.com/sfzinstruments/karoryfer.meatbass (commit ac9e859)',
        license='CC0-1.0', licenseUrl=CC0_URL,
        licenseEvidence=['repo LICENSE file: CC0 1.0 Universal', 'GitHub license API: cc0-1.0', 'sfzinstruments.github.io strings table: CC0-1.0'],
        baseUrl=MEAT, files=[f'Samples/pizz/{n}_vl{v}_rr{r}.wav' for n in ('c1', 'eb1', 'gb1', 'a1', 'c2', 'eb2', 'gb2', 'a2', 'c3', 'eb3') for v in (1, 3) for r in (1, 2)]),
}


def sha(b): return hashlib.sha256(b).hexdigest()


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--local', action='append', default=[]); ap.add_argument('--out', default=os.path.join(HERE, '..', 'samples.lock.json'))
    a = ap.parse_args()
    local = dict(x.split('=', 1) for x in a.local)
    lock = {'version': 1, 'note': 'Generated by audio/tools/build_lock.py. Recordings are not in git: run python3 audio/fetch_samples.py', 'packs': {}}
    for name, spec in PACKS.items():
        pack = {k: spec[k] for k in ('name', 'source', 'license', 'licenseUrl', 'licenseEvidence')}
        if 'archive' in spec:
            url = spec['archive']['url']
            with tempfile.TemporaryDirectory() as d:
                zp = local.get(url) or os.path.join(d, 'a.zip')
                if url not in local:
                    print('download', url); samplelib._download(url, zp)
                with open(zp, 'rb') as fh: asha = sha(fh.read())
                pre = spec['archive']['prefix']; files = {}
                with zipfile.ZipFile(zp) as z:
                    for m in z.infolist():
                        if m.is_dir() or not m.filename.startswith(pre): continue
                        rel = m.filename[len(pre):]
                        if rel.lower().endswith(samplelib.AUDIO_EXT) and spec['pick'](rel): files[rel] = sha(z.read(m))
                pack['archive'] = dict(url=url, sha256=asha, bytes=os.path.getsize(zp), prefix=pre)
        else:
            pack['baseUrl'] = spec['baseUrl']; files = {}

            def one(rel):
                with tempfile.TemporaryDirectory() as d:
                    p = os.path.join(d, 'f'); samplelib._download(spec['baseUrl'] + urllib.parse.quote(rel), p)
                    with open(p, 'rb') as fh: return rel, sha(fh.read())
            with ThreadPoolExecutor(4) as ex: files = dict(ex.map(one, spec['files']))
        pack['files'] = dict(sorted(files.items()))
        print(name, len(files), 'files'); lock['packs'][name] = pack
    with open(a.out, 'w') as fh: json.dump(lock, fh, indent=1); fh.write('\n')


if __name__ == '__main__':
    main()
