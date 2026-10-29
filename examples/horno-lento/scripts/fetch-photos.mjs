// Downloads the demo shop photos from Unsplash (they are not redistributed with this repo).
//   node scripts/fetch-photos.mjs
// Reads the table in demo-shop/SOURCES.md; skips files that already exist.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const shop = path.resolve(here, '../demo-shop');
const rows = [...fs.readFileSync(path.join(shop, 'SOURCES.md'), 'utf8').matchAll(/^\|\s*([\w./-]+\.webp)\s*\|[^|]*\|\s*([\w-]+)\s*\|/gm)];
if (!rows.length) throw new Error('no photo rows found in SOURCES.md');
let got = 0;
for (const [, file, id] of rows) {
  const dest = path.join(shop, 'assets', file);
  if (fs.existsSync(dest)) continue;
  fs.mkdirSync(path.dirname(dest), {recursive: true});
  const res = await fetch(`https://images.unsplash.com/photo-${id}?w=1200&q=80&fm=webp`);
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  console.log(`downloaded ${file}`);
  got++;
}
console.log(got ? `${got} photo(s) downloaded` : 'all photos present');
