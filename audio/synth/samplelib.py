"""Sample packs: a lock file, a cache, and a decoder. Recordings are NOT in git.

audio/samples.lock.json says, per pack: where it comes from, its license, and the sha256 of every file used.
`python3 audio/fetch_samples.py` downloads the packs into  ~/.cache/adkit/samples/<pack key>/  and checks every sha256.
A render that needs a missing pack stops and prints that command. A file whose bytes do not match the lock is refused.

Downloads are untrusted data: they are fetched into a new empty directory, only audio files are kept (zip members with
an audio extension, names checked), nothing is executed, and ffmpeg is only used to decode audio to a wav
(48 kHz mono 24-bit) that the numpy code reads.

Env: ADKIT_SAMPLES_DIR (cache root), ADKIT_SAMPLES_LOCK (lock path).
"""
import hashlib, json, os, shutil, subprocess, tempfile, zipfile, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from .core import SR

HERE = os.path.dirname(os.path.abspath(__file__))
AUDIO_EXT = ('.wav', '.ogg', '.mp3', '.flac')
FETCH_CMD = 'python3 audio/fetch_samples.py'


class SampleError(Exception):
    pass


def cache_root():
    return os.environ.get('ADKIT_SAMPLES_DIR') or os.path.join(os.path.expanduser('~'), '.cache', 'adkit', 'samples')


def lock_path():
    return os.environ.get('ADKIT_SAMPLES_LOCK') or os.path.join(HERE, '..', 'samples.lock.json')


_LOCKS = {}


def load_lock(path=None):
    path = os.path.realpath(path or lock_path())
    if path not in _LOCKS:
        try:
            with open(path) as fh: _LOCKS[path] = json.load(fh)
        except (OSError, json.JSONDecodeError) as e:
            raise SampleError(f'cannot read sample lock {path}: {e}')
    return _LOCKS[path]


def pack_of(name, lock=None):
    lock = lock or load_lock()
    if name not in lock.get('packs', {}): raise SampleError(f'sample pack "{name}" is not in the lock file')
    return lock['packs'][name]


def pack_key(pack):
    """sha256 over what defines the pack: the source and every file's name and hash. Names the cache folder."""
    src = (pack.get('archive') or {}).get('sha256') or pack.get('baseUrl', '')
    blob = json.dumps({'src': src, 'files': pack['files']}, sort_keys=True, separators=(',', ':'))
    return hashlib.sha256(blob.encode()).hexdigest()


def pack_dir(name, lock=None):
    return os.path.join(cache_root(), pack_key(pack_of(name, lock)))


def sha256_bytes(b):
    return hashlib.sha256(b).hexdigest()


def safe_rel(rel):
    p = os.path.normpath(rel)
    if os.path.isabs(p) or p.startswith('..') or '\x00' in rel: raise SampleError(f'unsafe file name in sample data: {rel!r}')
    return p


def read_verified(name, rel, lock=None):
    """Bytes of one pack file, checked against the lock. Raises SampleError if the pack is missing or the file is wrong."""
    pack = pack_of(name, lock)
    if rel not in pack['files']: raise SampleError(f'file "{rel}" is not in pack "{name}" of the lock')
    path = os.path.join(pack_dir(name, lock), 'files', safe_rel(rel))
    if not os.path.isfile(path):
        raise SampleError(f'sample pack "{name}" is not downloaded (missing {rel}). Run: {FETCH_CMD}')
    with open(path, 'rb') as fh: b = fh.read()
    got = sha256_bytes(b)
    if got != pack['files'][rel]:
        raise SampleError(f'sample file {name}/{rel} does not match the lock (sha256 {got[:12]} != {pack["files"][rel][:12]}). '
                          f'Delete {pack_dir(name, lock)} and run: {FETCH_CMD}')
    return b


def decode_bytes(b, ext):
    """audio file bytes -> mono float array at SR, using ffmpeg (decode only)."""
    with tempfile.TemporaryDirectory() as d:
        src = os.path.join(d, 'in' + ext)
        with open(src, 'wb') as fh: fh.write(b)
        cmd = ['ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'error', '-i', src, '-vn', '-map', '0:a:0', '-ac', '1', '-ar', str(SR),
               '-f', 'f32le', '-']
        r = subprocess.run(cmd, capture_output=True)
    if r.returncode != 0: raise SampleError('ffmpeg could not decode a sample: ' + r.stderr.decode('utf8', 'replace')[:200])
    return np.frombuffer(r.stdout, '<f4').astype(float)


