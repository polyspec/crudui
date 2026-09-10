import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const entry = '/__crudui_widget_scripts__.mjs';
const moduleId = '\0crudui-widget-scripts';
const types = ['tinymce', 'summernote', 'editorjs', 'tui', 'tagify', 'tagify2', 'search', 'button'];
const rowKey = '__0000000000007__';
const fieldName = type => `필드:'${type}`;
const resource = "https://upload.invalid/자료?q='</script>\u2028line\u2029end";
const properties = Object.fromEntries(types.map(type => [fieldName(type), {
  type,
  label: type,
  items: { a: 'Alpha', b: 'Beta' },
  options: {
    upload: resource,
    fileserver: resource,
    api_server: resource,
    server: resource,
    max_tags: 3,
    keyword_min_length: 2,
    delay: 250,
    callback: 'function(event) { window.recordWidgetScriptEvent("search", this, event); }',
  },
  ...(type === 'button' ? { text: 'Run', behavior: { onclick: 'window.recordWidgetScriptEvent("button", this, arguments[0]);' } } : {}),
}]));
const spec = { type: 'group', properties: { rows: { type: 'group', multiple: true, properties } } };
const data = { rows: { [rowKey]: Object.fromEntries(types.map(type => [fieldName(type), 'a'])) } };
const browserSource = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { compileForm, createForm, buildList } from '@crudui/generator-core';
import { Form, List } from '@crudui/generator-react';

