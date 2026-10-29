import fs from 'node:fs';
import path from 'node:path';
import type {Ad} from '../spec/schema';
import {captureKey, resolveAppDir} from './key';
import {mergeManifest, type Manifest} from './manifest';
import {runShell, startServer, syncWorkCopy, type Server} from './proc';
import {shootSet} from './shoot';

export {captureKey} from './key';
export {mergeManifest} from './manifest';
export type {Manifest} from './manifest';

export type CaptureOptions = {
  spec: Ad;
  specDir: string;
  projectDir: string;
  force?: boolean;
  only?: {set?: string; screen?: string};
  log: (line: string) => void;
};
export type CaptureResult = {key: string; dir: string; manifestPath: string; cached: boolean; seconds: number};

type CaptureSpec = Ad['capture'];
type SetSpec = CaptureSpec['sets'][string];

/** A set with the env and setup of the sets it extends merged in (parents first). */
export function resolveSet(sets: CaptureSpec['sets'], name: string, seen: string[] = []): {env: Record<string, string>; setup: string[]; set: SetSpec} {
  const set = sets[name];
  if (!set) throw new Error(`capture set "${name}" does not exist`);
  if (seen.includes(name)) throw new Error(`capture sets extend each other in a loop: ${[...seen, name].join(' -> ')}`);
  if (!set.extends) return {env: {...set.env}, setup: [...set.setup], set};
  const parent = resolveSet(sets, set.extends, [...seen, name]);
  return {env: {...parent.env, ...set.env}, setup: [...parent.setup, ...set.setup], set};
}

function publish(from: string, projectDir: string): void {
  const dest = path.join(projectDir, '.adkit', 'public', 'captures');
  fs.rmSync(dest, {recursive: true, force: true});
  fs.mkdirSync(path.dirname(dest), {recursive: true});
  fs.cpSync(from, dest, {recursive: true});
}

function newestResult(capturesDir: string, preferKey: string): string | undefined {
  if (!fs.existsSync(capturesDir)) return undefined;
  const found = fs.readdirSync(capturesDir)
    .filter((n) => !n.includes('.tmp-') && fs.existsSync(path.join(capturesDir, n, 'manifest.json')))
    .map((n) => ({n, t: fs.statSync(path.join(capturesDir, n, 'manifest.json')).mtimeMs}))
    .sort((a, b) => b.t - a.t);
  const pick = found.find((f) => f.n === preferKey) ?? found[0];
  return pick ? path.join(capturesDir, pick.n) : undefined;
}

