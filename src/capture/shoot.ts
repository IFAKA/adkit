import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {chromium, type BrowserContext, type Locator, type Page} from 'playwright';
import type {z} from 'zod';
import type {Capture as CaptureSchema} from '../spec/schema';
import type {Box, ScreenEntry, SetEntry} from './manifest';

/** Phone safe-area insets: env(safe-area-inset-top/bottom) read these values in every page of this tab, also after navigation. */
export async function applySafeArea(context: BrowserContext, page: Page, a: {top: number; bottom: number}) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setSafeAreaInsetsOverride' as never, {insets: {top: a.top, bottom: a.bottom, left: 0, right: 0}} as never);
}

type Capture = z.infer<typeof CaptureSchema>;
type Screen = Capture['sets'][string]['screens'][number];
type Step = Screen['steps'][number];

const r1 = (n: number) => Math.round(n * 10) / 10;
const hex2 = (n: number) => Math.round(n).toString(16).padStart(2, '0');
/** "rgb(12, 34, 56)" -> "#0c2238" */
export function cssToHex(c: string): string {
  const m = c.match(/rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/);
  return m ? `#${hex2(+m[1])}${hex2(+m[2])}${hex2(+m[3])}` : '#ffffff';
}

export type ShootOpts = {
  cap: Capture;
  specDir: string;
  setName: string;
  screens: Screen[];
  theme?: {bg: string; fg: string; accent: string};
  accent: string;
  base: string;
  outDir: string;
  logsDir: string;
  /** If set, only this screen is photographed (the others still run their steps). */
  onlyScreen?: string;
  log: (line: string) => void;
  detail: (line: string) => void;
};

