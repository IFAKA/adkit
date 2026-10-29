import { loadSpec } from '../src/spec/load.ts';
import { compile } from '../src/engine/compile.ts';
const r = await loadSpec(process.argv[2], process.env);
const p = compile(r.spec);
console.log(p.total, p.cues.map(c=>c.frame+':'+c.name).join(' '));
