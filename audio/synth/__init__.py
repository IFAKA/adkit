"""adkit synth: deterministic physical-model sound synthesis, numpy only, 48 kHz.

Every model is a function (params dict, seed) -> np.ndarray (mono float, peak 0.5 at velocity 1).
render_model(model, params, seed, preset=None, base_dir=None) is the single entry point.
See each module's docstring for the params and their ranges.
"""
from . import modal, pluck, liquid, noise, tonal, drums, sample, fx, sampler, samplelib
from .core import SR, rng, to_freq, note_to_midi, mtof, db, pan_stereo, as_stereo

MODELS = {'modal': modal.render, 'pluck': pluck.render, 'fm': tonal.fm, 'subtractive': tonal.subtractive}
MODELS.update(liquid.MODELS); MODELS.update(noise.MODELS); MODELS.update(drums.MODELS)
PRESETS = {'modal': sorted(modal.PRESETS), 'pluck': sorted(pluck.PRESETS), 'fm': sorted(tonal.FM_PRESETS),
           'subtractive': sorted(tonal.SUB_PRESETS), 'drums': sorted(drums.VARIANTS)}
DOCS = {'modal': modal, 'pluck': pluck, 'liquid': liquid, 'noise': noise, 'tonal': tonal, 'drums': drums, 'sample': sample, 'sampler': sampler, 'fx': fx}


def render_model(model, params=None, seed=0, preset=None, base_dir=None):
    p = dict(params or {})
    if preset: p['preset'] = preset
    if model == 'sample': return sample.render(p, seed, base_dir)
    if model == 'sampler': return _sampler_hit(p, seed)
    if model not in MODELS:
        raise ValueError(f"unknown model '{model}' (models: {', '.join(sorted(MODELS) + ['sample'])})")
    if preset and model in PRESETS and preset not in PRESETS[model]:
        raise ValueError(f"model '{model}' has no preset '{preset}' (presets: {', '.join(PRESETS[model])})")
    return MODELS[model](p, seed)


def _sampler_hit(p, seed):
    """One recorded hit or note of a sampler set, as a sound layer. params: set, hit (e.g. "strike") or note (midi) [+ artic], vel."""
    from .sampler import Sampler
    name = p.get('set')
    if not name: raise ValueError('sampler layer needs params.set (e.g. "castanets", "hands")')
    smp = Sampler(name, seed=seed)
    vel = float(p.get('vel', 0.8))
    if p.get('hit'): return smp.hit(str(p['hit']), vel)
    if p.get('note') is not None: return smp.note(int(p['note']), vel, p.get('dur'), p.get('artic'))
    raise ValueError('sampler layer needs params.hit (a named hit, e.g. "strike" or "palma") or params.note (midi)')
