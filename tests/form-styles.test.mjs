// Chromium layout checks for the core form stylesheet (@crudui/generator-core/styles.css).
// jsdom has no layout, so sticky stacking is verified in a real browser.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const entry = '/__crudui_form_styles__.mjs';
const moduleId = '\0crudui-form-styles';
const key = '__0000000000001__';
const longName = 'Long company name that cannot fit in one sticky header '.repeat(6);

// Five nested repeated levels, each with a sticky header titled by its name.
const levels = ['companies', 'stores', 'departments', 'teams', 'members'];
function levelSpec(index) {
  const properties = { name: { type: 'text', label: 'Name' }, note: { type: 'textarea', label: 'Note' } };
  if (index + 1 < levels.length) properties[levels[index + 1]] = levelSpec(index + 1);
  return { type: 'group', label: levels[index], multiple: { header: 'sticky', title: 'name', copy: true, sortable: true }, properties };
}
function levelData(index) {
  const row = { name: index === 0 ? longName : `${levels[index]} one`, note: '' };
  if (index + 1 < levels.length) row[levels[index + 1]] = levelData(index + 1);
  return { [key]: row };
}
const spec = { type: 'group', properties: { [levels[0]]: levelSpec(0) } };
const data = { [levels[0]]: levelData(0) };

const browserSource = `
import '/packages/generator-core/styles/form.css';
import { compileForm, connectForm, createForm } from '@crudui/generator-core';
import { renderForm } from '@crudui/generator-html';

const element = document.getElementById('form');
window.formStylesTest = {
  mount(spec, data) {
    const form = createForm(compileForm(spec), data, { language: 'en' });
    element.innerHTML = renderForm(form);
    connectForm(element, form);
  },
};
`;

let server, browser, url, cacheDirectory;
before(async () => {
  cacheDirectory = await mkdtemp(join(tmpdir(), 'crudui-form-styles-'));
  server = await createServer({
    root, configFile: false, logLevel: 'error', cacheDir: cacheDirectory,
    optimizeDeps: { noDiscovery: true, include: ['@crudui/generator-core', '@crudui/generator-html'] },
    server: { host: '127.0.0.1', port: 0 },
    plugins: [{
      name: 'form-styles-test',
      resolveId(id) { if (id === entry) return moduleId; },
      load(id) { if (id === moduleId) return browserSource; },
      configureServer(vite) {
        vite.middlewares.use(async (request, response, next) => {
          if (request.url !== '/form-styles') return next();
          try {
            // Tall note fields give every level room to stay stuck while scrolling.
            const html = await vite.transformIndexHtml('/form-styles', `<!doctype html><html><head><link rel="icon" href="data:,"><style>body{margin:0}textarea{height:900px}</style></head><body><div id="form"></div><script type="module" src="${entry}"></script></body></html>`);
            response.setHeader('Content-Type', 'text/html');
            response.end(html);
          } catch (error) { next(error); }
        });
      },
    }],
  });
  await server.listen();
  url = `${server.resolvedUrls.local[0]}form-styles`;
  browser = await puppeteer.launch({ headless: true });
}, { timeout: 60000 });
after(async () => {
  try { await browser?.close(); }
  finally {
    try { await server?.close(); }
    finally { if (cacheDirectory) await rm(cacheDirectory, { recursive: true, force: true }); }
  }
});

test('sticky row headers stack at exactly one header height per level', async () => {
  const page = await browser.newPage();
  const failures = [];
  page.on('pageerror', error => failures.push(error.message));
  page.on('console', message => { if (message.type() === 'error') failures.push(message.text()); });
  try {
    await page.setViewport({ width: 1000, height: 700 });
    await page.goto(url);
    await page.waitForFunction(() => window.formStylesTest !== undefined);
    await page.evaluate((spec, data) => window.formStylesTest.mount(spec, data), spec, data);

    // Scroll until the deepest row sits just below the four pinned ancestor headers.
    await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.style.height = 'var(--crudui-node-header-height)';
      document.querySelector('.crudui-form').append(probe);
      const header = probe.getBoundingClientRect().height;
      probe.remove();
      const rows = document.querySelectorAll('.crudui-node--sticky');
      const deepest = rows[rows.length - 1];
      window.scrollTo(0, deepest.getBoundingClientRect().top + window.scrollY - 4 * header + 10);
    });
    await page.waitForFunction(count => document.querySelectorAll('[data-crudui-stuck]').length === count, { timeout: 5000 }, levels.length);

    const layout = await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.style.height = 'var(--crudui-node-header-height)';
      document.querySelector('.crudui-form').append(probe);
      const token = probe.getBoundingClientRect().height;
      probe.remove();
      const headers = [...document.querySelectorAll('.crudui-node--sticky')].map(row => row.firstElementChild);
      const stuck = [...document.querySelectorAll('.crudui-node--sticky[data-crudui-stuck]')]
        .map(row => row.firstElementChild.getBoundingClientRect())
        .sort((a, b) => a.top - b.top)
        .map(rect => ({ top: rect.top, bottom: rect.bottom }));
      const first = headers[0];
      const title = first.querySelector('.crudui-node__title');
      const actionTops = new Set([...first.querySelectorAll('.crudui-action')].map(button => Math.round(button.getBoundingClientRect().top)));
      return {
        token,
        heights: headers.map(header => header.getBoundingClientRect().height),
        stuck,
        labels: headers.map(header => getComputedStyle(header.querySelector('.crudui-node__label')).display),
        titleTruncated: title.scrollWidth > title.clientWidth,
        actionRows: actionTops.size,
      };
    });

    assert.deepEqual(failures, []);
    assert.ok(layout.token > 0, 'The header height token resolves');
    for (const height of layout.heights) assert.ok(Math.abs(height - layout.token) < 0.5, `Sticky header height ${height} equals ${layout.token}`);
    assert.equal(layout.stuck.length, levels.length, 'Every level is stuck');
    assert.ok(Math.abs(layout.stuck[0].top) < 0.5, 'The outermost header sticks at the top');
    for (let index = 1; index < layout.stuck.length; index++) {
      assert.ok(Math.abs(layout.stuck[index].top - layout.stuck[index - 1].bottom) < 0.5,
        `Level ${index} starts where level ${index - 1} ends: ${layout.stuck[index].top} vs ${layout.stuck[index - 1].bottom}`);
    }
    assert.ok(layout.labels.every(display => display !== 'none'), 'Stuck headers show their level labels');
    assert.equal(layout.titleTruncated, true, 'A long title is truncated');
    assert.equal(layout.actionRows, 1, 'Header controls stay on one line');

    // Scrolled back to the top, nothing is stuck and the level labels are hidden.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForFunction(() => document.querySelectorAll('[data-crudui-stuck]').length === 0, { timeout: 5000 });
    const hidden = await page.evaluate(() => [...document.querySelectorAll('.crudui-node--sticky > .crudui-node__header > .crudui-node__label')]
      .map(label => getComputedStyle(label).display));
    assert.ok(hidden.every(display => display === 'none'), 'Level labels are hidden while headers are not stuck');
  } finally { await page.close(); }
});
