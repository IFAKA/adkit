import hashlib, json, os, subprocess, sys, wave
import numpy as np
import pytest

AUDIO = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
sys.path.insert(0, AUDIO)
import synth  # noqa: E402
import sounddesign  # noqa: E402
import score  # noqa: E402
from synth import sample as sample_mod  # noqa: E402
from synth.core import SR  # noqa: E402
from synth.wavio import write_wav  # noqa: E402

ALL = [('modal', p) for p in synth.PRESETS['modal']] + [('pluck', p) for p in synth.PRESETS['pluck']] + \
      [('fm', p) for p in synth.PRESETS['fm']] + [('subtractive', p) for p in synth.PRESETS['subtractive']] + \
      [('drums', p) for p in synth.PRESETS['drums']] + \
      [(m, None) for m in ('drop', 'bubbles', 'pour', 'splash', 'shaker', 'gravel', 'rain', 'claps_crowd', 'wind', 'whoosh', 'paper', 'murmur')]


@pytest.mark.parametrize('model,preset', ALL)
def test_model_finite_no_clip_deterministic(model, preset):
    a = synth.render_model(model, {}, 7, preset)
    b = synth.render_model(model, {}, 7, preset)
    assert np.isfinite(a).all() and len(a) > 100
    assert np.abs(a).max() <= 1.0 and np.abs(a).max() > 0.01
    assert a.tobytes() == b.tobytes()


def peak_hz(y):
    spec = np.abs(np.fft.rfft(y * np.hanning(len(y)), 1 << 18))
    return np.argmax(spec) * SR / (1 << 18)


