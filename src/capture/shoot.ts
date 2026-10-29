import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {chromium, type Locator, type Page} from 'playwright';
import type {z} from 'zod';
import type {Capture as CaptureSchema} from '../spec/schema';
import type {Box, ScreenEntry, SetEntry} from './manifest';

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
  const sub = (s: string) => s.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (m, k: string) => (k in vars ? vars[k] : m));

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: {width: W, height: H}, deviceScaleFactor: SCALE, isMobile: true, hasTouch: true,
      locale: cap.locale, timezoneId: cap.timezone, reducedMotion: 'no-preference',
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
    await context.addInitScript({content: `(() => {
      const css = '*::-webkit-scrollbar{display:none!important}html{scrollbar-width:none}nextjs-portal,[data-nextjs-toast]{display:none!important}';
      document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = css; document.head.append(s); });
    })();`});
    const page = await context.newPage();
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

    const runStep = async (st: Step) => {
      if (st.goto !== undefined) {
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
        const elements: Record<string, Box> = {};
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
        const sha = createHash('sha256').update(fs.readFileSync(fullFile)).digest('hex');
        const sc: ScreenEntry = {file: `${rel}.png`, fullFile: `${rel}-full.png`, fullHeight, scrollY, sha, elements};
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
