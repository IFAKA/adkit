#!/usr/bin/env node
// Runs the TypeScript CLI through tsx so the package needs no build step.
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const tsx = join(dirname(require.resolve('tsx/package.json')), 'dist', 'cli.mjs');
const r = spawnSync(process.execPath, [tsx, join(root, 'src', 'cli', 'main.ts'), ...process.argv.slice(2)], {stdio: 'inherit'});
process.exit(r.status ?? 1);