let root, form;
const element = document.getElementById('form');
window.widgetScriptTest = {
  mount(spec, data, idPrefix) {
    const template = compileForm(spec, { keyPrefix: 'form' });
    form = createForm(template, data, { idPrefix, language: 'en' });
    root = createRoot(element);
    flushSync(() => root.render(React.createElement(Form, { form })));
  },
  inject(data) { flushSync(() => form.setData(data)); },
  html() { return element.innerHTML; },
  snapshot() { return { data: form.getData(), fields: form.getSnapshot().fields }; },
  list(spec, rows) {
    const vm = buildList(spec, rows);
    const target = document.createElement('div');
    document.body.append(target);
    const listRoot = createRoot(target);
    flushSync(() => listRoot.render(React.createElement(List, { vm })));
    const snapshot = { model: vm, html: target.innerHTML, text: target.textContent };
    flushSync(() => listRoot.unmount());
    target.remove();
    return snapshot;
  },
  unmount() { flushSync(() => root.unmount()); },
};
`;

let server, browser, url, cacheDirectory;
before(async () => {
  cacheDirectory = await mkdtemp(join(tmpdir(), 'crudui-widget-scripts-'));
  server = await createServer({
    root, configFile: false, logLevel: 'error', cacheDir: cacheDirectory,
    optimizeDeps: {
      noDiscovery: true,
      include: ['react', 'react-dom', 'react-dom/client', '@crudui/generator-core', '@crudui/generator-react'],
    },
    server: { host: '127.0.0.1', port: 0 },
    plugins: [{
      name: 'widget-script-test',
      resolveId(id) { if (id === entry) return moduleId; },
      load(id) { if (id === moduleId) return browserSource; },
      configureServer(vite) {
        vite.middlewares.use(async (request, response, next) => {
          if (request.url !== '/widget-scripts') return next();
          try {
            const html = await vite.transformIndexHtml('/widget-scripts', `<!doctype html><html><head><link rel="icon" href="data:,"></head><body><form id="form"></form><aside id="host-results"></aside><script type="module" src="${entry}"></script></body></html>`);
            response.setHeader('Content-Type', 'text/html');
            response.end(html);
          } catch (error) { next(error); }
        });
      },
    }],
  });
  await server.listen();
  url = `${server.resolvedUrls.local[0]}widget-scripts`;
  browser = await puppeteer.launch({
    headless: true,
    args: process.platform === 'linux' && process.getuid?.() === 0 ? ['--no-sandbox'] : [],
  });
}, { timeout: 60000 });
after(async () => {
  try { await browser?.close(); }
  finally {
    try { await server?.close(); }
    finally { if (cacheDirectory) await rm(cacheDirectory, { recursive: true, force: true }); }
  }
});

test('limits Vite dependency optimization to the declared widget packages', () => {
  assert.equal(server.config.optimizeDeps.noDiscovery, true);
});

async function openPage(timezone) {
  const page = await browser.newPage();
  const errors = [], loadFailures = [], consoleErrors = [];
  let rejectInitialization;
  const failedInitialization = new Promise((_, reject) => { rejectInitialization = reject; });
  page.on('pageerror', error => { errors.push(error.message); rejectInitialization(error); });
  page.on('response', response => {
    if (response.status() < 400) return;
    loadFailures.push({ url: response.url(), status: response.status() });
    if (response.request().resourceType() === 'script') rejectInitialization(new Error(`Module request failed: ${response.status()} ${response.url()}`));
  });
  page.on('requestfailed', request => {
    loadFailures.push({ url: request.url(), failure: request.failure()?.errorText });
    if (request.resourceType() === 'script') rejectInitialization(new Error(`Module request failed: ${request.url()}`));
  });
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  try {
    if (timezone) await page.emulateTimezone(timezone);
    await Promise.race([
      page.goto(url).then(() => page.waitForFunction(() => window.widgetScriptTest !== undefined)),
      failedInitialization,
    ]);
  } catch (error) {
    await page.close();
    assert.fail(`Widget test initialization failed: ${error.message}; ${JSON.stringify({ errors, loadFailures, consoleErrors })}`);
  }
  return { page, errors };
}

async function activateAndInspect(page) {
  return page.evaluate(() => {
    const root = document.getElementById('form');
    const calls = [], events = [], registrations = [];
    const assert = (condition, message) => { if (!condition) throw new Error(message); };
    const inspect = (helper, selector, args) => {
      const controls = document.querySelectorAll(selector);
      assert(controls.length === 1, helper + ' must select exactly one control');
      const control = controls[0];
      assert(root.contains(control), helper + ' selected a control outside the form');
      calls.push({ helper, selector, id: control.id, name: control.name, tag: control.tagName, args });
      return control;
    };
    // These host helpers verify selector delivery; external editor packages are not loaded.
    for (const helper of ['editor_tinymce', 'editor_summernote', 'editor_editorjs', 'editor_tui', 'editor_tagify', 'editor_tagify2']) {
      window[helper] = (selector, ...args) => inspect(helper, selector, args);
    }
    window.select2 = (escapedId, minimum, delay, className) => {
      const control = inspect('select2', '#' + escapedId, [minimum, delay, className]);
      assert(className === control.id + '_select2', 'Search helper received the wrong class');
      const host = document.createElement('span');
      host.className = className;
      const result = document.createElement('span');
      result.className = 'loading-results';
      host.append(result);
      document.getElementById('host-results').append(host);
      assert(getComputedStyle(result).display === 'none', 'Search CSS did not select the generated class');
    };
    window.recordWidgetScriptEvent = (kind, control, event) => {
      assert(root.contains(control), kind + ' callback selected a control outside the form');
      assert(event.target === control, kind + ' callback received the wrong event target');
      events.push({ kind, id: control.id, name: control.name, event: event.type });
    };
    window.$ = value => {
      if (typeof value === 'function') { value(); return; }
      assert(value instanceof Element && root.contains(value), 'A generated callback must register on its actual control');
      return { on(type, callback) {
        assert(typeof callback === 'function', 'A generated callback must be callable');
        registrations.push({ type, id: value.id });
        value.addEventListener(type, callback);
      } };
    };
    const scripts = [...root.querySelectorAll('script')];
    assert(scripts.length === 8, 'All eight widget scripts must be present');
    // The host activates the generated scripts after rendering the controls.
    for (const source of scripts) {
      const executable = document.createElement('script');
      executable.textContent = source.textContent;
      document.head.append(executable);
      executable.remove();
    }
    root.querySelector('select').dispatchEvent(new CustomEvent('select2:select', { bubbles: true }));
    root.querySelector('input[type="button"]').click();
    return { calls, events, registrations, scripts: scripts.length };
  });
}

for (const prefix of ["form scope:'한글", "another:'日本語:scope"]) {
  test(`script widgets select controls with scope ${JSON.stringify(prefix)}`, { timeout: 60000 }, async () => {
    const { page, errors } = await openPage();
    try {
      let initialHtml;
      for (const phase of ['initial', 'injected']) {
        const html = await page.evaluate(({ spec, data, prefix, phase }) => {
          window.widgetScriptTest.mount(spec, phase === 'initial' ? data : {}, prefix);
          if (phase === 'injected') window.widgetScriptTest.inject(data);
          return window.widgetScriptTest.html();
        }, { spec, data, prefix, phase });
        if (phase === 'initial') initialHtml = html;
        else assert.equal(html, initialHtml, 'Initial and injected React HTML must be identical');
        const result = await activateAndInspect(page);
        const id = type => `${encodeURIComponent(prefix)}:${encodeURIComponent(`rows.${rowKey}.${fieldName(type)}`)}`;
        const name = type => `${type === 'button' ? 'btn' : ''}form[rows][${rowKey}][${fieldName(type)}]`;
        assert.equal(result.scripts, 8);
        assert.deepEqual(result.calls.map(call => call.helper), [...types.slice(0, 6).map(type => `editor_${type}`), 'select2']);
        for (const [index, call] of result.calls.entries()) {
          const type = types[index];
          assert.equal(call.id, id(type));
          assert.equal(call.name, name(type));
          assert.equal(call.tag, index < 4 ? 'TEXTAREA' : type === 'search' ? 'SELECT' : 'INPUT');
          assert.ok(call.selector.startsWith('#'));
        }
        assert.deepEqual(result.calls.map(call => call.args), [
          [300, resource, false], [resource], [resource], [resource], [3], [3, resource], ['2', '250', id('search') + '_select2'],
        ]);
        assert.deepEqual(result.registrations, [{ type: 'select2:select', id: id('search') }, { type: 'click', id: id('button') }]);
        assert.deepEqual(result.events, [
          { kind: 'search', id: id('search'), name: name('search'), event: 'select2:select' },
          { kind: 'button', id: id('button'), name: name('button'), event: 'click' },
        ]);
        assert.deepEqual(errors, [], 'Generated scripts must execute without browser errors');
        await page.evaluate(() => { window.widgetScriptTest.unmount(); document.getElementById('host-results').replaceChildren(); });
      }
    } finally { await page.close(); }
  });
}

test('date models and rendered HTML are identical across browser timezones', { timeout: 60000 }, async () => {
  const cases = [
    ['2026-09-09T03:04:05+09:00', '2026-09-08', '2026-09-08T18:04:05'],
    ['2026-09-09T23:04:05-07:00', '2026-09-10', '2026-09-10T06:04:05'],
    ['2026-09-09 03:04:05.999999999', '2026-09-09', '2026-09-09T03:04:05'],
    ['2026-09-09', '2026-09-09', '2026-09-09T00:00:00'],
    ['Wed, 09 Sep 2026 03:04:05 +0900', '2026-09-08', '2026-09-08T18:04:05'],
    ['9 sep 2026 23:04:05 pdt', '2026-09-10', '2026-09-10T06:04:05'],
    ['2026-02-29T03:04:05', '2026-02-29T03:04:05', '2026-02-29T03:04:05'],
    ['2026-09-09T03:04junk', '2026-09-09T03:04junk', '2026-09-09T03:04junk'],
  ];
  const spec = { type: 'group', properties: { day: { type: 'date' }, time: { type: 'datetime' } } };
  const listSpec = { columns: { time: { field: '.time', format: { type: 'date', pattern: 'YYYY-MM-DDTHH:mm:ss' } } } };
  const baseline = new Map();
  for (const timezone of ['UTC', 'Asia/Seoul', 'America/Los_Angeles']) {
    const { page, errors } = await openPage(timezone);
    try {
      assert.equal(await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone), timezone);
      for (const [input, date, datetime] of cases) {
        const data = { day: input, time: input };
        let initial;
        for (const phase of ['initial', 'injected']) {
          const result = await page.evaluate(({ spec, listSpec, data, phase }) => {
            const test = window.widgetScriptTest;
            test.mount(spec, phase === 'initial' ? data : {}, 'utc-dates');
            if (phase === 'injected') test.inject(data);
            const result = {
              ...test.snapshot(),
              html: test.html(),
              values: [...document.querySelectorAll('#form input')].map(input => input.getAttribute('value')),
              list: test.list(listSpec, [test.snapshot().data]),
            };
            test.unmount();
            return result;
          }, { spec, listSpec, data, phase });
          assert.deepEqual(result.data, data);
          assert.deepEqual(result.values, [date, datetime]);
          assert.equal(result.fields[0].widget.attrs.value, date);
          assert.equal(result.fields[1].widget.attrs.value, datetime);
          assert.equal(result.list.model.rows[0].cells[0].display, datetime);
          assert.ok(result.list.text.includes(datetime));
          if (phase === 'initial') initial = result;
          else assert.deepEqual(result, initial, `${timezone}: initial and injected date rendering must match`);
          if (timezone === 'UTC') baseline.set(`${input}:${phase}`, result);
          else assert.deepEqual(result, baseline.get(`${input}:${phase}`), `${timezone}: date rendering must match UTC`);
        }
      }
      assert.deepEqual(errors, []);
    } finally { await page.close(); }
  }
});
