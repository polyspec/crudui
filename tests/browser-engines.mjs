// The browser engines the repository's browser checks run in: Chromium and Firefox through
// Puppeteer, WebKit through Playwright, each at the build that the locked package pins
// (scripts/install-browsers.mjs). A browser that cannot start fails the run with the reason and the
// command that installs it; no engine is ever skipped.
import { webkit } from 'playwright';
import puppeteer from 'puppeteer';

/** Launches a browser of Puppeteer at its pinned build, or fails with the command that installs it. */
async function launchPinned(browser) {
  try { return await puppeteer.launch({ headless: true, browser }); }
  catch (error) { throw new Error(`${browser} is required at the build that puppeteer pins; install it with \`node scripts/install-browsers.mjs ${browser}\`:\n${error.message}`, { cause: error }); }
}

/**
 * How each engine launches and opens a page of a viewport size. The pages of both drivers share
 * the calls the checks use: `on('pageerror' | 'console')`, `goto`, `waitForSelector`,
 * `mainFrame`, and on frames `evaluate(fn, arg)`, `evaluateHandle` and `waitForFunction(fn)`.
 */
export const engineDrivers = {
  chromium: {
    launch: () => launchPinned('chrome'),
    open: async (browser, viewport) => { const page = await browser.newPage(); await page.setViewport(viewport); return page; },
  },
  firefox: {
    launch: () => launchPinned('firefox'),
    open: async (browser, viewport) => { const page = await browser.newPage(); await page.setViewport(viewport); return page; },
  },
  webkit: {
    launch: async () => {
      try { return await webkit.launch({ headless: true }); }
      catch (error) { throw new Error(`WebKit is required for the browser checks; install it with \`node scripts/install-browsers.mjs webkit\` (on Linux with --with-deps):\n${error.message}`, { cause: error }); }
    },
    // A Playwright page opened from the browser owns its context and closes it with itself.
    open: (browser, viewport) => browser.newPage({ viewport }),
  },
};

export const engines = Object.keys(engineDrivers);
