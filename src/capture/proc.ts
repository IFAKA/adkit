import {spawn, spawnSync, type ChildProcess} from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function freePort(): Promise<number> {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.once('error', rej);
    s.listen(0, '127.0.0.1', () => { const p = (s.address() as net.AddressInfo).port; s.close(() => res(p)); });
  });
}

const tail = (file: string, n = 25) => { try { return fs.readFileSync(file, 'utf8').split('\n').slice(-n).join('\n'); } catch { return ''; } };

/** Runs a shell command and waits for it. Output goes to the log file; a non-zero exit throws with the last lines. */
export function runShell(cmd: string, o: {cwd: string; env: NodeJS.ProcessEnv; logFile: string}): Promise<void> {
  return new Promise((res, rej) => {
    const fd = fs.openSync(o.logFile, 'a');
    fs.writeSync(fd, `\n$ ${cmd}   (cwd ${o.cwd})\n`);
    const child = spawn('sh', ['-c', cmd], {cwd: o.cwd, env: o.env, stdio: ['ignore', fd, fd]});
    child.once('error', (e) => { fs.closeSync(fd); rej(e); });
    child.once('exit', (code, sig) => {
      fs.closeSync(fd);
      if (code === 0) res();
      else rej(new Error(`command failed (${code ?? sig}): ${cmd}\n${tail(o.logFile)}`));
    });
  });
}

export type Server = {child: ChildProcess; pid: number; port: number; base: string; stop: () => Promise<void>};
const live = new Set<number>();
process.on('exit', () => { for (const pid of live) { try { process.kill(-pid, 'SIGKILL'); } catch { /* gone */ } } });

/** Starts the app server in its own process group and waits until `readyPath` answers. */
export async function startServer(cmd: string, o: {cwd: string; env: NodeJS.ProcessEnv; logFile: string; readyPath: string; timeoutSeconds: number}): Promise<Server> {
  const port = await freePort();
  const fd = fs.openSync(o.logFile, 'w');
  const child = spawn('sh', ['-c', cmd.replaceAll('{port}', String(port))], {cwd: o.cwd, env: {...o.env, PORT: String(port)}, stdio: ['ignore', fd, fd], detached: true});
  fs.closeSync(fd);
  const pid = child.pid!;
  live.add(pid);
  let exited = false;
  child.once('exit', () => { exited = true; });
  const stop = async () => {
    if (!live.has(pid)) return;
    live.delete(pid);
    try { process.kill(-pid, 'SIGTERM'); } catch { /* gone */ }
    const t0 = Date.now();
    while (!exited && Date.now() - t0 < 5000) await sleep(100);
    // the shell may be gone while a child still holds the group: always send KILL to the group
    try { process.kill(-pid, 'SIGKILL'); } catch { /* gone */ }
  };
  const base = `http://localhost:${port}`;
  const t0 = Date.now();
  try {
    while (Date.now() - t0 < o.timeoutSeconds * 1000) {
      if (exited) throw new Error(`server exited early: ${cmd}\n${tail(o.logFile)}`);
      try { if ((await fetch(base + o.readyPath)).ok) return {child, pid, port, base, stop}; } catch { /* not yet */ }
      await sleep(400);
    }
    throw new Error(`server did not answer ${base}${o.readyPath} within ${o.timeoutSeconds}s\n${tail(o.logFile)}`);
  } catch (e) {
    await stop();
    throw e;
  }
}

/** Keeps a persistent copy of the app under workDir (rsync; node_modules and .next are kept between runs). */
export function syncWorkCopy(srcDir: string, workDir: string): void {
  fs.mkdirSync(workDir, {recursive: true});
  const ex = ['node_modules', '/.next', '/.git', '/video', '/.adkit'].flatMap((e) => ['--exclude', e]);
  const r = spawnSync('rsync', ['-a', '--delete', ...ex, srcDir.replace(/\/?$/, '/'), workDir.replace(/\/?$/, '/')], {encoding: 'utf8'});
  if (r.status !== 0) throw new Error(`rsync failed: ${r.stderr}`);
  const srcNm = path.join(srcDir, 'node_modules');
  const dstNm = path.join(workDir, 'node_modules');
  if (fs.existsSync(srcNm) && !fs.existsSync(dstNm)) {
    // APFS clone is instant; fall back to a normal copy
    if (spawnSync('cp', ['-cR', srcNm, dstNm]).status !== 0) { fs.rmSync(dstNm, {recursive: true, force: true}); spawnSync('cp', ['-R', srcNm, dstNm]); }
  }
}
