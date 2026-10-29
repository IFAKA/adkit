import fs from 'node:fs';
import path from 'node:path';
import {LineCounter, parseDocument} from 'yaml';
import {AdSpec, type Ad} from './schema';

export class SpecError extends Error {
  constructor(public problems: string[]) {
    super(problems.join('\n'));
    this.name = 'SpecError';
  }
}

/** Replace ${VAR} and ${VAR:-default} with environment values, in every string of the document. */
export function interpolateEnv<T>(v: T, env: NodeJS.ProcessEnv = process.env): T {
  if (typeof v === 'string') {
    return v.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g, (_m, name: string, def?: string) => env[name] ?? def ?? '') as unknown as T;
  }
  if (Array.isArray(v)) return v.map((x) => interpolateEnv(x, env)) as unknown as T;
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, interpolateEnv(x, env)])) as T;
  return v;
}

type Origin = {file: string; doc: ReturnType<typeof parseDocument>; lc: LineCounter; prefix: (string | number)[]};

function where(origins: Origin[], p: (string | number)[]): string {
  // longest matching prefix wins (an included file owns its sub-tree)
  let best: Origin | undefined;
  for (const o of origins) if (o.prefix.every((k, i) => p[i] === k) && (!best || o.prefix.length > best.prefix.length)) best = o;
  if (!best) return '';
  const rel = p.slice(best.prefix.length);
  for (let n = rel.length; n >= 0; n--) {
    const node = best.doc.getIn(rel.slice(0, n), true) as {range?: [number, number, number]} | undefined;
    if (node?.range) return `${path.basename(best.file)}:${best.lc.linePos(node.range[0]).line}`;
  }
  return path.basename(best.file);
}

/** Reads ad.yaml (and the files its `capture:` / `sound:` keys may point to), checks it, returns the typed spec. */
export function loadSpec(file: string, env: NodeJS.ProcessEnv = process.env): {spec: Ad; dir: string; file: string} {
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) throw new SpecError([`spec not found: ${abs}`]);
  const dir = path.dirname(abs);
  const origins: Origin[] = [];
  const read = (f: string, prefix: (string | number)[]) => {
    const lc = new LineCounter();
    const doc = parseDocument(fs.readFileSync(f, 'utf8'), {lineCounter: lc});
    const errs = doc.errors.map((e) => `${path.basename(f)}:${e.linePos?.[0].line ?? '?'}: ${e.message.split('\n')[0]}`);
    if (errs.length) throw new SpecError(errs);
    origins.push({file: f, doc, lc, prefix});
    return doc.toJS() as Record<string, unknown>;
  };
  const raw = read(abs, []);
  if (!raw || typeof raw !== 'object') throw new SpecError([`${path.basename(abs)}: the spec must be a YAML mapping`]);
  for (const key of ['capture', 'sound'] as const) {
    if (typeof raw[key] === 'string') {
      const f = path.resolve(dir, raw[key] as string);
      if (!fs.existsSync(f)) throw new SpecError([`${key}: file not found: ${f}`]);
      raw[key] = read(f, [key]);
    }
  }
  const parsed = AdSpec.safeParse(interpolateEnv(raw, env));
  if (!parsed.success) {
    throw new SpecError(
      parsed.error.issues.map((i) => {
        const p = i.path.filter((k): k is string | number => typeof k !== 'symbol');
        const loc = where(origins, p);
        return `${loc ? loc + ' ' : ''}${p.join('.') || '(root)'}: ${i.message}`;
      }),
    );
  }
  return {spec: parsed.data, dir, file: abs};
}
