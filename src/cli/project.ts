import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {compile} from '../engine/compile';
import type {Plan} from '../engine/plan';
import type {Manifest} from '../capture/manifest';
import {loadSpec} from '../spec/load';
import type {Ad} from '../spec/schema';
import {listFiles, Reporter, sha, CliError} from './util';

export const PKG_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export type Project = {
  spec: Ad;
  plan: Plan;
  file: string;
  dir: string; // folder of ad.yaml: the project folder
  adkit: string; // dir/.adkit
  rep: Reporter;
};

export function openProject(arg: string | undefined): Project {
  let file = path.resolve(arg ?? 'ad.yaml');
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'ad.yaml');
  if (!fs.existsSync(file)) throw new CliError(`no spec at ${file}. Run "adkit init <dir>" or pass the path to ad.yaml.`);
  const {spec, dir} = loadSpec(file);
  const plan = compile(spec);
  const adkit = path.join(dir, '.adkit');
  return {spec, plan, file, dir, adkit, rep: new Reporter(path.join(adkit, 'logs'))};
}

/** Version of the engine: a hash of every source file that changes pixels or cues. */
export function engineVersion(): string {
  const files = ['src/render', 'src/engine', 'src/spec'].flatMap((d) => listFiles(path.join(PKG_ROOT, d), '.ts').concat(listFiles(path.join(PKG_ROOT, d), '.tsx')));
  return sha(...files.map((f) => `${path.relative(PKG_ROOT, f)}:${fs.readFileSync(f, 'utf8')}`)).slice(0, 16);
}

export function readManifest(p: Project, key: string): Manifest {
  const f = path.join(p.adkit, 'captures', key, 'manifest.json');
  if (!fs.existsSync(f)) throw new CliError('no captures yet: run "adkit capture" first');
  return JSON.parse(fs.readFileSync(f, 'utf8')) as Manifest;
}
