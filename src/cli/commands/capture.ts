import path from 'node:path';
import {runCapture} from '../../capture';
import {fmt} from '../util';
import type {Project} from '../project';

export async function capture(p: Project, flags: {force?: boolean; set?: string; screen?: string}) {
  const lines: string[] = [];
  const res = await runCapture({
    spec: p.spec, specDir: p.dir, projectDir: p.dir, force: flags.force,
    only: {set: flags.set, screen: flags.screen},
    log: (l) => { lines.push(l); p.rep.detail('capture', l); },
  });
  p.rep.line('capture', `${res.cached ? 'cached' : 'shot'} key=${res.key.slice(0, 10)} ${path.relative(process.cwd(), res.manifestPath)} (${fmt(res.seconds)})`);
  return res;
}
