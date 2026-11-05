# audio/

Synthesises the ad's soundtrack (music + SFX) from a plan JSON. Synthesised with numpy; sampled instruments (real recordings, CC0 or free-use, never in git) are optional: see "Real instruments".
Same plan JSON -> byte-identical WAV (all randomness comes from `np.random.default_rng(seed)`).

    python3 audio/build.py --plan PLAN.json --out OUT.wav [--workdir DIR]
    -> audio ok -14.0 LUFS -1.6 dBTP 30.0 s

Needs numpy and ffmpeg. From TypeScript use `buildAudio` / `audioKey` in `src/audio/index.ts` (makes `.adkit/venv` for you).

## How it works
- `dsp.py` filters (FFT, zero phase), reverb. `instruments.py` instruments and the SFX palette.
- `music.py` reads `sections` and `sound`: chord per bar = `sound.progression` cycling from the drop bar, with
  `sound.chords` (1-based bar number -> chord) overrides; the last bar resolves to `sound.key`. Notes of the logo come from `sound.motif`.
  - chaos: clashing pings (at the `ping` cues), drone, rising noise, thumps, reverse swell into the end of the section
  - breath: silence until the drop
  - drop: boom + shimmer + the motif; groove: electric piano, pad, bass, kitchen percussion, motif hints every 4 bars
  - lift: marimba arpeggio + dense whisk; swaps: an accent on every beat; final: ringing chord + motif + oven-timer ding
- `mix.py` places SFX from `cues` (role first, then `kind`), ducks the music under them.
- `build.py` mixes, then masters: look-ahead limiter and gain, measured with ffmpeg `ebur128`, repeated until
  `sound.loudness.lufs` (+-0.1) and `truePeak` are met. Output is exactly `durationSeconds` long.

## Roles
| role | sound | gain dB |
|---|---|---|
| ping, riser-chaos, drop, lockup, final-hit, cut, contact, title-out | music (no SFX) | - |
| title-in (only if `strong`) | shimmer | -17 |
| bubble-pop-NN | pop | -15 |
| icon-morph | swap | -11 |
| app-open, macro-N, whip-*, cta-whoosh | whoosh | -14 |
| order-lands | pop | -11 |
| lift, badge | pop | -8 |
| tap-N-* | tap (cue `pan` used) | -8 |
| fly | bag_swish | -10 |
| paid, count-done | payment_ding | -8, -9 |
| notification | order_bell | -8 |
| count | receipt_chatter | -13 |
| bars-riser | rise | -9 |
| skin-N | swap | -10 |
| screen-swap | swap | -12 |

Unknown roles fall back by `kind`: tap -> tap, pop -> pop, whoosh -> whoosh, hit -> hit, chime -> payment_ding,
ping -> ping, riser -> rise, swap -> swap, title -> tick. `cut` gets nothing. Pitched sounds are tuned to the chord playing at the cue time.

## Overrides: `sound.sfx`
Keys are a cue name (`block:cue`) or a role. The cue name wins over the role.

    sfx:
      paid: {sound: order_bell, gain: -6}
      "customer:tap-2-addButton": {mute: true}
      cta-whoosh: {gain: -10, duck: 3, pan: 0.3}

Fields: `mute`, `sound`, `gain` (dB), `duck` (dB the music dips for 150 ms), `pan` (-1..1).
Palette: tap, tick, pop, swap, shimmer, bag_swish, payment_ding, order_bell, receipt_chatter, ping, hit, whoosh, rise.

## Sound design and music as data
Phase 2a. The engine only renders what the data describes: no default sounds, no default song. An agent writes tailor-made
sounds and music from the product's own world (a tram bell, water on a fountain pin, the cierzo wind). Same JSON + seed =
same bytes. Pure numpy (no scipy). Everything is in `audio/synth/`; the CLIs are `sounddesign.py`, `score.py` and `tools/spectrogram.py`.
Not wired into `ad.yaml` yet (phase 2b).

    ~/.cache/adkit/venv/bin/python audio/sounddesign.py SOUND.json --out out.wav      # one sound
    ~/.cache/adkit/venv/bin/python audio/score.py MUSIC.json --out-dir out/            # mix.wav + stems/ + cues.json
    ~/.cache/adkit/venv/bin/python audio/tools/spectrogram.py out.wav                  # PNG to look at + stats line
    ~/.cache/adkit/venv/bin/python audio/demos/render_all.py                           # all demos -> audio/demos/out/
    npm run test:audio

