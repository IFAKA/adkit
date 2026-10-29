import {writeFileSync} from 'node:fs';
import {loadSpec} from '../src/spec/load.ts';
import {compile} from '../src/engine/compile.ts';
import {audioPlan} from '../src/engine/audio-plan.ts';
const r = await loadSpec(process.argv[2], process.env);
writeFileSync(process.argv[3], JSON.stringify(audioPlan(r.spec, compile(r.spec)), null, 2));
