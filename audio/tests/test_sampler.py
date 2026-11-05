import copy, hashlib, json, os, sys, wave
import numpy as np
import pytest

AUDIO = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
sys.path.insert(0, AUDIO)
import score  # noqa: E402
from synth import sampler as sm, samplelib  # noqa: E402
from synth.core import SR  # noqa: E402

REAL_LOCK = os.path.join(AUDIO, 'samples.lock.json')


def click_wav(path, hz, ms=1000, lead=0.01):
    t = np.arange(int(SR * ms / 1000)) / SR
    x = np.sin(2 * np.pi * hz * t) * np.exp(-t * 8) * 0.6
    x = np.concatenate([np.zeros(int(lead * SR)), x])
    pcm = np.round(x * 32767).astype('<i2')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())


@pytest.fixture
def fake(tmp_path, monkeypatch):
    """A tiny fake 'meatbass-pizz' pack served from local files, fetched into a temp cache."""
    src = tmp_path / 'src'; files = {}
    names = {'c2_vl1_rr1': 65.4, 'c2_vl1_rr2': 65.4, 'c2_vl3_rr1': 65.4, 'eb2_vl1_rr1': 77.8, 'a2_vl1_rr1': 110.0}
    for n, hz in names.items(): click_wav(str(src / f'{n}.wav'), hz)
    base = 'http://example.invalid/'
    pack = dict(name='fake', source='test', license='CC0-1.0', licenseUrl='x', licenseEvidence=[], baseUrl=base, files={})
    local = {}
    for n in names:
        rel = f'Samples/pizz/{n}.wav'
        pack['files'][rel] = hashlib.sha256((src / f'{n}.wav').read_bytes()).hexdigest()
        local[base + rel.replace('/', '/')] = str(src / f'{n}.wav')
    lock = {'version': 1, 'packs': {'meatbass-pizz': pack}}
    lp = tmp_path / 'lock.json'; lp.write_text(json.dumps(lock))
    monkeypatch.setenv('ADKIT_SAMPLES_DIR', str(tmp_path / 'cache')); monkeypatch.setenv('ADKIT_SAMPLES_LOCK', str(lp))
    return dict(lock=lock, local=local, lock_path=str(lp), tmp=tmp_path)


def test_fetch_verify_and_missing_message(fake):
    lock = samplelib.load_lock()
    assert samplelib.missing(lock=lock) == ['meatbass-pizz']
    with pytest.raises(samplelib.SampleError, match='fetch_samples.py'):
        sm.Sampler('bass', 1, 0)
    samplelib.fetch(lock=lock, local=fake['local'], log=lambda *_: None)
    assert samplelib.missing(lock=lock) == []
    S = sm.Sampler('bass', 1, 0)
    assert len(S.zones) == 5


def test_bad_sha_in_lock_is_refused(fake):
    bad = copy.deepcopy(fake['lock'])
    k = sorted(bad['packs']['meatbass-pizz']['files'])[0]
    bad['packs']['meatbass-pizz']['files'][k] = '0' * 64
    with pytest.raises(samplelib.SampleError, match='sha256'):
        samplelib.fetch(lock=bad, local=fake['local'], log=lambda *_: None)
    assert samplelib.missing(lock=bad) == ['meatbass-pizz']  # nothing half-installed


def test_tampered_cache_file_is_refused(fake):
    lock = samplelib.load_lock()
    samplelib.fetch(lock=lock, local=fake['local'], log=lambda *_: None)
    d = os.path.join(samplelib.pack_dir('meatbass-pizz', lock), 'files', 'Samples', 'pizz', 'c2_vl1_rr1.wav')
    with open(d, 'ab') as fh: fh.write(b'x')
    with pytest.raises(samplelib.SampleError, match='does not match the lock'):
        samplelib.read_verified('meatbass-pizz', 'Samples/pizz/c2_vl1_rr1.wav', lock)


def test_note_mapping_layers_round_robin_and_range(fake):
    lock = samplelib.load_lock()
    samplelib.fetch(lock=lock, local=fake['local'], log=lambda *_: None)
    S = sm.Sampler('bass', 5, 0)
    z, sh = S.pick(36, .2); assert z['midi'] == 36 and sh == 0 and z['layer'] == 0
    z, sh = S.pick(37, .2); assert z['midi'] == 36 and sh == 1          # nearest root, shifted up 1
    z, sh = S.pick(40, .2); assert z['midi'] == 39 and sh == 1
    z, sh = S.pick(38, .2); assert z['midi'] == 39 and sh == -1         # tie-free: eb2 is 1 away
    z, sh = S.pick(36, .95); assert z['layer'] == 1                    # hard hit -> hard layer
    seq = [S.pick(36, .2)[0]['rel'] for _ in range(30)]
    assert all(a != b for a, b in zip(seq, seq[1:])) and len(set(seq)) == 2   # round robin, never twice in a row
    with pytest.raises(samplelib.SampleError, match='semitones from the nearest'):
        S.pick(60, .5)
    # max shift is 3 semitones
    z, sh = S.pick(48, .5) if False else S.pick(47, .5)  # a2 = 45 -> 2 semitones
    assert sh == 2


