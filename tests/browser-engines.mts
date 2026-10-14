// The browser engines the repository's browser checks run in: Chromium and Firefox through
// Puppeteer, WebKit through Playwright, each at the build that the locked package pins
// (scripts/install-browsers.mts). A browser that cannot start fails the run with the reason and the
// command that installs it; no engine is ever skipped.
import assert from 'node:assert/strict';
import { webkit, type Browser as PlaywrightBrowser } from 'playwright';
import puppeteer, { Browser as PuppeteerBrowser } from 'puppeteer';

/** An element handle as both drivers give it: clickable, evaluable, and a frame's document for an iframe. */
export interface EngineElement {
  click(): Promise<void>;
  evaluate<Result>(fn: (node: Node) => Result): Promise<Awaited<Result>>;
  contentFrame(): Promise<EngineFrame | null>;
}

/** A handle of an in-page value, an element or not. */
export interface EngineHandle {
  asElement(): EngineElement | null;
}

/** A locator of both drivers; Puppeteer's takes the selector only and ignores the options. */
export interface EngineLocator {
  click(): Promise<void>;
}

/** A console message of a page. */
export interface EngineConsoleMessage {
  type(): string;
  text(): string;
}

/** The calls the frames of Puppeteer and Playwright share. */
export interface EngineFrame {
  evaluate<Result>(fn: () => Result): Promise<Awaited<Result>>;
  evaluate<Result, Argument>(fn: (argument: Argument) => Result, argument: Argument): Promise<Awaited<Result>>;
  evaluateHandle(fn: () => unknown): Promise<EngineHandle>;
  waitForFunction(fn: () => unknown, options?: { timeout?: number }): Promise<unknown>;
  locator(selector: string, options?: { hasText?: string }): EngineLocator;
}

/** The calls the pages of Puppeteer and Playwright share. */
export interface EnginePage {
  // Puppeteer reports a thrown value that is not an Error as it is.
  on(event: 'pageerror', listener: (error: unknown) => void): unknown;
  on(event: 'console', listener: (message: EngineConsoleMessage) => void): unknown;
  goto(url: string): Promise<unknown>;
  setContent(html: string): Promise<void>;
  waitForSelector(selector: string, options?: { timeout?: number }): Promise<EngineElement | null>;
  mainFrame(): EngineFrame;
  evaluate<Result>(fn: () => Result): Promise<Awaited<Result>>;
  evaluate<Result, Argument>(fn: (argument: Argument) => Result, argument: Argument): Promise<Awaited<Result>>;
  focus(selector: string): Promise<void>;
  click(selector: string): Promise<void>;
  keyboard: { press(key: string): Promise<void>; type(text: string): Promise<void> };
  close(): Promise<void>;
}

/** A browser that a driver launched. */
export type EngineBrowser = PuppeteerBrowser | PlaywrightBrowser;

export interface EngineDriver {
  launch(): Promise<EngineBrowser>;
  open(browser: EngineBrowser, viewport: { width: number; height: number }): Promise<EnginePage>;
}

export type Engine = 'chromium' | 'firefox' | 'webkit';

/** Launches a browser of Puppeteer at its pinned build, or fails with the command that installs it. */
async function launchPinned(browser: 'chrome' | 'firefox'): Promise<PuppeteerBrowser> {
  try { return await puppeteer.launch({ headless: true, browser }); }
  catch (error) { throw new Error(`${browser} is required at the build that puppeteer pins; install it with \`node scripts/install-browsers.mts ${browser}\`:\n${error instanceof Error ? error.message : String(error)}`, { cause: error }); }
}

/** Opens a page of a Puppeteer browser at a viewport size. */
async function openPinned(browser: EngineBrowser, viewport: { width: number; height: number }): Promise<EnginePage> {
  assert.ok(browser instanceof PuppeteerBrowser);
  const page = await browser.newPage(); await page.setViewport(viewport);
  // Puppeteer types the events of `on` by the keys of a const enum, whose values are the event
  // names 'pageerror' and 'console'; every other call is checked against EnginePage here.
  return (page satisfies Omit<EnginePage, 'on'>) as EnginePage;
}

/**
 * How each engine launches and opens a page of a viewport size. The pages of both drivers share
 * the calls the checks use: `on('pageerror' | 'console')`, `goto`, `waitForSelector`,
 * `mainFrame`, and on frames `evaluate(fn, arg)`, `evaluateHandle` and `waitForFunction(fn)`.
 */
export const engineDrivers: Record<Engine, EngineDriver> = {
  chromium: {
    launch: () => launchPinned('chrome'),
    open: openPinned,
  },
  firefox: {
    launch: () => launchPinned('firefox'),
    open: openPinned,
  },
  webkit: {
    launch: async () => {
      try { return await webkit.launch({ headless: true }); }
      catch (error) { throw new Error(`WebKit is required for the browser checks; install it with \`node scripts/install-browsers.mts webkit\` (on Linux with --with-deps):\n${error instanceof Error ? error.message : String(error)}`, { cause: error }); }
    },
    // A Playwright page opened from the browser owns its context and closes it with itself.
    open: (browser, viewport) => {
      assert.ok(!(browser instanceof PuppeteerBrowser));
      return browser.newPage({ viewport });
    },
  },
};

export const engines: Engine[] = ['chromium', 'firefox', 'webkit'];
