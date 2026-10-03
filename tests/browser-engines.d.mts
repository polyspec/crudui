// Types of the browser engine adapter for TypeScript tests: the calls the pages of Puppeteer and
// Playwright share.
export interface EngineFrame {
  evaluate<Result, Argument>(fn: (argument: Argument) => Result, argument: Argument): Promise<Result>;
  waitForFunction(fn: () => unknown, options?: { timeout?: number }): Promise<unknown>;
}

export interface EnginePage {
  on(event: 'pageerror', listener: (error: Error) => void): unknown;
  goto(url: string): Promise<unknown>;
  waitForSelector(selector: string, options?: { timeout?: number }): Promise<unknown>;
  mainFrame(): EngineFrame;
  evaluate<Result, Argument>(fn: (argument: Argument) => Result, argument: Argument): Promise<Result>;
  focus(selector: string): Promise<void>;
  click(selector: string): Promise<void>;
  keyboard: { press(key: string): Promise<void>; type(text: string): Promise<void> };
  close(): Promise<void>;
}

export interface EngineBrowser {
  close(): Promise<void>;
}

export interface EngineDriver {
  launch(): Promise<EngineBrowser>;
  open(browser: EngineBrowser, viewport: { width: number; height: number }): Promise<EnginePage>;
}

export type Engine = 'chromium' | 'firefox' | 'webkit';

export const engineDrivers: Record<Engine, EngineDriver>;

export const engines: Engine[];