export async function runCapture(opts: CaptureOptions): Promise<CaptureResult> {
  const {spec, specDir, projectDir, log} = opts;
  const t0 = Date.now();
  const secs = () => (Date.now() - t0) / 1000;
  const adkit = path.join(projectDir, '.adkit');
  const logsDir = path.join(adkit, 'logs');
  const capturesDir = path.join(adkit, 'captures');
  fs.mkdirSync(logsDir, {recursive: true});
  const logFile = path.join(logsDir, 'capture.log');
  const detail = (line: string) => fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${line}\n`);

  const key = captureKey(spec, specDir);
  const dir = path.join(capturesDir, key);
  const manifestPath = path.join(dir, 'manifest.json');
  const only = opts.only && (opts.only.set || opts.only.screen) ? opts.only : undefined;

  if (!opts.force && !only && fs.existsSync(manifestPath)) {
    publish(dir, projectDir);
    log(`capture cached key=${key.slice(0, 12)} (${secs().toFixed(1)}s)`);
    return {key, dir, manifestPath, cached: true, seconds: secs()};
  }

  const cap = spec.capture;
  const wantSets = Object.keys(cap.sets).filter((s) => !only?.set || only.set === s);
  if (!wantSets.length) throw new Error(`capture set "${only?.set}" does not exist (sets: ${Object.keys(cap.sets).join(', ')})`);
  if (only?.screen && !wantSets.some((s) => cap.sets[s].screens.some((sc) => sc.name === only.screen))) {
    throw new Error(`no screen "${only.screen}" in ${only.set ? `set ${only.set}` : 'any set'}`);
  }

  const tmp = `${dir}.tmp-${process.pid}`;
  fs.rmSync(tmp, {recursive: true, force: true});
  let base: Manifest | undefined;
  if (only) {
    const src = newestResult(capturesDir, key);
    if (src) {
      fs.cpSync(src, tmp, {recursive: true});
      base = JSON.parse(fs.readFileSync(path.join(tmp, 'manifest.json'), 'utf8')) as Manifest;
    } else {
      log('capture: no earlier result to update, shooting only what was asked');
      fs.mkdirSync(tmp, {recursive: true});
    }
  } else {
    fs.mkdirSync(tmp, {recursive: true});
  }
  detail(`=== capture key=${key} force=${!!opts.force} only=${JSON.stringify(only ?? null)}`);

  const appDir = resolveAppDir(spec, specDir);
  const app = cap.app;
  const patch: Manifest = {scale: cap.viewport.scale, viewport: {w: cap.viewport.width, h: cap.viewport.height}, sets: {}};

  try {
    for (const name of wantSets) {
      const ts = Date.now();
      const {env: setEnv, setup, set} = resolveSet(cap.sets, name);
      let cwd = specDir;
      if (appDir) {
        if (app.isolate === 'copy') {
          cwd = path.join(adkit, 'work', 'app');
          syncWorkCopy(appDir, cwd);
          detail(`${name}: work copy synced ${appDir} -> ${cwd}`);
        } else cwd = appDir;
      }
      const env: NodeJS.ProcessEnv = {...process.env, ...app.env, ...setEnv, ADKIT_SPEC_DIR: specDir, ADKIT_PROJECT_DIR: projectDir};
      const sh = (cmd: string) => { detail(`${name}: $ ${cmd}`); return runShell(cmd, {cwd, env, logFile}); };
      let server: Server | undefined;
      try {
        let baseUrl: string;
        if (app.url && !app.start) {
          baseUrl = app.url.replace(/\/$/, '');
        } else {
          for (const c of [...app.setup, ...setup]) await sh(c);
          for (const c of app.build) await sh(c);
          if (!app.start) throw new Error('capture.app needs `url`, or `start` (with an optional `dir`)');
          server = await startServer(app.start, {cwd, env, logFile: path.join(logsDir, `capture-${name}-server.log`), readyPath: app.ready.path, timeoutSeconds: app.ready.timeoutSeconds});
          baseUrl = server.base;
          detail(`${name}: server up at ${baseUrl} (pid ${server.pid})`);
        }
        const entry = await shootSet({
          cap, specDir, setName: name, screens: set.screens, theme: set.theme, accent: spec.brand.colors.accent,
          base: baseUrl, outDir: tmp, logsDir, onlyScreen: only?.screen, log, detail,
        });
        patch.sets[name] = entry;
      } finally {
        if (server) await server.stop().catch((e) => detail(`${name}: stop failed: ${e}`));
        for (const c of app.teardown) await sh(c).catch((e) => detail(`${name}: teardown failed: ${e}`));
        detail(`${name}: done in ${((Date.now() - ts) / 1000).toFixed(0)}s`);
      }
    }
    const merged = mergeManifest(base, patch);
    fs.writeFileSync(path.join(tmp, 'manifest.json'), JSON.stringify(merged, null, 2));
    fs.rmSync(dir, {recursive: true, force: true});
    fs.renameSync(tmp, dir);
  } catch (e) {
    fs.rmSync(tmp, {recursive: true, force: true});
    detail(`FAILED: ${(e as Error).stack ?? e}`);
    throw e;
  }
  publish(dir, projectDir);
  log(`capture done key=${key.slice(0, 12)} sets=${wantSets.join(',')} total ${secs().toFixed(0)}s (log: ${logFile})`);
  return {key, dir, manifestPath, cached: false, seconds: secs()};
}
