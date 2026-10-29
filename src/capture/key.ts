import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import type {Ad} from '../spec/schema';

/** Bump when the capture code changes what it produces, so old results are not reused. */
export const ENGINE_CAPTURE_VERSION = 2;

export const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'video', '.adkit', 'out']);
const MAX_FILE = 64 * 1024 * 1024;

export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().filter((k) => (v as Record<string, unknown>)[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonicalJson((v as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

export function resolveAppDir(spec: Ad, specDir: string): string | undefined {
  const d = spec.capture.app.dir;
  return d ? path.resolve(specDir, d) : undefined;
}

/** Feeds a file or folder (recursively, in sorted order) into the hash. */
function hashPath(h: ReturnType<typeof createHash>, root: string, rel: string, opts: {skipTopYaml?: boolean} = {}): void {
  const abs = path.join(root, rel);
  let st: fs.Stats;
  try { st = fs.statSync(abs); } catch { h.update(`missing:${rel}\0`); return; }
  if (st.isDirectory()) {
    for (const name of fs.readdirSync(abs).sort()) {
      if (SKIP_DIRS.has(name)) continue;
      if (opts.skipTopYaml && rel === '' && /\.ya?ml$/.test(name)) continue;
      hashPath(h, root, path.join(rel, name), opts);
    }
  } else if (st.isFile()) {
    h.update(`file:${rel}:${st.size}\0`);
    if (st.size <= MAX_FILE) h.update(fs.readFileSync(abs));
  }
}

const git = (dir: string, args: string[]): string => execFileSync('git', ['--no-optional-locks', '-C', dir, ...args], {encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore']});

/** A fingerprint of the app's source: git HEAD + uncommitted changes + untracked files, or a directory hash when it is not a repo. */
function appFingerprint(dir: string): string {
  const h = createHash('sha256');
  let isRepo = false;
  try { isRepo = git(dir, ['rev-parse', '--is-inside-work-tree']).trim() === 'true'; } catch { /* not a repo */ }
  if (isRepo) {
    const excl = [...SKIP_DIRS].map((d) => `:(exclude,glob)**/${d}/**`).concat([...SKIP_DIRS].map((d) => `:(exclude)${d}`));
    // Committed content of the app folder only (blob ids of its files), not the repo HEAD:
    // a commit elsewhere in the same repo (docs, this very ad) must not invalidate the captures.
    const tracked = git(dir, ['ls-tree', '-r', '-z', 'HEAD', '--', '.']).split('\0').filter(Boolean)
      .filter((l) => !l.slice(l.indexOf('\t') + 1).split('/').some((p) => SKIP_DIRS.has(p)));
    h.update(`tree:${tracked.join('\n')}\0`);
    h.update(git(dir, ['diff', 'HEAD', '--', '.', ...excl]));
    const untracked = git(dir, ['ls-files', '--others', '--exclude-standard', '-z', '--', '.']).split('\0').filter(Boolean)
      .filter((f) => !f.split('/').some((p) => SKIP_DIRS.has(p))).sort();
    const top = git(dir, ['rev-parse', '--show-toplevel']).trim();
    const prefix = path.relative(top, dir);
    for (const f of untracked) hashPath(h, dir, f);
    h.update(`prefix:${prefix}\0`);
  } else {
    hashPath(h, dir, '');
  }
  return h.digest('hex');
}

function evaluateFiles(spec: Ad): string[] {
  const out = new Set<string>();
  for (const set of Object.values(spec.capture.sets)) for (const s of set.screens) for (const st of s.steps) {
    if (st.evaluate && typeof st.evaluate === 'object' && st.evaluate.file) out.add(st.evaluate.file);
  }
  return [...out].sort();
}

export function playwrightVersion(): string {
  try { return createRequire(import.meta.url)('playwright/package.json').version as string; } catch { return 'unknown'; }
}

/** Hex hash of everything that changes what the capture produces. */
export function captureKey(spec: Ad, specDir: string): string {
  const h = createHash('sha256');
  const cap = spec.capture;
  const dir = resolveAppDir(spec, specDir);
  if (dir) h.update(`app:${appFingerprint(dir)}\0`);
  else if (!cap.app.url) { const t = createHash('sha256'); hashPath(t, specDir, '', {skipTopYaml: true}); h.update(`specdir:${t.digest('hex')}\0`); }
  h.update(`capture:${canonicalJson(cap)}\0`);
  for (const rel of [...cap.inputs].sort()) { h.update(`input:${rel}\0`); hashPath(h, specDir, rel); }
  for (const rel of evaluateFiles(spec)) { h.update(`eval:${rel}\0`); hashPath(h, specDir, rel); }
  h.update(`playwright:${playwrightVersion()}\0engine:${ENGINE_CAPTURE_VERSION}`);
  return h.digest('hex');
}
