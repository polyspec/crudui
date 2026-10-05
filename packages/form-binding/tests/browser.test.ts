// The binding in Chromium, Firefox and WebKit, the browsers of the repository's browser checks
// (tests/browser-engines.mjs): a server-rendered form shows an error when a changed control loses
// focus, an invalid submission sends no request and reaches no other submit listener, and a
// corrected form submits normally. A local server serves the page, the bundled binding and the
// submission target and records every submission it receives.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';
import { afterAll, beforeAll, expect, it } from 'vitest';

import { engineDrivers, engines, type Engine, type EngineBrowser, type EnginePage } from '../../../tests/browser-engines.mjs';
import { formHtml } from './dom';

const spec = {
  type: 'group',
  properties: {
    email: { type: 'email', label: 'Email', validate: { required: true, email: true } },
    name: { type: 'text', label: 'Name', validate: { required: true } },
  },
};

const page = (form: string) => `<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="data:,"></head>
<body>${form}<script type="module">
import { bindForm } from '/binding.mjs';
window.librarySubmits = 0;
// A library such as htmx listens for submit on the form and sends its own request.
document.querySelector('form').addEventListener('submit', () => { window.librarySubmits += 1; });
window.binding = bindForm(document.querySelector('form'), ${JSON.stringify(spec)}, { keyPrefix: 'form' });
document.body.dataset.bound = 'true';
</script></body></html>`;

const saved = '<!doctype html><title>Saved</title><p id="saved">Saved</p>';
const browsers: Partial<Record<Engine, EngineBrowser>> = {};
let server: Server;
let origin: string;
/** The body of every submission the server received, and the waiter of the next one. */
const posts: string[] = [];
let nextPost: ((body: string) => void) | undefined;

beforeAll(async () => {
  const output = await build({
    entryPoints: [fileURLToPath(new URL('../src/index.ts', import.meta.url))],
    bundle: true, format: 'esm', platform: 'browser', write: false, logLevel: 'silent',
  });
  const bundle = output.outputFiles[0]!.text;
  const body = page(formHtml(spec, {}));
  server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (request.method === 'POST' && path === '/submit') {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        posts.push(text);
        nextPost?.(text);
        response.writeHead(200, { 'Content-Type': 'text/html' }).end(saved);
      });
    } else if (request.method === 'GET' && path === '/') {
      response.writeHead(200, { 'Content-Type': 'text/html' }).end(body);
    } else if (request.method === 'GET' && path === '/binding.mjs') {
      response.writeHead(200, { 'Content-Type': 'text/javascript' }).end(bundle);
    } else {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  for (const engine of engines) browsers[engine] = await engineDrivers[engine].launch();
}, 120000);

// The browser close and the server stop are a teardown: it ends when both close calls resolve and
// has no hook timeout.
afterAll(async () => {
  const started = performance.now();
  try {
    await Promise.all(Object.values(browsers).map((browser) => browser.close()));
  } finally {
    await new Promise((resolve) => server?.close(resolve));
    process.stdout.write(`[teardown] browser close and server stop: finished in ${((performance.now() - started) / 1000).toFixed(1)}s\n`);
  }
}, Infinity);

const emailErrors = '[data-field-path="email"] > .crudui-node__errors > .crudui-node__error';
const nameErrors = '[data-field-path="name"] > .crudui-node__errors > .crudui-node__error';
const email = 'input[name="form[email]"]';
const name = 'input[name="form[name]"]';

/** The texts of the elements a selector matches. */
const texts = (tab: EnginePage, selector: string) =>
  tab.evaluate((target) => Array.from(document.querySelectorAll(target), (element) => element.textContent), selector);

/** The `aria-invalid` attribute of the element a selector matches. */
const invalid = (tab: EnginePage, selector: string) =>
  tab.evaluate((target) => document.querySelector(target)!.getAttribute('aria-invalid'), selector);

for (const engine of engines) {
  it(`${engine}: shows errors while typing, stops an invalid submission and submits a corrected form`, async () => {
    const tab = await engineDrivers[engine].open(browsers[engine]!, { width: 1000, height: 700 });
    const failures: string[] = [];
    tab.on('pageerror', (error) => failures.push(error.message));
    posts.length = 0;
    try {
      await tab.goto(`${origin}/`);
      await tab.waitForSelector('body[data-bound="true"]', { timeout: 10000 });

      await tab.focus(email);
      await tab.keyboard.type('x');
      expect(await texts(tab, emailErrors)).toStrictEqual([]);
      await tab.keyboard.press('Tab');
      await tab.waitForSelector(emailErrors, { timeout: 5000 });
      expect(await texts(tab, emailErrors)).toStrictEqual(['Please enter a valid email address.']);
      expect(await invalid(tab, email)).toBe('true');

      // The click dispatches the submit event and runs its listeners before it returns.
      await tab.click('button[type="submit"]');
      expect(await tab.evaluate(() => (window as unknown as { librarySubmits: number }).librarySubmits, undefined)).toBe(0);
      expect(await texts(tab, nameErrors)).toStrictEqual(['This field is required.']);
      expect(await tab.evaluate((target) => document.querySelector(target) === document.activeElement, email)).toBe(true);

      // Typing over the selected value replaces it, as a user does.
      await tab.evaluate((target) => document.querySelector<HTMLInputElement>(target)!.select(), email);
      await tab.keyboard.type('ada@example.com');
      expect(await texts(tab, emailErrors)).toStrictEqual([]);
      expect(await invalid(tab, email)).toBeNull();
      await tab.focus(name);
      await tab.keyboard.type('Ada');
      expect(await texts(tab, nameErrors)).toStrictEqual([]);

      const submitted = new Promise<string>((resolve) => { nextPost = resolve; });
      await tab.click('button[type="submit"]');
      await submitted;
      await tab.waitForSelector('#saved', { timeout: 10000 });
      // The invalid click sent nothing: the only request is the corrected submission.
      expect(posts).toStrictEqual([`form%5Bemail%5D=ada%40example.com&form%5Bname%5D=Ada`]);
      expect(failures).toStrictEqual([]);
    } finally {
      nextPost = undefined;
      await tab.close();
    }
  }, 60000);
}
