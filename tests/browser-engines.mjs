// The browser engines the repository's browser checks run in: Chromium and Firefox through
// Puppeteer, WebKit through Playwright. A browser that cannot start fails the run with the
// reason; no engine is ever skipped.
import { existsSync } from 'node:fs';
import { webkit } from 'playwright';
import puppeteer from 'puppeteer';

/** The Firefox executable: CRUDUI_FIREFOX_EXECUTABLE, or the platform's installed Firefox. */
function firefoxExecutable() {
  const candidates = [process.env.CRUDUI_FIREFOX_EXECUTABLE, '/Applications/Firefox.app/Contents/MacOS/firefox', '/usr/bin/firefox'].filter(Boolean);
  const found = candidates.find(candidate => existsSync(candidate));
  if (!found) throw new Error(`Firefox is required for the browser checks; set CRUDUI_FIREFOX_EXECUTABLE (looked in ${candidates.join(', ')})`);
  return found;
}

/**
 * How each engine launches and opens a page of a viewport size. The pages of both drivers share
 * the calls the checks use: `on('pageerror' | 'console')`, `goto`, `waitForSelector`,
 * `mainFrame`, and on frames `evaluate(fn, arg)`, `evaluateHandle` and `waitForFunction(fn)`.
 */
export const engineDrivers = {
  chromium: {
    launch: () => puppeteer.launch({ headless: true }),
    open: async (browser, viewport) => { const page = await browser.newPage(); await page.setViewport(viewport); return page; },
  },
  firefox: {
    launch: () => puppeteer.launch({ headless: true, browser: 'firefox', executablePath: firefoxExecutable() }),
    open: async (browser, viewport) => { const page = await browser.newPage(); await page.setViewport(viewport); return page; },
  },
  webkit: {
    launch: async () => {
      try { return await webkit.launch({ headless: true }); }
      catch (error) { throw new Error(`WebKit is required for the browser checks; install it with \`npx playwright install --with-deps webkit\`:\n${error.message}`, { cause: error }); }
    },
    // A Playwright page opened from the browser owns its context and closes it with itself.
    open: (browser, viewport) => browser.newPage({ viewport }),
  },
};

export const engines = Object.keys(engineDrivers);
