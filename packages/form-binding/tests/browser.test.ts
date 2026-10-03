// The binding in Chromium: a server-rendered form shows an error when a changed control loses
// focus, an invalid submission sends no request and reaches no other submit listener, and a
// corrected form submits normally. Playwright serves the page, the bundled binding and the
// submission target from routes, so every request the page makes is recorded.
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, expect, it } from 'vitest';

import { formHtml } from './dom';

const origin = 'https://crudui.test';
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

let browser: Browser;
let bundle: string;

beforeAll(async () => {
  const output = await build({
    entryPoints: [fileURLToPath(new URL('../src/index.ts', import.meta.url))],
    bundle: true, format: 'esm', platform: 'browser', write: false, logLevel: 'silent',
  });
  bundle = output.outputFiles[0]!.text;
  browser = await chromium.launch({ headless: true });
}, 60000);

afterAll(async () => {
  await browser?.close();
}, 60000);

/** Open the form page; every request is answered by a route and recorded. */
async function open(): Promise<{ tab: Page; posts: string[]; failures: string[] }> {
  const tab = await browser.newPage();
  const posts: string[] = [];
  const failures: string[] = [];
  tab.on('pageerror', (error) => failures.push(error.message));
  await tab.route(`${origin}/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'POST' && path === '/submit') {
      posts.push(request.postData() ?? '');
      await route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Saved</title><p id="saved">Saved</p>' });
    } else if (path === '/') {
      await route.fulfill({ contentType: 'text/html', body: page(formHtml(spec, {})) });
    } else if (path === '/binding.mjs') {
      await route.fulfill({ contentType: 'text/javascript', body: bundle });
    } else {
      await route.fulfill({ status: 404, body: '' });
    }
  });
  await tab.goto(`${origin}/`);
  await tab.locator('body[data-bound="true"]').waitFor({ timeout: 10000 });
  return { tab, posts, failures };
}

it('shows errors while typing, stops an invalid submission and submits a corrected form', async () => {
  const { tab, posts, failures } = await open();
  try {
    const email = tab.locator('input[name="form[email]"]');
    const name = tab.locator('input[name="form[name]"]');
    const emailErrors = tab.locator('[data-field-path="email"] > .crudui-node__errors > .crudui-node__error');
    const nameErrors = tab.locator('[data-field-path="name"] > .crudui-node__errors > .crudui-node__error');

    await email.fill('x');
    expect(await emailErrors.count()).toBe(0);
    await email.press('Tab');
    await emailErrors.waitFor({ state: 'visible', timeout: 5000 });
    expect(await emailErrors.allTextContents()).toStrictEqual(['Please enter a valid email address.']);
    expect(await email.getAttribute('aria-invalid')).toBe('true');

    // The click dispatches the submit event and runs its listeners before it returns.
    await tab.locator('button[type="submit"]').click();
    expect(await tab.evaluate(() => (window as unknown as { librarySubmits: number }).librarySubmits)).toBe(0);
    expect(await nameErrors.allTextContents()).toStrictEqual(['This field is required.']);
    expect(await email.evaluate((element) => element === document.activeElement)).toBe(true);

    await email.fill('ada@example.com');
    expect(await emailErrors.count()).toBe(0);
    expect(await email.getAttribute('aria-invalid')).toBeNull();
    await name.fill('Ada');
    expect(await nameErrors.count()).toBe(0);

    const request = tab.waitForRequest((sent) => sent.method() === 'POST', { timeout: 10000 });
    await tab.locator('button[type="submit"]').click();
    await request;
    await tab.locator('#saved').waitFor({ timeout: 10000 });
    // The invalid click sent nothing: the only request is the corrected submission.
    expect(posts).toStrictEqual([`form%5Bemail%5D=ada%40example.com&form%5Bname%5D=Ada`]);
    expect(failures).toStrictEqual([]);
  } finally {
    await tab.close();
  }
}, 60000);
