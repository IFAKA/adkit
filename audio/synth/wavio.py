"""WAV output (16-bit PCM stereo, 48 kHz). Plain rounding, no dither, so the bytes are deterministic."""
import wave
import numpy as np
from .core import SR


def write_wav(path, x):
    x = np.asarray(x, dtype=float)
    if x.ndim == 1: x = np.stack([x, x], 1)
    pcm = np.clip(np.round(x * 32767.0), -32768, 32767).astype('<i2')
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(pcm.tobytes())