_AUDIO = {}


def load_audio(name, rel, lock=None):
    """Decoded mono float array for pack file `rel` (verified, cached in this process and as a wav next to the pack)."""
    key = (name, rel, id(lock) if lock else 0)
    if key in _AUDIO: return _AUDIO[key]
    b = read_verified(name, rel, lock)
    x = decode_bytes(b, os.path.splitext(rel)[1].lower())
    if len(x) < 16: raise SampleError(f'sample {name}/{rel} decodes to nothing')
    _AUDIO[key] = x
    return x


def missing(names=None, lock=None):
    lock = lock or load_lock()
    out = []
    for n in (names or list(lock['packs'])):
        d = os.path.join(pack_dir(n, lock), 'files')
        if not all(os.path.isfile(os.path.join(d, safe_rel(r))) for r in lock['packs'][n]['files']): out.append(n)
    return out


# ---------------------------------------------------------------- download

def _download(url, dest):
    req = urllib.request.Request(url, headers={'User-Agent': 'adkit-fetch-samples'})
    with urllib.request.urlopen(req, timeout=120) as r, open(dest, 'wb') as fh:
        shutil.copyfileobj(r, fh)


def fetch_pack(name, lock=None, local=None, log=print):
    """Download one pack into the cache, verifying every sha256. `local` maps url -> a file already on disk (tests, offline)."""
    lock = lock or load_lock()
    pack = pack_of(name, lock)
    final = pack_dir(name, lock)
    fdir = os.path.join(final, 'files')
    if name not in missing([name], lock):
        log(f'  {name}: ok (cached)'); return
    os.makedirs(cache_root(), exist_ok=True)
    work = tempfile.mkdtemp(prefix='dl-', dir=cache_root())  # a new, empty directory
    try:
        stage = os.path.join(work, 'files'); os.makedirs(stage)
        arc = pack.get('archive')
        if arc:
            zpath = os.path.join(work, 'archive.zip')
            src = (local or {}).get(arc['url'])
            if src: shutil.copyfile(src, zpath)
            else:
                log(f'  {name}: downloading {arc["url"]} ({arc.get("bytes", 0) // 1000000} MB)')
                _download(arc['url'], zpath)
            with open(zpath, 'rb') as fh: got = sha256_bytes(fh.read())
            if got != arc['sha256']: raise SampleError(f'{name}: archive sha256 {got[:12]} does not match the lock {arc["sha256"][:12]}')
            with zipfile.ZipFile(zpath) as z:
                members = {m.filename: m for m in z.infolist() if not m.is_dir()}
                for rel, want in pack['files'].items():
                    member = arc.get('prefix', '') + rel
                    if member not in members: raise SampleError(f'{name}: {member} is not in the archive')
                    if not rel.lower().endswith(AUDIO_EXT): raise SampleError(f'{name}: {rel} is not an audio file')
                    data = z.read(members[member])
                    if sha256_bytes(data) != want: raise SampleError(f'{name}: {rel} does not match the lock')
                    out = os.path.join(stage, safe_rel(rel)); os.makedirs(os.path.dirname(out), exist_ok=True)
                    with open(out, 'wb') as fh: fh.write(data)
        else:
            base = pack['baseUrl']

            def one(rel):
                if not rel.lower().endswith(AUDIO_EXT): raise SampleError(f'{name}: {rel} is not an audio file')
                out = os.path.join(stage, safe_rel(rel)); os.makedirs(os.path.dirname(out), exist_ok=True)
                url = base + urllib.parse.quote(rel)
                src = (local or {}).get(url)
                if src: shutil.copyfile(src, out)
                else: _download(url, out)
                with open(out, 'rb') as fh: got = sha256_bytes(fh.read())
                if got != pack['files'][rel]: raise SampleError(f'{name}: {rel} sha256 {got[:12]} does not match the lock {pack["files"][rel][:12]}')
            log(f'  {name}: downloading {len(pack["files"])} files from {base}')
            with ThreadPoolExecutor(4) as ex: list(ex.map(one, list(pack['files'])))
        os.makedirs(final, exist_ok=True)
        if os.path.isdir(fdir): shutil.rmtree(fdir)
        os.replace(stage, fdir)
        log(f'  {name}: ok')
    finally:
        shutil.rmtree(work, ignore_errors=True)


def fetch(names=None, lock=None, local=None, log=print):
    lock = lock or load_lock()
    for n in (names or list(lock['packs'])): fetch_pack(n, lock, local, log)
