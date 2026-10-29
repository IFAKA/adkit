# audio/

Synthesises the ad's soundtrack (music + SFX) from a plan JSON. Pure numpy math: no samples, no sound packs.
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