The agent cannot hear, so it looks: render, then read the PNG. Waveform strip on top (sqrt scale), log-frequency spectrogram below.
A bell shows many thin horizontal lines that are not evenly spaced (inharmonic) and fade slowly; a water drop shows one line curving
up; wind is a broad cloud that swells; a rhythm shows vertical lines in the bar's accent pattern. The stats line gives length, peak,
RMS, LUFS (BS.1770, numpy), spectral centroid and the loudest partials.

### Models (`audio/synth/`, each is `(params, seed) -> array`, peak 0.5 at velocity 1; params and ranges are in each module's docstring)
| model | what | presets |
|---|---|---|
| `modal` | struck or rubbed objects: mode ratios, decays, strike position (Cook) | metal_bar, bell, handbell, tram_bell, glass, ceramic_cup, wood_block, membrane, plate |
| `pluck` | Karplus-Strong extended (Jaffe-Smith) + body resonance, optional tremolo | guitar, bandurria, lute, harp, bass |
| `drop` `bubbles` `pour` `splash` | water, van den Doel 2005 (bubble pitch rises) | - |
| `shaker` `gravel` `rain` `claps_crowd` | PhISEM particles | - |
| `wind` `whoosh` `paper` `murmur` | shaped noise with gusts | - |
| `fm` `subtractive` | electric piano, bells, pad, bass, lead with ADSR | e_piano, fm_bell, fm_bass / pad, sub_bass, lead |
| `drums` (and `kick` `snare` `clap` `hat` `castanets` `palmas` `tambourine` `cajon`) | synthesised percussion; `kind` = variant | kick, snare, clap, hat, hat_open, castanets, castanets_roll, palmas, palmas_sorda, tambourine, cajon_bass, cajon_slap, rim |
| `sample` | `{file, license}` wav from the ad folder; license must be CC0, own or public-domain; file bytes are part of the hash | - |
Effects (`synth/fx.py`): gain, pan, lowpass, highpass, eq, saturate, reverb (seeded impulse response), delay (ping-pong), widen, duck, limit.

### SOUND json
`meaning` is required (what object in the product's world this is, and why): the tool refuses to render without it (exit 1).
`at` is seconds, or `at_beats` with `bpm` on the sound. `note` sets the pitch (name or Hz). `gain` in dB, `pan` -1..1.

    {"meaning": "Zaragoza tram bell: the app shows live tram stops, so a struck brass dome announces the tram",
     "seed": 3,
     "layers": [{"model": "modal", "preset": "tram_bell", "note": "E6", "at": 0.0, "gain": -4, "params": {"decay": 2.2}},
                {"model": "modal", "preset": "tram_bell", "note": "E6", "at": 0.28, "gain": -6, "params": {"velocity": 0.85}}],
     "fx": [{"type": "reverb", "rt60": 1.1, "wet": 0.12}]}

A layer may also have `fx` (just that layer), `reverse`, and `repeat: {count, every, gain_step}`.

### MUSIC json
Bars and the beat grid follow the meter. Positions in patterns are in units of the meter's unit note (3/4: 0,1,2 are quarters; 6/8: 0..5 are
eighths). `bpm` counts quarters for x/4; for 6/8, 9/8, 12/8 it counts dotted quarters; override with `meter.bpm_counts` "unit" or "group".
`swing` 0..1 delays the off-beat half of every unit (1 = triplet feel). Pitches: note name `"D4"`, scale degree number (1 = tonic of `key`,
8 = octave up), chord tone `"c1"`..`"c4"` (+/- for an octave), `"chord"`, `"r"`, or a list. Notes are `[beat, pitch, length, velocity]`,
drum hits are `[beat, kind, velocity]`. A track is a pattern name, an inline pattern, or a list of them (cycled to fill the section).
A pattern may carry `params` that override the instrument's (e.g. `tremolo_hz`). Automation: `[bar position, value]` points, linear:
`gain` (dB), `lowpass`, `highpass` (Hz), per instrument or `master`. No `instruments` or `sections` = error. Output `cues.json` has every bar
with start time, chord, and each beat's time and accent (3/4: 1, .55, .55), so cuts and SFX can snap to the real grid.

    {"bpm": 172, "meter": {"beats": 3, "unit": 4}, "key": "D minor", "seed": 11,
     "instruments": {"bandurria": {"model": "pluck", "preset": "bandurria", "octave": 5, "gain": -8, "pan": -0.25},
                     "palmas": {"model": "drums", "gain": -10}},
     "patterns": {"motif": {"bars": 1, "notes": [[0, 5, 0.5, 0.95], [0.5, 6, 0.5, 0.75], [1, 8, 1, 0.85], [2, 7, 1, 0.7]]},
                  "palmas_3": {"bars": 1, "hits": [[0, "palmas", 1.0], [1, "palmas_sorda", 0.55], [2, "palmas_sorda", 0.6]]}},
     "sections": [{"name": "A", "bars": 4, "mood": "bright, spinning", "chords": ["Dm", "Dm", "A7", "Dm"],
                   "tracks": {"bandurria": "motif", "palmas": "palmas_3"},
                   "automation": {"bandurria": {"gain": [[0, -12], [4, 0]]}}}]}

