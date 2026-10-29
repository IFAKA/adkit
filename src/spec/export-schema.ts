import fs from 'node:fs';
import {z} from 'zod';
import {AdSpec} from './schema';

const out = new URL('../../schema/ad.schema.json', import.meta.url);
fs.mkdirSync(new URL('.', out), {recursive: true});
const json = z.toJSONSchema(AdSpec, {io: 'input', unrepresentable: 'any'});
fs.writeFileSync(out, JSON.stringify({$schema: 'http://json-schema.org/draft-07/schema#', title: 'adkit ad.yaml', ...json}, null, 2) + '\n');
console.log('wrote schema/ad.schema.json');