def acf_hz(y):
    y = y - y.mean(); n = len(y)
    ac = np.fft.irfft(np.abs(np.fft.rfft(y, 2 * n)) ** 2)[:n // 2]
    lo = int(SR / 1500)
    return SR / (lo + np.argmax(ac[lo:]))


def test_pluck_pitch():
    for f in (110, 220, 440, 880):
        y = synth.render_model('pluck', {'freq': f, 'dur': 0.6}, 1, 'guitar')
        assert abs(acf_hz(y[int(.05 * SR):int(.4 * SR)]) - f) / f < 0.02, f


def test_drop_pitch_rises():
    y = synth.render_model('drop', {'freq': 1000, 'dur': 0.1, 'damping': 0.4}, 1)
    a, b = y[int(.002 * SR):int(.02 * SR)], y[int(.03 * SR):int(.06 * SR)]
    assert peak_hz(b) > peak_hz(a)


def test_modal_inharmonic_bell():
    y = synth.render_model('modal', {'freq': 500}, 1, 'tram_bell')
    spec = np.abs(np.fft.rfft(y, 1 << 18)); fr = np.fft.rfftfreq(1 << 18, 1 / SR)
    ratios = [1.59, 2.14, 2.30]
    for r in ratios:
        band = (fr > 500 * r * .99) & (fr < 500 * r * 1.01)
        assert spec[band].max() > spec.max() * .03


SOUND = {'meaning': 'tram bell at a city stop', 'seed': 1, 'layers': [{'model': 'modal', 'preset': 'tram_bell', 'note': 'E6', 'gain': -3}], 'fx': [{'type': 'reverb', 'rt60': .5, 'wet': .1}]}


def test_sounddesign_deterministic_bytes(tmp_path):
    p = tmp_path / 's.json'; p.write_text(json.dumps(SOUND))
    outs = []
    for i in range(2):
        o = tmp_path / f'o{i}.wav'
        assert sounddesign.main([str(p), '--out', str(o)]) == 0
        outs.append(o.read_bytes())
    assert outs[0] == outs[1]
    with wave.open(str(tmp_path / 'o0.wav')) as w:
        assert w.getframerate() == 48000 and w.getnchannels() == 2


def test_meaning_required(tmp_path, capsys):
    bad = dict(SOUND); del bad['meaning']
    p = tmp_path / 'b.json'; p.write_text(json.dumps(bad))
    assert sounddesign.main([str(p), '--out', str(tmp_path / 'x.wav')]) == 1
    assert 'meaning' in capsys.readouterr().err
    assert not (tmp_path / 'x.wav').exists()
    bad['meaning'] = 'bell'
    p.write_text(json.dumps(bad))
    assert sounddesign.main([str(p), '--out', str(tmp_path / 'x.wav')]) == 1


def test_cli_exit_code_meaning(tmp_path):
    bad = dict(SOUND); bad['meaning'] = ''
    p = tmp_path / 'b.json'; p.write_text(json.dumps(bad))
    r = subprocess.run([sys.executable, os.path.join(AUDIO, 'sounddesign.py'), str(p), '--out', str(tmp_path / 'x.wav')], capture_output=True, text=True)
    assert r.returncode == 1 and 'meaning' in r.stderr


def make_wav(path, seed=0):
    x = np.random.default_rng(seed).uniform(-.3, .3, 4800)
    write_wav(path, x)


def test_sample_layer_license_and_hash(tmp_path):
    f = tmp_path / 'a.wav'; make_wav(f)
    s = {'meaning': 'recorded door knock in the shop', 'layers': [{'model': 'sample', 'params': {'file': 'a.wav', 'license': 'own'}}]}
    h1 = sounddesign.content_hash(s, 0, str(tmp_path))
    assert len(sounddesign.render_sound(s, 0, str(tmp_path))) >= 4800
    make_wav(f, seed=1)  # same name, different bytes -> new hash
    assert sounddesign.content_hash(s, 0, str(tmp_path)) != h1
    s['layers'][0]['params']['license'] = 'all rights reserved'
    with pytest.raises(sounddesign.SoundError):
        sounddesign.render_sound(s, 0, str(tmp_path))
    s['layers'][0]['params'].pop('license')
    with pytest.raises(sounddesign.SoundError):
        sounddesign.render_sound(s, 0, str(tmp_path))
    s['layers'][0]['params'] = {'file': '../a.wav', 'license': 'CC0'}
    with pytest.raises(sounddesign.SoundError):
        sounddesign.render_sound(s, 0, str(tmp_path / 'sub'))


def music(beats=3, unit=4, bpm=120, bars=2):
    return {'bpm': bpm, 'meter': {'beats': beats, 'unit': unit}, 'key': 'D minor', 'seed': 2,
            'instruments': {'k': {'model': 'drums'}, 'g': {'model': 'pluck', 'preset': 'guitar'}},
            'patterns': {'p': {'bars': 1, 'hits': [[0, 'kick', 1]], 'notes': []}, 'n': {'bars': 1, 'notes': [[0, 1, 1, .8], [1, 'c3', 1]]}},
            'sections': [{'name': 'A', 'bars': bars, 'chords': ['Dm', 'A7'], 'tracks': {'k': 'p', 'g': 'n'}}]}


def test_meter_3_4_cue_grid():
    mix, stems, cues = score.render_music(music(3, 4, 120, 4))
    assert cues['meter'] == {'beats': 3, 'unit': 4, 'accents': [1, .55, .55]}
    assert cues['total_bars'] == 4 and abs(cues['bar_seconds'] - 1.5) < 1e-9
    b1 = cues['bars'][1]
    assert [x['beat'] for x in b1['beats']] == [1, 2, 3]
    assert [round(x['t'], 3) for x in b1['beats']] == [1.5, 2.0, 2.5]
    assert b1['chord'] == 'A7'


def test_meter_6_8_cue_grid():
    mix, stems, cues = score.render_music(music(6, 8, 60, 2))  # bpm counts dotted quarters: bar = 2 beats = 2 s
    assert abs(cues['bar_seconds'] - 2.0) < 1e-9
    ts = [round(x['t'], 4) for x in cues['bars'][0]['beats']]
    assert ts == [round(i * 1 / 3, 4) for i in range(6)]
    assert cues['meter']['accents'][0] == 1 and cues['meter']['accents'][3] > cues['meter']['accents'][1]


def test_score_drum_hit_lands_on_beat():
    mix, stems, cues = score.render_music(music(3, 4, 120, 2))
    k = stems['k'][:, 0]
    on = np.where(np.abs(k) > 1e-3)[0]
    assert abs(on[0] / SR - 0.0) < .01
    second = on[on > int(1.0 * SR)][0] / SR
    assert abs(second - 1.5) < .01  # next bar starts after 3 quarters at 120 bpm


def test_score_deterministic_and_no_clip(tmp_path):
    outs = []
    for i in range(2):
        d = tmp_path / str(i)
        p = tmp_path / 'm.json'; p.write_text(json.dumps(music(3, 4, 170, 4)))
        assert score.main([str(p), '--out-dir', str(d)]) == 0
        outs.append(hashlib.sha256((d / 'mix.wav').read_bytes()).hexdigest())
    assert outs[0] == outs[1]
    mix, _, _ = score.render_music(music(3, 4, 170, 4))
    assert np.abs(mix).max() <= 1.0 and np.isfinite(mix).all()


def test_missing_music_is_error(tmp_path, capsys):
    assert score.main([str(tmp_path / 'nope.json'), '--out-dir', str(tmp_path / 'o')]) == 1
    (tmp_path / 'e.json').write_text('{}')
    assert score.main([str(tmp_path / 'e.json'), '--out-dir', str(tmp_path / 'o')]) == 1
    assert 'no music' in capsys.readouterr().err


def test_score_errors_are_clear():
    m = music(); m['sections'][0]['tracks']['ghost'] = 'p'
    with pytest.raises(score.ScoreError, match='ghost'):
        score.render_music(m)
    m = music(); m['patterns']['n']['notes'].append([5, 1, 1])
    with pytest.raises(score.ScoreError, match='outside'):
        score.render_music(m)


def test_fx_deterministic_and_finite():
    x = np.zeros((SR // 2, 2)); x[100] = 1
    chain = [{'type': 'reverb', 'rt60': 1}, {'type': 'delay', 'time': .1, 'pingpong': True}, {'type': 'eq', 'bands': [{'type': 'peak', 'hz': 1000, 'gain_db': 6}]},
             {'type': 'saturate', 'drive': .5}, {'type': 'widen', 'amount': .5}, {'type': 'limit', 'ceiling_db': -3}]
    a = synth.fx.apply_fx(x, chain, 3); b = synth.fx.apply_fx(x, chain, 3)
    assert np.array_equal(a, b) and np.isfinite(a).all() and np.abs(a).max() <= 10 ** (-3 / 20) + 1e-6
