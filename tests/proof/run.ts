// usage: npx tsx tests/proof/run.ts <from> <to> <outDir> [bundleDir]
import fs from 'node:fs';
import {bundleProject} from '../../src/render/bundle';
import {renderFrames} from '../../src/render/render';
import {originalProps} from './original';

const [from, to, out, bdir = '/tmp/adkit-orig/bundle'] = process.argv.slice(2);
const {pub, props} = originalProps();
const t0 = Date.now();
if (!fs.existsSync(`${bdir}/index.html`) || process.env.REBUNDLE) {
  fs.rmSync(bdir, {recursive: true, force: true});
  await bundleProject({entry: new URL('../../src/render/index.ts', import.meta.url).pathname, publicDir: pub, outDir: bdir});
  console.log('bundle', (Date.now() - t0) / 1000);
}
const t1 = Date.now();
await renderFrames({serveUrl: bdir, inputProps: props as any, from: +from, to: +to, outDir: out, onProgress: (d, t) => d % 50 === 0 && console.log(d, '/', t)});
console.log('render s', (Date.now() - t1) / 1000);