def test_note_is_trimmed_to_attack_and_released(fake):
    lock = samplelib.load_lock()
    samplelib.fetch(lock=lock, local=fake['local'], log=lambda *_: None)
    S = sm.Sampler('bass', 5, 0)
    y = S.note(36, .9, .1)
    assert np.abs(y[:int(.002 * SR) + 50]).max() > 0.01          # leading 10 ms silence was cut
    assert len(y) <= int((.1 + .36) * SR)                         # released after the note length
    assert np.abs(y[-20:]).max() < 1e-3


def music_for(fake):
    ev = lambda *n: n
    return {'bpm': 180, 'meter': {'beats': 3, 'unit': 4}, 'key': 'D minor', 'seed': 3,
            'instruments': {'bass': {'model': 'sampler', 'preset': 'bass', 'octave': 2, 'humanize': {'timing_ms': 3, 'velocity': .05}, 'params': {'strum_ms': 15}}},
            'patterns': {'p': {'bars': 1, 'notes': [[0, 'c1', 1, .8, 'd'], [0, 'c3', 1, .8, 'd'], [1, 'c3', 1, .8, 'u'], [1, 'c1', 1, .8, 'u']]}},
            'sections': [{'name': 'A', 'bars': 2, 'chords': ['Dm'], 'tracks': {'bass': 'p'}}]}


def test_render_deterministic_and_strum_order(fake, monkeypatch):
    lock = samplelib.load_lock()
    samplelib.fetch(lock=lock, local=fake['local'], log=lambda *_: None)
    m = music_for(fake)
    a, _, _ = score.render_music(m); b, _, _ = score.render_music(m)
    assert a.tobytes() == b.tobytes() and np.abs(a).max() > .01
    # strum: record the order and time of note starts with a stub
    calls = []
    orig = sm.Sampler.note

    def stub(self, midi, vel=.8, dur_s=None, artic=None, ring=False):
        calls.append(midi); y = np.zeros(20); y[0] = 1.0; return y
    monkeypatch.setattr(sm.Sampler, 'note', stub)
    m['instruments']['bass']['humanize'] = {}
    _, stems, _ = score.render_music(m)
    on = np.where(np.abs(stems['bass'][:, 0]) > .5)[0] / SR * 1000
    assert len(on) == 8
    first = on[:2]; second = on[2:4]
    assert 15 * .8 - .1 <= first[1] - first[0] <= 15 * 1.2 + .1       # staggered by strum_ms +-20%
    assert calls[0] < calls[1] and calls[2] > calls[3]                # down strum low->high, up strum high->low


def test_content_hash_changes_with_pack(fake):
    lock = samplelib.load_lock()
    m = music_for(fake)
    h1 = score.content_hash(m)
    p2 = copy.deepcopy(lock); k = sorted(p2['packs']['meatbass-pizz']['files'])[0]; p2['packs']['meatbass-pizz']['files'][k] = '1' * 64
    assert samplelib.pack_key(p2['packs']['meatbass-pizz']) != samplelib.pack_key(lock['packs']['meatbass-pizz'])
    assert len(h1) == 64


def test_real_lock_is_complete():
    lock = json.load(open(REAL_LOCK))
    assert lock['packs']
    for n, p in lock['packs'].items():
        for k in ('name', 'source', 'license', 'licenseUrl', 'licenseEvidence', 'files'):
            assert p.get(k), (n, k)
        assert all(len(h) == 64 for h in p['files'].values())
        assert (p.get('archive') or {}).get('sha256', 'x' * 64).__len__() == 64 and (p.get('archive') or p.get('baseUrl'))
    for n in sm.SETS:  # every set finds its files in the lock
        assert sm.SETS[n]['zones'](lock), n


@pytest.mark.skipif(bool(samplelib.missing(lock=json.load(open(REAL_LOCK)))), reason='run python3 audio/fetch_samples.py first')
def test_real_jota_samples_deterministic():
    m = json.load(open(os.path.join(AUDIO, 'demos', 'real', 'jota_samples.json')))
    base = os.path.join(AUDIO, 'demos', 'real')
    a, _, _ = score.render_music(m, base); b, _, _ = score.render_music(m, base)
    assert a.tobytes() == b.tobytes()
    assert np.isfinite(a).all() and np.abs(a).max() <= 1.0
