import {homedir} from 'node:os';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const AUDIO_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../audio');

/** Cache key: changes when the plan JSON or any audio/*.py changes. */
export function audioKey(planJson: string): string {
  const h = createHash('sha256');
  h.update(planJson);
  for (const f of readdirSync(AUDIO_DIR).filter((n) => n.endsWith('.py')).sort()) {
    h.update('\0' + f + '\0');
    h.update(readFileSync(join(AUDIO_DIR, f)));
  }
  return h.digest('hex');
}

function run(cmd: string, args: string[], logStream: ReturnType<typeof createWriteStream>, cwd?: string): Promise<number> {
  return new Promise((res, rej) => {
    logStream.write(`$ ${cmd} ${args.join(' ')}\n`);
    const p = spawn(cmd, args, {cwd, stdio: ['ignore', 'pipe', 'pipe']});
    p.stdout.on('data', (d) => logStream.write(d));
    p.stderr.on('data', (d) => logStream.write(d));
    p.on('error', rej);
    p.on('close', (code) => res(code ?? 1));
  });
}

/** Synthesise the ad's audio from a plan JSON into a WAV. Creates one shared venv (numpy) on first use: $ADKIT_CACHE or ~/.cache/adkit. */
export async function buildAudio(o: {planFile: string; outWav: string; projectDir: string; log: string}): Promise<void> {
  mkdirSync(dirname(resolve(o.log)), {recursive: true});
  mkdirSync(dirname(resolve(o.outWav)), {recursive: true});
  const logStream = createWriteStream(o.log, {flags: 'w'});
  const done = () => new Promise<void>((r) => logStream.end(r));
  const fail = async (msg: string): Promise<never> => {
    await done();
    throw new Error(`${msg} (see log: ${o.log})`);
  };
  const cache = process.env.ADKIT_CACHE ?? join(homedir(), '.cache', 'adkit');
  const venv = join(cache, 'venv');
  const py = join(venv, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  try {
    if (!existsSync(py)) {
      mkdirSync(cache, {recursive: true});
      if ((await run('python3', ['-m', 'venv', venv], logStream)) !== 0) return await fail('audio: could not create the python venv (is python3 installed?)');
    }
    const hasNumpy = (await run(py, ['-c', 'import numpy'], logStream)) === 0;
    if (!hasNumpy && (await run(py, ['-m', 'pip', 'install', '--disable-pip-version-check', 'numpy'], logStream)) !== 0)
      return await fail('audio: pip install numpy failed');
    const code = await run(py, [join(AUDIO_DIR, 'build.py'), '--plan', resolve(o.planFile), '--out', resolve(o.outWav), '--workdir', dirname(resolve(o.log))], logStream);
    if (code !== 0) return await fail(`audio: synth failed with exit code ${code}`);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('audio:')) throw e;
    return await fail(`audio: ${(e as Error).message}`);
  }
  await done();
}
