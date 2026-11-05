import {describe, expect, it} from 'vitest';
import {chromium} from 'playwright';
import {applySafeArea} from '../src/capture/shoot';

const probe = `(() => { const e = document.createElement('div'); e.style.cssText = 'position:fixed;visibility:hidden;padding-bottom:env(safe-area-inset-bottom);padding-top:env(safe-area-inset-top)'; document.body.append(e); const s = getComputedStyle(e); const r = [s.paddingTop, s.paddingBottom]; e.remove(); return r; })()`;

describe('capture safeArea', () => {
  it('env(safe-area-inset-*) reads the insets, before and after a navigation', async () => {
    const browser = await chromium.launch();
    try {
      const context = await browser.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});
      const page = await context.newPage();
      await applySafeArea(context, page, {top: 47, bottom: 34});
      await page.goto('data:text/html,<body>one</body>');
      expect(await page.evaluate(probe)).toEqual(['47px', '34px']);
      await page.goto('data:text/html,<body>two</body>');
      expect(await page.evaluate(probe)).toEqual(['47px', '34px']);
    } finally { await browser.close(); }
  }, 60000);
});
