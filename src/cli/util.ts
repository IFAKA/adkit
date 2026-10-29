import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const sha = (...parts: (string | Buffer)[]): string => {
  const h = createHash('sha256');
  for (const p of parts) { h.update(p); h.update('\0'); }
  return h.digest('hex');
};

/** JSON with sorted keys, so the same value always gives the same text. */
export function canon(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v as object).sort().filter((k) => (v as Record<string, unknown>)[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

export class CliError extends Error {}

export const fmt = (s: number): string => (s < 10 ? `${s.toFixed(1)}s` : `${Math.round(s)}s`);

/** One line per step on screen; the details go to .adkit/logs/<name>.log. */
export class Reporter {
  constructor(readonly logsDir: string) { fs.mkdirSync(logsDir, {recursive: true}); }
  logFile(name: string): string { return path.join(this.logsDir, `${name}.log`); }
  line(step: string, msg: string): void { console.log(`adkit ${step.padEnd(8)} ${msg}`); }
  detail(name: string, msg: string): void { fs.appendFileSync(this.logFile(name), `[${new Date().toISOString()}] ${msg}\n`); }
}

/** Runs a program, appends its output to a log file, rejects on a non-zero exit. */
export function run(cmd: string, args: string[], opts: {logFile?: string; cwd?: string; nice?: boolean; capture?: boolean} = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const [c, a] = opts.nice ? ['nice', ['-n', '15', cmd, ...args]] : [cmd, args];
    const p = spawn(c, a, {cwd: opts.cwd, stdio: ['ignore', 'pipe', 'pipe']});
    let out = '';
    const log = opts.logFile ? fs.createWriteStream(opts.logFile, {flags: 'a'}) : undefined;
    log?.write(`$ ${cmd} ${args.join(' ')}\n`);
    const take = (b: Buffer) => { log?.write(b); if (opts.capture) out += b.toString(); };
    p.stdout.on('data', take);
    p.stderr.on('data', take);
    p.on('error', reject);
    p.on('close', (code) => {
      log?.end();
      if (code === 0) resolve(out);
      else reject(new CliError(`${cmd} exited with code ${code}${opts.logFile ? ` (see ${opts.logFile})` : ''}${opts.capture ? `\n${out.slice(-600)}` : ''}`));
    });
  });
}

export function listFiles(dir: string, ext?: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(p, ext));
    else if (!ext || p.endsWith(ext)) out.push(p);
  }
  return out.sort();
}
