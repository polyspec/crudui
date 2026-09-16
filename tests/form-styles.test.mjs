// Chromium layout checks for the core stylesheet (@crudui/generator-core/crudui.css).
// jsdom has no layout, so sticky stacking and focus scrolling are verified in a real browser.
// Sticky rows are CSS only, so every check runs the same way in a page, in a scrolling box
// and in a frame.
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
const second = '__0000000000002__';
const longName = 'Long company name that cannot fit in one sticky header '.repeat(6);
const hosts = ['page', 'box', 'frame'];

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
// Two stores, the second after the first with its nested rows.
const siblingData = { [levels[0]]: { [key]: { ...levelData(0)[key], name: 'ACME', stores: { ...levelData(1), [second]: { name: 'Pangyo', note: '', departments: {} } } } } };

const browserSource = `
import '/packages/generator-core/styles/crudui.css';
import { compileForm, connectForm, connectOutline, createForm } from '@crudui/generator-core';
import { renderForm, renderOutline } from '@crudui/generator-html';

const element = document.getElementById('form');
const outline = document.getElementById('outline');
window.formStylesTest = {
  mount(spec, data) {
    const form = createForm(compileForm(spec), data, { language: 'en' });
    element.innerHTML = renderForm(form);
    outline.innerHTML = renderOutline(form);
    const connection = connectForm(element, form);
    connectOutline(outline, form, element);
    // Render every change and synchronize, as an HTML renderer application does.
    form.subscribe(() => {
      element.innerHTML = renderForm(form);
      connection.sync();
      outline.innerHTML = renderOutline(form);
    });
  },
};
`;

let server, browser, url, frameUrl, cacheDirectory;
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
          try {
            if (request.url === '/form-styles') {
              // Tall note fields give every level room to stay stuck while scrolling.
              const html = await vite.transformIndexHtml('/form-styles', `<!doctype html><html><head><link rel="icon" href="data:,"><style>body{margin:0;padding-top:40px}textarea{height:900px}</style></head><body><div id="form"></div><div id="outline" style="position:fixed;top:0;right:0;width:12rem"></div><script type="module" src="${entry}"></script></body></html>`);
              response.setHeader('Content-Type', 'text/html');
              response.end(html);
            } else if (request.url === '/form-styles-frame') {
              response.setHeader('Content-Type', 'text/html');
              response.end('<!doctype html><html><head><link rel="icon" href="data:,"></head><body style="margin:0;padding:30px 20px"><iframe src="/form-styles" style="display:block;width:960px;height:600px;border:0"></iframe></body></html>');
            } else next();
          } catch (error) { next(error); }
        });
      },
    }],
  });
  await server.listen();
  url = `${server.resolvedUrls.local[0]}form-styles`;
  frameUrl = `${server.resolvedUrls.local[0]}form-styles-frame`;
  browser = await puppeteer.launch({ headless: true });
}, { timeout: 60000 });
after(async () => {
  try { await browser?.close(); }
  finally {
    try { await server?.close(); }
    finally { if (cacheDirectory) await rm(cacheDirectory, { recursive: true, force: true }); }
  }
});

/**
 * Open the form document in a host: the page itself, a 420 px scrolling box in the page,
 * or a 600 px frame. Returns the frame that runs the form and records page errors.
 */
async function openHost(host) {
  const page = await browser.newPage();
  const failures = [];
  page.on('pageerror', error => failures.push(error.message));
  page.on('console', message => { if (message.type() === 'error') failures.push(message.text()); });
  await page.setViewport({ width: 1000, height: 700 });
  await page.goto(host === 'frame' ? frameUrl : url);
  const target = host === 'frame' ? await (await page.waitForSelector('iframe')).contentFrame() : page.mainFrame();
  await target.waitForFunction(() => window.formStylesTest !== undefined);
  if (host === 'box') {
    await target.evaluate(() => {
      const box = document.createElement('div');
      box.id = 'box';
      box.style.cssText = 'height:420px;overflow:auto;margin:20px 40px';
      document.body.style.paddingTop = '0';
      document.body.prepend(box);
      // Content before the form, as the page padding is in the other hosts.
      const before = document.createElement('div');
      before.style.height = '40px';
      box.append(before, document.getElementById('form'));
    });
  }
  return { page, target, failures };
}

const frames = target => target.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

