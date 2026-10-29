import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {PKG_ROOT, readManifest, type Project} from '../project';
import {capture} from './capture';

/** Opens Remotion Studio on the compiled plan (scrub, inspect). Edits to ad.yaml need a new "adkit studio". */
export async function studio(p: Project) {
  const cap = await capture(p, {});
  const manifest = readManifest(p, cap.key);
  const props = path.join(p.adkit, 'props.json');
  fs.writeFileSync(props, JSON.stringify({plan: p.plan, spec: p.spec, manifest, assetBase: ''}));
  const bin = path.join(PKG_ROOT, 'node_modules', '.bin', 'remotion');
  p.rep.line('studio', 'starting Remotion Studio (Ctrl+C to stop)');
  await new Promise<void>((resolve) => {
    const c = spawn(bin, ['studio', path.join(PKG_ROOT, 'src', 'render', 'index.ts'), `--props=${props}`, `--public-dir=${path.join(p.adkit, 'public')}`], {stdio: 'inherit', cwd: PKG_ROOT});
    c.on('close', () => resolve());
  });
}