Demos: `audio/demos/*.json` (tram bell, water drop, cierzo, spoon on cup, oven ding, 3/4 jota); outputs go to `audio/demos/out/` (ignored by git).

## Real instruments (sampled)
Pure synthesis of plucked strings and hand percussion sounds like a toy, so music can use recordings of real instruments.
Model `sampler` in a MUSIC instrument (`"model": "sampler", "preset": "<set>"`); code in `synth/sampler.py` (sets, mapping) and `synth/samplelib.py` (lock, cache, decode).

    python3 audio/fetch_samples.py            # once: download the packs in audio/samples.lock.json into ~/.cache/adkit/samples/ and check every sha256
    python3 audio/fetch_samples.py --licenses # source and license of each pack
    python3 audio/demos/render_all.py         # also renders out/jota/mix_samples.wav and out/jota/ad15.wav

A render that needs a pack that is not downloaded stops and prints the fetch command. A file that does not match its sha256 in the lock is refused.
`audio/tools/build_lock.py` regenerates the lock (maintainers). Downloads are untrusted: new empty temp dir, audio files only, nothing executed, ffmpeg only decodes.

| set | recordings | license |
|---|---|---|
| `nylon_guitar` | Meta nylon guitar, 6 strings x 3 layers (finger, pick, hard pick), E2-B5 | CC0 |
| `mandolin` | Philharmonia mandolin A3-E6, `normal` and `tremolo` (stands in for the bandurria) | Philharmonia free-use terms (commercial use ok, no attribution, do not redistribute the samples) |
| `bass` | Karoryfer Meatbass double bass pizzicato C1-Eb3 | CC0 |
| `castanets` | Philharmonia castanets: strike, roll, phrases (one strike, so each hit gets a tiny pitch/level change) | Philharmonia free-use terms |
| `hands` | body_percussion hand claps (`palma`) and finger claps (`palma_sorda`), VCSL group claps (`palmas_group`) and tambourine | CC0 |

Rules: nearest recording, resampled at most +-3 semitones; velocity picks the layer; round robin by seed (never the same take twice in a row);
each recording is cut to its attack and peak-normalised; a note is released at its length (`ring` lets it ring).
Pattern params: `strum_ms` (notes of a chord at one beat start that many ms apart, +-20%), `strum_dir` or a 5th note element `"d"`/`"u"`
(down goes low to high, up goes high to low and softer), `artic` (`"tremolo"` for the mandolin), `ring`, `roll_beats` (length of a roll hit).
New fx `compress` (bus compressor: threshold_db, ratio, attack_ms, release_ms, makeup_db, detect_hz). Demos: `demos/real/jota_samples.json`, `demos/real/ad15.json`
(15 bars of 3/4 at 180 bpm = 15 s: 3 tense bars on A7 with wind, the bell and the resolution on bar 4, the jota with the motif, cadence and a tonic ending).