// In the form document: the scroll container, its content top in the viewport and its height.
const containerSource = `(() => {
  const box = document.getElementById('box');
  const scroller = box ?? document.scrollingElement;
  const top = box ? box.getBoundingClientRect().top + box.clientTop : 0;
  const height = box ? box.clientHeight : document.documentElement.clientHeight;
  const probe = document.createElement('div');
  probe.style.height = 'var(--crudui-node-header-height)';
  document.querySelector('.crudui-form').append(probe);
  const token = probe.getBoundingClientRect().height;
  probe.remove();
  return { scroller, top, height, token };
})()`;

for (const host of hosts) {
  test(`${host}: sticky row headers stack on their lines and show their labels only while stuck`, async () => {
    const { page, target, failures } = await openHost(host);
    try {
      await target.evaluate((spec, data) => window.formStylesTest.mount(spec, data), spec, data);
      // Scroll until the deepest row's top is 10 px past its line, under the four pinned ancestor headers.
      await target.evaluate(source => {
        const { scroller, top, token } = eval(source);
        const rows = document.querySelectorAll('.crudui-node--sticky');
        scroller.scrollTop += rows[rows.length - 1].getBoundingClientRect().top - top - (4 * token - 10);
      }, containerSource);
      await frames(target);
      const layout = await target.evaluate(source => {
        const { top, token } = eval(source);
        const headers = [...document.querySelectorAll('.crudui-node--sticky')].map(row => row.firstElementChild);
        const first = headers[0];
        const title = first.querySelector('.crudui-node__title');
        return {
          token,
          headers: headers.map(header => ({
            offset: header.getBoundingClientRect().top - top,
            line: parseFloat(getComputedStyle(header).top),
            height: header.getBoundingClientRect().height,
            label: getComputedStyle(header.querySelector('.crudui-node__label')).display,
          })),
          titleTruncated: title.scrollWidth > title.clientWidth,
          actionRows: new Set([...first.querySelectorAll('.crudui-action')].map(button => Math.round(button.getBoundingClientRect().top))).size,
        };
      }, containerSource);
      assert.deepEqual(failures, []);
      assert.ok(layout.token > 0, 'The header height token resolves');
      assert.equal(layout.headers.length, levels.length);
      for (const [index, header] of layout.headers.entries()) {
        assert.ok(Math.abs(header.height - layout.token) < 0.5, `Level ${index} header height ${header.height} equals ${layout.token}`);
        assert.ok(Math.abs(header.offset - header.line) < 0.5, `Level ${index} header sits on its line: ${header.offset} vs ${header.line}`);
        assert.ok(Math.abs(header.line - (index * layout.token - 1)) < 0.5, `Level ${index} sticky line clears the row border`);
        assert.notEqual(header.label, 'none', `Level ${index} shows its label while stuck`);
      }
      assert.equal(layout.titleTruncated, true, 'A long title is truncated');
      assert.equal(layout.actionRows, 1, 'Header controls stay on one line');

      // Scrolled back to the top, nothing is stuck and the level labels are hidden.
      await target.evaluate(source => { eval(source).scroller.scrollTop = 0; }, containerSource);
      await frames(target);
      const labels = await target.evaluate(() => [...document.querySelectorAll('.crudui-node--sticky > .crudui-node__header > .crudui-node__label')]
        .map(label => getComputedStyle(label).display));
      assert.ok(labels.every(display => display === 'none'), `Level labels are hidden while headers are not stuck: ${labels}`);
    } finally { await page.close(); }
  });

  test(`${host}: focusing a row after an action or a map selection scrolls it clear of the sticky headers and the footer`, async () => {
    const { page, target, failures } = await openHost(host);
    try {
      await target.evaluate((spec, data) => window.formStylesTest.mount(spec, data), spec, siblingData);
      const focused = () => target.evaluate(source => {
        const { top, height } = eval(source);
        const active = document.activeElement;
        const rect = active.getBoundingClientRect();
        const style = getComputedStyle(active);
        return {
          name: active.getAttribute('name'),
          value: active.value,
          offset: rect.top - top,
          bottom: rect.bottom - top,
          marginTop: parseFloat(style.scrollMarginTop),
          marginBottom: parseFloat(style.scrollMarginBottom),
          height,
        };
      }, containerSource);

      // Adding a store after the first one moves focus to the new row far below.
      await target.evaluate(() => {
        const row = [...document.querySelectorAll('#form .crudui-node--sticky')].find(node => node.querySelector('input[name$="[name]"]').value === 'stores one');
        [...row.querySelectorAll('[data-crudui-action="add-row"]')].find(button => button.closest('[data-crudui-row-key]') === row).click();
      });
      await frames(target);
      const added = await focused();
      assert.deepEqual(failures, []);
      assert.match(added.name, /\[stores\]\[[^\]]+\]\[name\]$/, 'Focus moved to the new store row');
      assert.equal(added.value, '', 'The new store row is empty');
      assert.ok(added.marginTop > 0, 'A control in a sticky row keeps a top scroll margin');
      assert.ok(added.offset >= added.marginTop - 0.5, `The new row input is below the pinned headers: ${added.offset} vs ${added.marginTop}`);
      assert.ok(added.bottom <= added.height - added.marginBottom + 0.5, `The new row input is above the footer: ${added.bottom} vs ${added.height - added.marginBottom}`);

      // Scrolled to the end, selecting the first store from the structure map moves focus back
      // up; the browser scrolls its input into view clear of the pinned headers and the footer.
      await target.evaluate(source => { const { scroller } = eval(source); scroller.scrollTop = scroller.scrollHeight; }, containerSource);
      await frames(target);
      await target.evaluate(() => {
        const button = [...document.querySelectorAll('#outline [data-crudui-action="select-row"]')]
          .find(item => item.textContent.includes('stores one'));
        button.click();
      });
      await frames(target);
      const selected = await focused();
      assert.equal(selected.value, 'stores one', 'Map selection focused the first store row');
      assert.ok(selected.offset >= selected.marginTop - 0.5, `The store input is below the pinned headers: ${selected.offset} vs ${selected.marginTop}`);
      assert.ok(selected.bottom <= selected.height - selected.marginBottom + 0.5, `The store input is above the footer: ${selected.bottom} vs ${selected.height - selected.marginBottom}`);
    } finally { await page.close(); }
  });

  test(`${host}: a restored focus keeps its visibility and a moved focus is visible, after pointer or keyboard input`, async () => {
    const { page, target, failures } = await openHost(host);
    try {
      await target.evaluate((spec, data) => window.formStylesTest.mount(spec, data), spec, siblingData);
      const state = () => target.evaluate(() => ({
        action: document.activeElement.getAttribute('data-crudui-action'),
        name: document.activeElement.getAttribute('name'),
        visible: document.activeElement.matches(':focus-visible'),
      }));
      const toggle = () => target.evaluateHandle(() => document.querySelector('#form [data-crudui-action="toggle-row"]'));

      // A pointer press focuses the toggle without visible focus. Every change re-renders the
      // form, so the toggle is a new element and its restored focus stays without it.
      await (await toggle()).click();
      await frames(target);
      const pointerRestored = await state();
      await target.evaluate(() => document.activeElement.click());
      await frames(target);

      // A toggle focused visibly, as from the keyboard, keeps visible focus through the re-render.
      // Focusing the already focused toggle changes nothing, so its focus is released first.
      await target.evaluate(() => {
        const button = document.querySelector('#form [data-crudui-action="toggle-row"]');
        button.blur();
        button.focus({ focusVisible: true });
        button.click();
      });
      await frames(target);
      const keyboardRestored = await state();
      await target.evaluate(() => document.activeElement.click());
      await frames(target);

      // A pointer press on Add moves focus to the new row's first input, visibly.
      const add = await target.evaluateHandle(() => {
        const row = [...document.querySelectorAll('#form .crudui-node--sticky')].find(node => node.querySelector('input[name$="[name]"]')?.value === 'stores one');
        return [...row.querySelectorAll('[data-crudui-action="add-row"]')].find(button => button.closest('[data-crudui-row-key]') === row);
      });
      await add.click();
      await frames(target);
      const moved = await state();

      assert.deepEqual(failures, []);
      assert.deepEqual(pointerRestored, { action: 'toggle-row', name: null, visible: false }, 'A pointer-focused toggle is restored without visible focus');
      assert.deepEqual(keyboardRestored, { action: 'toggle-row', name: null, visible: true }, 'A visibly focused toggle is restored with visible focus');
      assert.match(moved.name ?? '', /\[stores\]\[[^\]]+\]\[name\]$/, 'Focus moved to the new store row');
      assert.equal(moved.visible, true, 'The moved focus is visible');
    } finally { await page.close(); }
  });
}