export async function shootSet(o: ShootOpts): Promise<SetEntry> {
  const {cap, setName} = o;
  const {width: W, height: H, scale: SCALE} = cap.viewport;
  const setDir = path.join(o.outDir, setName);
  fs.mkdirSync(setDir, {recursive: true});
  const entry: SetEntry = {theme: o.theme ?? {bg: '#ffffff', fg: '#000000', accent: o.accent}, screens: {}};
  let themeDone = !!o.theme;
  const vars: Record<string, string> = {};
  let clockOn = false;
  /** a take leaves the page clock stopped, so the next screen continues from exactly its last frame */
  let clockPaused = false;
  /** requests no capture route answered, since the screen began */
  const unmocked: string[] = [];
  let takeActions: {at: number; motion: number}[] | undefined;
  /** The recording of the screen being shot: files in capture order (a held still repeats its file) and boxes measured before actions. */
  let seq: {name: string; dir: string; files: string[]; boxes: Record<string, Box>; n: number} | undefined;
  const sub = (s: string) => s.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (m, k: string) => (k in vars ? vars[k] : m));

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: {width: W, height: H}, deviceScaleFactor: SCALE, isMobile: true, hasTouch: true,
      serviceWorkers: 'block',
      locale: cap.locale, timezoneId: cap.timezone, reducedMotion: 'no-preference',
      ...(cap.geolocation ? {geolocation: cap.geolocation, permissions: ['geolocation']} : {}),
    });
    if (cap.clock) {
      // Move the page's Date to the chosen time and let it run on from there. (Playwright's own fake clock freezes
      // timers and stalls animations, so it is not used.) The offset is fixed here, so it carries across page loads.
      const offset = new Date(cap.clock).getTime() - Date.now();
      // (A string, not a function: tsx/esbuild adds helpers to functions that do not exist in the page.)
      await context.addInitScript({content: `(() => {
        const off = ${offset}, Real = Date, now = () => Real.now() + off;
        window.Date = new Proxy(Real, {
          construct: (t, args, nt) => (args.length === 0 ? new t(now()) : Reflect.construct(t, args, nt)),
          get: (t, k) => (k === 'now' ? now : t[k]),
          apply: (t) => new t(now()).toString(),
        });
      })();`});
    }
    // First registered = asked last: every request no route answers lands here and is logged (the page still gets the real answer).
    await context.route('**/*', (route) => {
      const u = new URL(route.request().url());
      if (!['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)) unmocked.push(route.request().url());
      return route.fallback();
    });
    for (const r of cap.routes) {
      if (r.cache) {
        const dir = path.resolve(o.specDir, r.cache);
        fs.mkdirSync(dir, {recursive: true});
        await context.route(r.url, async (route) => {
          const url = route.request().url();
          const f = path.join(dir, createHash('sha1').update(url).digest('hex').slice(0, 20));
          if (!fs.existsSync(f + '.bin')) {
            const res = await route.fetch();
            if (!res.ok()) return route.fulfill({response: res});
            fs.writeFileSync(f + '.bin', await res.body());
            fs.writeFileSync(f + '.json', JSON.stringify({status: res.status(), headers: {'content-type': res.headers()['content-type'] ?? 'application/octet-stream'}, url}));
          }
          const meta = JSON.parse(fs.readFileSync(f + '.json', 'utf8'));
          return route.fulfill({status: meta.status, headers: {...meta.headers, 'access-control-allow-origin': '*'}, body: fs.readFileSync(f + '.bin')});
        });
        continue;
      }
      const body = fs.readFileSync(path.resolve(o.specDir, r.file!));
      await context.route(r.url, (route) => route.fulfill({status: r.status, contentType: r.contentType, body, headers: {'access-control-allow-origin': '*'}}));
    }
    await context.addInitScript({content: `(() => {
      const css = '*::-webkit-scrollbar{display:none!important}html{scrollbar-width:none}nextjs-portal,[data-nextjs-toast]{display:none!important}';
      document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = css; document.head.append(s); });
    })();`});
    const page = await context.newPage();
    if (cap.safeArea) await applySafeArea(context, page, cap.safeArea);
    page.on('pageerror', (e) => o.detail(`page error: ${e.message}`));

    const settle = async (extra: number) => {
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([...document.images].map((i) => (i.complete && i.naturalWidth ? i.decode().catch(() => {}) : new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 8000); }))));
      }).catch(() => {});
      await page.waitForTimeout(extra);
    };

    const prescroll = async () => {
      const h = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y < h; y += 400) { await page.evaluate((v) => window.scrollTo(0, v), y); await page.waitForTimeout(120); }
      await page.evaluate(() => window.scrollTo(0, 0));
      await settle(500);
    };

    const bringToTop = async (sel: string, offset: number, within?: string) => {
      const el = page.locator(sel).first();
      await el.waitFor({state: 'attached', timeout: 15000});
      await el.evaluate((e, a) => {
        const c = a.within ? (e.closest(a.within) ?? document.querySelector(a.within)) : null;
        if (c) (c as HTMLElement).scrollTop = e.getBoundingClientRect().top - c.getBoundingClientRect().top + c.scrollTop - a.offset;
        else window.scrollTo(0, Math.max(0, Math.round(e.getBoundingClientRect().top + window.scrollY - a.offset)));
      }, {offset, within});
    };


    /**
     * Records the real animation of one action. The page clock (timers, requestAnimationFrame, performance.now) is stopped and advanced
     * 1/fps s at a time, and every CSS/Web animation is paused and set to the same time, so each frame is exact and the result is repeatable.
     */
    const record = async (r: NonNullable<Step['record']>) => {
      if (!seq) throw new Error('a record step needs a screen with a name');
      if (r.actions) return take(r);
      const sq = seq;
      const shot = async () => {
        const f = `${String(sq.n++).padStart(3, '0')}.png`;
        await page.screenshot({path: path.join(sq.dir, f)});
        return path.join(path.basename(sq.dir), f);
      };
      for (const [n, sel] of Object.entries(r.elements)) {
        const b = await boxOf(page.locator(sub(sel)), true, false);
        if (b) sq.boxes[n] = b; else o.detail(`WARN ${sq.name}.${n}: element not found (${sel}), skipped`);
      }
      if (r.before > 0) { const still = await shot(); for (let i = 0; i < r.before; i++) sq.files.push(still); }
      const now = await page.evaluate('Date.now()') as number;
      if (!clockOn) { await page.clock.install({time: now}); clockOn = true; }
      await page.clock.pauseAt(now + 20);
      // animations already running are frozen now; the ones the action starts count from their first step (not from the real time the page needed to start them)
      await page.evaluate(`(() => { const R = window.__adkitRec = {base: new WeakMap(), pending: []}; for (const a of document.getAnimations()) { R.base.set(a, a.currentTime || 0); a.pause(); R.pending.push(a); } })()`);
      const act = r.click !== undefined ? `(() => { const e = document.querySelector(${JSON.stringify(sub(r.click))}); if (!e) throw new Error('record click: not found'); e.click(); })()`
        : r.evaluate !== undefined ? fs.readFileSync(path.resolve(o.specDir, r.evaluate), 'utf8') : '';
      if (!act) throw new Error('a record step needs click or evaluate');
      await page.evaluate(act);
      const ms = (k: number) => Math.round((k * 1000 * r.slow) / r.fps); // page time after k recorded frames
      for (let k = 1; k <= r.frames; k++) {
        await page.clock.runFor(ms(k) - ms(k - 1));
        await page.evaluate(`((t, d) => { const R = window.__adkitRec; for (const a of document.getAnimations()) { if (!R.base.has(a)) { R.base.set(a, d - t); a.pause(); R.pending.push(a); } a.currentTime = R.base.get(a) + t; } })(${ms(k)}, ${ms(k) - ms(k - 1)})`);
        sq.files.push(await shot());
      }
      await page.evaluate(`(() => { for (const a of window.__adkitRec.pending) { try { a.finish(); } catch { a.play(); } } })()`);
      await page.clock.resume();
    };


    /**
     * A take: one continuous recording of a person using the page. The page clock is stopped and advanced one output frame at a time
     * (1/fps s, or slow/fps s inside an action's motion window), every CSS/Web animation is set to the same page time, and one screenshot
     * is kept per frame. The actions happen at their frames; between them the page just lives on (timers, tiles, pulses). The clock stays
     * stopped at the end, so the next screen continues from exactly this last frame.
     */
    const take = async (r: NonNullable<Step['record']>) => {
      const sq = seq!;
      const acts = [...(r.actions ?? [])].sort((a, b) => a.at - b.at);
      const shot = async () => {
        const f = `${String(sq.n++).padStart(3, '0')}.png`;
        await page.screenshot({path: path.join(sq.dir, f)});
        return path.join(path.basename(sq.dir), f);
      };
      if (!clockPaused) {
        const now = await page.evaluate('Date.now()') as number;
        if (!clockOn) { await page.clock.install({time: now}); clockOn = true; }
        await page.clock.pauseAt(now + 20);
        clockPaused = true;
      }
      // everything that already runs is frozen at its current time; the action's new animations count from their first step
      await page.evaluate(`(() => { const R = window.__adkitRec = {base: new WeakMap(), pending: []}; for (const a of document.getAnimations()) { R.base.set(a, a.currentTime || 0); a.pause(); R.pending.push(a); } })()`);
      sq.files.push(await shot());
      const step = 1000 / r.fps;
      let t = 0;
      const windowAt = (i: number) => acts.some((a) => i >= a.at && i < a.at + a.motion);
      const doAction = async (a: (typeof acts)[number]) => {
        if (a.waitFor) await page.locator(sub(a.waitFor)).first().waitFor({state: 'attached', timeout: 20000});
        for (const [n, sel] of Object.entries(a.elements)) {
          const b = await boxOf(page.locator(sub(sel)), true, false);
          if (b) sq.boxes[n] = b; else o.detail(`WARN ${sq.name}.${n}: element not found (${sel}), skipped`);
        }
        const code = a.click !== undefined ? `(() => { const e = document.querySelector(${JSON.stringify(sub(a.click))}); if (!e) throw new Error('take click: not found: ' + ${JSON.stringify(a.click)}); e.click(); })()` : fs.readFileSync(path.resolve(o.specDir, a.evaluate!), 'utf8');
        await page.evaluate(code);
      };
      let ai = 0;
      const measures: {at: number; a: (typeof acts)[number]}[] = acts.map((a) => ({at: a.at + a.motion - 1, a}));
      for (let i = 1; i <= r.frames; i++) {
        while (ai < acts.length && acts[ai].at === i) await doAction(acts[ai++]);
        const dt = windowAt(i) ? step * r.slow : step;
        const next = t + dt;
        await page.clock.runFor(Math.round(next) - Math.round(t));
        await page.evaluate(`((t, d) => { const R = window.__adkitRec; for (const a of document.getAnimations()) { if (!R.base.has(a)) { R.base.set(a, d - t); a.pause(); R.pending.push(a); } a.currentTime = R.base.get(a) + t; } })(${Math.round(next)}, ${Math.round(next) - Math.round(t)})`);
        t = next;
        sq.files.push(await shot());
        for (const m of measures) if (m.at === i) for (const [n, sel] of Object.entries(m.a.measure)) {
          const b = await boxOf(page.locator(sub(sel)), true, false);
          if (b) sq.boxes[n] = b; else o.detail(`WARN ${sq.name}.${n}: element not found (${sel}), skipped`);
        }
      }
      takeActions = acts.map((a) => ({at: a.at, motion: a.motion}));
    };

    const runStep = async (st: Step) => {
      if (st.goto !== undefined) {
        unmocked.length = 0;
        if (clockPaused) { await page.clock.resume(); clockPaused = false; }
        const u = sub(st.goto);
        await page.goto(/^https?:/.test(u) ? u : o.base + u, {waitUntil: 'load'});
        await settle(300);
      } else if (st.click !== undefined) {
        const c = typeof st.click === 'string' ? {selector: st.click, tap: false} : st.click;
        const loc = page.locator(sub(c.selector)).first();
        if (c.tap) await loc.tap(); else await loc.click();
      } else if (st.fill) {
        await page.locator(sub(st.fill.selector)).first().fill(sub(st.fill.value));
      } else if (st.select) {
        await page.locator(sub(st.select.selector)).first().selectOption(sub(st.select.value));
      } else if (st.wait !== undefined) {
        if (typeof st.wait === 'number') await page.waitForTimeout(st.wait);
        else await page.locator(sub(st.wait.for)).first().waitFor({state: st.wait.state, timeout: st.wait.timeoutMs ?? 15000});
      } else if (st.evaluate !== undefined) {
        const ev = typeof st.evaluate === 'string' ? {script: st.evaluate} as {file?: string; script?: string; save?: string} : st.evaluate;
        const code = ev.file ? fs.readFileSync(path.resolve(o.specDir, ev.file), 'utf8') : ev.script;
        if (!code) throw new Error('evaluate step needs a file or a script');
        const res = await page.evaluate(code);
        if (ev.save) vars[ev.save] = res == null ? '' : String(res);
      } else if (st.record !== undefined) {
        await record(st.record);
      } else if (st.scroll !== undefined) {
        if (typeof st.scroll === 'number') await page.evaluate((v) => window.scrollTo(0, v), st.scroll);
        else await bringToTop(sub(st.scroll.to), st.scroll.offset, st.scroll.within);
        await page.waitForTimeout(300);
      }
    };

    const boxOf = async (loc: Locator, viewportCoords: boolean, drawer: boolean): Promise<Box | null> => {
      const l = loc.first();
      if (!(await l.count())) return null;
      const b = await l.evaluate((el, a) => {
        const r = el.getBoundingClientRect();
        const x = Math.max(0, r.x), y = Math.max(0, r.y);
        // Overlays (drawers) are clamped to the viewport: their panels overhang it on purpose.
        const w = Math.min(r.right, innerWidth) - x, h = a.drawer ? Math.min(r.bottom, innerHeight) - y : r.height;
        return {x: x + (a.vp ? 0 : scrollX), y: y + (a.vp ? 0 : scrollY), w, h};
      }, {vp: viewportCoords, drawer});
      return {x: r1(b.x), y: r1(b.y), w: r1(b.w), h: r1(b.h)};
    };

    const fullShot = async (file: string, fullHeight: number) => {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);
      if (fullHeight * SCALE <= 15000) {
        await page.screenshot({path: file, fullPage: true});
      } else {
        // Chrome caps a texture at 16384 px: shoot in slices and join them.
        const step = 4000, parts: string[] = [];
        for (let y = 0, i = 0; y < fullHeight; y += step, i++) {
          const p = `${file}.part${i}.png`;
          await page.screenshot({path: p, fullPage: true, clip: {x: 0, y, width: W, height: Math.min(step, fullHeight - y)}});
          parts.push(p);
        }
        const r = spawnSync('magick', [...parts, '-append', '+repage', file]);
        parts.forEach((p) => fs.rmSync(p, {force: true}));
        if (r.status !== 0) throw new Error('magick append failed (is ImageMagick installed?)');
      }
      // A 1 px sideways overflow makes the shot wider than expected: cut it back.
      const w = Number(spawnSync('magick', ['identify', '-format', '%w', `${file}[0]`]).stdout.toString());
      if (w && w !== W * SCALE) spawnSync('magick', [file, '-crop', `${W * SCALE}x+0+0`, '+repage', file]);
    };

    for (const [idx, screen] of o.screens.entries()) {
      const t0 = Date.now();
      const label = `${setName}/${screen.name ?? `step${idx + 1}`}`;
      seq = screen.name ? {name: screen.name, dir: path.join(setDir, `${screen.name}.seq`), files: [], boxes: {}, n: 0} : undefined;
      if (seq) { fs.rmSync(seq.dir, {recursive: true, force: true}); fs.mkdirSync(seq.dir, {recursive: true}); }
      try {
        for (const [i, st] of screen.steps.entries()) {
          try { await runStep(st); } catch (e) {
            const shotPath = path.join(o.logsDir, `capture-fail-${setName}-${screen.name ?? idx}.png`);
            await page.screenshot({path: shotPath}).catch(() => {});
            const text = await page.evaluate(() => document.body.innerText.slice(0, 600)).catch(() => '');
            o.detail(`step failed; screenshot ${shotPath}; page text: ${text.replace(/\s+/g, ' ')}`); throw new Error(`step ${i + 1} (${JSON.stringify(st).slice(0, 120)}) at ${page.url()}: ${(e as Error).message.split("\n")[0]}`); }
        }
        if (!screen.name || (o.onlyScreen && o.onlyScreen !== screen.name)) {
          o.detail(`${label}: steps only (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
          continue;
        }
        await settle(screen.settleMs);
        let scrollY = 0;
        if (!screen.drawer) {
          await prescroll();
          if (typeof screen.scroll === 'number') await page.evaluate((v) => window.scrollTo(0, v), screen.scroll);
          else if (screen.scroll) await bringToTop(sub(screen.scroll.to), screen.scroll.offset);
          await page.waitForTimeout(500);
          scrollY = await page.evaluate(() => window.scrollY);
        }
        if (!themeDone) {
          const t = await page.evaluate(() => { const cs = getComputedStyle(document.body); return {bg: cs.backgroundColor, fg: cs.color}; });
          entry.theme = {bg: cssToHex(t.bg), fg: cssToHex(t.fg), accent: o.accent};
          themeDone = true;
        }
        const elements: Record<string, Box> = {...(seq?.boxes ?? {})};
        for (const [n, spec] of Object.entries(screen.elements)) {
          const s = typeof spec === 'string' ? {selector: spec, fixed: false} : spec;
          const b = await boxOf(page.locator(sub(s.selector)), s.fixed || screen.drawer, screen.drawer);
          if (b) elements[n] = b; else o.detail(`WARN ${label}.${n}: element not found (${s.selector}), skipped`);
        }
        const rel = `captures/${setName}/${screen.name}`;
        const file = path.join(setDir, `${screen.name}.png`);
        const fullFile = path.join(setDir, `${screen.name}-full.png`);
        await page.screenshot({path: file});
        let fullHeight = H;
        if (screen.drawer) fs.copyFileSync(file, fullFile);
        else {
          fullHeight = await page.evaluate(() => document.documentElement.scrollHeight);
          await fullShot(fullFile, fullHeight);
          await page.evaluate((v) => window.scrollTo(0, v), scrollY);
        }
        const shaH = createHash('sha256').update(fs.readFileSync(fullFile));
        // a recorded sequence is part of the screen: its frames change the hash too
        if (seq) for (const f of [...new Set(seq.files)]) shaH.update(fs.readFileSync(path.join(setDir, f)));
        const sha = shaH.digest('hex');
        const sc: ScreenEntry = {file: `${rel}.png`, fullFile: `${rel}-full.png`, fullHeight, scrollY, sha, elements};
        if (seq && seq.files.length) sc.frames = seq.files.map((f) => `captures/${setName}/${f}`);
        else if (seq) fs.rmSync(seq.dir, {recursive: true, force: true});
        if (seq && takeActions) { sc.actions = takeActions; takeActions = undefined; sc.unmocked = [...new Set(unmocked)]; }
        entry.screens[screen.name] = sc;
        const n = Object.keys(elements).length;
        o.log(`capture ${label} ok ${((Date.now() - t0) / 1000).toFixed(1)}s elements=${n}`);
        o.detail(`${label}: scrollY=${scrollY} fullHeight=${fullHeight} elements=${Object.keys(elements).join(',') || '-'}`);
        const missing = Object.keys(screen.elements).filter((k) => !(k in elements));
        if (missing.length) o.log(`  warn ${label}: elements not found: ${missing.join(', ')}`);
      } catch (e) {
        throw new Error(`${label}: ${(e as Error).message}`);
      }
    }
    await context.close();
  } finally {
    await browser.close().catch(() => {});
  }
  return entry;
}

export type {Page};
