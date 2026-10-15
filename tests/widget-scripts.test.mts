import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import { createServer, type ViteDevServer } from 'vite';

import { setup, teardown } from '@polyspec/kit/test-hooks';

const root = fileURLToPath(new URL('..', import.meta.url));
const entry = '/__crudui_widget_scripts__.mjs';
const moduleId = '\0crudui-widget-scripts';
const types = ['tinymce', 'summernote', 'editorjs', 'tui', 'tagify', 'tagify2', 'search', 'button'];
const rowKey = '__0000000000007__';
/** A helper call that the host page recorded. */
interface WidgetCall { helper: string; selector: string; id: string; name: string; tag: string; args: unknown[] }

/** What the host page's helpers record (hostSource). */
interface WidgetScriptRecord {
  calls: WidgetCall[];
  events: { kind: string; id: string; name: string; event: string }[];
  registrations: { type: string; id: string }[];
  errors: string[];
}

/** The calls of the page module (browserSource). */
interface WidgetScriptTest {
  mount(spec: unknown, data: unknown, idPrefix: string): void;
  inject(data: unknown): void;
  html(): string;
  snapshot(): { data: unknown; fields: { widget: { attrs: { value?: unknown } } }[] };
  list(spec: unknown, rows: unknown[]): { model: { rows: { cells: { display: unknown }[] }[] }; html: string; text: string };
  unmount(): void;
}

/** A control that a generated script hands to a host helper. */
type WidgetControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement;
/** A host helper of an editor package, which the generated scripts call with the control's selector. */
type EditorHelper = (selector: string, ...args: unknown[]) => WidgetControl | undefined;

declare global {
  interface Window {
    widgetScriptTest: WidgetScriptTest;
    widgetScriptRecord: WidgetScriptRecord;
    editor_tinymce: EditorHelper;
    editor_summernote: EditorHelper;
    editor_editorjs: EditorHelper;
    editor_tui: EditorHelper;
    editor_tagify: EditorHelper;
    editor_tagify2: EditorHelper;
    select2: (escapedId: string, minimum: string, delay: string, className: string) => void;
    recordWidgetScriptEvent: (kind: string, control: WidgetControl, event: Event) => void;
    $: (value: (() => void) | Element) => { on(type: string, callback: EventListener): void } | undefined;
  }
}

/** A failure the page reports: an error, a failed response, a failed request or a console error. */
type Failure =
  | { type: 'page' | 'console'; message: string }
  | { type: 'response'; url: string; status: number }
  | { type: 'request'; url: string; message: string | undefined };

const fieldName = (type: string) => `필드:'${type}`;
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
  ...(type === 'button' ? { content: 'Run', behavior: { onclick: 'window.recordWidgetScriptEvent("button", this, arguments[0]);' } } : {}),
}]));
const spec = { type: 'group', properties: { rows: { type: 'group', multiple: true, properties } } };
const data = { rows: { [rowKey]: Object.fromEntries(types.map(type => [fieldName(type), 'a'])) } };
const browserSource = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { compileForm, createForm, buildList } from '@polyspec/crudui-generator-core';
import { Form, List } from '@polyspec/crudui-generator-react';

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

let server: ViteDevServer | undefined, browser: Browser | undefined, url: string, cacheDirectory: string | undefined;
setup('server start and browser launch', async () => {
  cacheDirectory = await mkdtemp(join(tmpdir(), 'crudui-widget-scripts-'));
  server = await createServer({
    root, configFile: false, logLevel: 'error', cacheDir: cacheDirectory,
    optimizeDeps: {
      noDiscovery: true,
      include: ['react', 'react-dom', 'react-dom/client', '@polyspec/crudui-generator-core', '@polyspec/crudui-generator-react'],
    },
    server: { host: '127.0.0.1', port: 0, watch: null },
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
  assert.ok(server.resolvedUrls, 'the server listens');
  url = `${server.resolvedUrls.local[0]}widget-scripts`;
  browser = await puppeteer.launch({ headless: true });
});
teardown('browser close', () => browser?.close());
teardown('server stop', () => server?.close());
teardown('cache removal', () => cacheDirectory && rm(cacheDirectory, { recursive: true, force: true }));

// The dev server watches no file (C14.47): with a watcher on the repository root, Vite answered every change of a
// tsconfig file under it, such as those that mise writes under var/tools/mise/state for other checkouts, with a cleared
// cache and a full reload of the page, which destroyed the context of a running check.
test('the dev server watches no file, so no change of the checkout reloads the page', () => {
  assert.ok(server, 'the server is started');
  assert.equal(server.config.server.watch, null);
});

test('limits Vite dependency optimization to the declared widget packages', () => {
  assert.ok(server, 'the server is started');
  assert.equal(server.config.optimizeDeps.noDiscovery, true);
});

test('records console errors after widget initialization', async () => {
  const { page, failures } = await openPage();
  try {
    const observed = new Promise(resolve => page.once('console', resolve));
    await page.evaluate(() => console.error('widget failure after initialization'));
    await observed;
    assert.deepEqual(failures, [{
      type: 'console', message: 'widget failure after initialization',
    }]);
  } finally { await page.close(); }
});

async function openPage(timezone?: string): Promise<{ page: Page; failures: Failure[] }> {
  assert.ok(browser, 'the browser is launched');
  const page = await browser.newPage();
  const failures: Failure[] = [];
  const { promise: failedInitialization, reject: rejectInitialization } = Promise.withResolvers<never>();
  page.on('pageerror', error => {
    failures.push({ type: 'page', message: error instanceof Error ? error.message : String(error) });
    rejectInitialization(error);
  });
  page.on('response', response => {
    if (response.status() < 400) return;
    failures.push({ type: 'response', url: response.url(), status: response.status() });
    if (response.request().resourceType() === 'script') rejectInitialization(new Error(`Module request failed: ${response.status()} ${response.url()}`));
  });
  page.on('requestfailed', request => {
    failures.push({ type: 'request', url: request.url(), message: request.failure()?.errorText });
    if (request.resourceType() === 'script') rejectInitialization(new Error(`Module request failed: ${request.url()}`));
  });
  page.on('console', message => {
    if (message.type() === 'error') failures.push({ type: 'console', message: message.text() });
  });
  try {
    if (timezone) await page.emulateTimezone(timezone);
    await Promise.race([
      page.goto(url).then(() => page.waitForFunction(() => window.widgetScriptTest !== undefined)),
      failedInitialization,
    ]);
  } catch (error) {
    await page.close();
    assert.fail(`Widget test initialization failed: ${error instanceof Error ? error.message : String(error)}; ${JSON.stringify(failures)}`);
  }
  return { page, failures };
}

// The host page's helpers, installed before the form is mounted: the form's scripts run once when
// their markup is inserted.
const hostSource = (): void => {
  const root = document.getElementById('form');
  if (!root) throw new Error('the page has no form');
  const record: WidgetScriptRecord = window.widgetScriptRecord = { calls: [], events: [], registrations: [], errors: [] };
  const check = (condition: boolean, message: string) => { if (!condition) record.errors.push(message); return condition; };
  const inspect = (helper: string, selector: string, args: unknown[]) => {
    // The generated scripts select form controls.
    const controls = document.querySelectorAll<WidgetControl>(selector);
    if (!check(controls.length === 1, helper + ' must select exactly one control')) return undefined;
    const control = controls.item(0);
    check(root.contains(control), helper + ' selected a control outside the form');
    record.calls.push({ helper, selector, id: control.id, name: control.name, tag: control.tagName, args });
    return control;
  };
  // These host helpers verify selector delivery; external editor packages are not loaded.
  for (const helper of ['editor_tinymce', 'editor_summernote', 'editor_editorjs', 'editor_tui', 'editor_tagify', 'editor_tagify2'] as const) {
    window[helper] = (selector, ...args) => inspect(helper, selector, args);
  }
  window.select2 = (escapedId, minimum, delay, className) => {
    const control = inspect('select2', '#' + escapedId, [minimum, delay, className]);
    if (!control) return;
    check(className === control.id + '_select2', 'Search helper received the wrong class');
    const host = document.createElement('span');
    host.className = className;
    const result = document.createElement('span');
    result.className = 'loading-results';
    host.append(result);
    const results = document.getElementById('host-results');
    if (!results) throw new Error('the page has no host results');
    results.append(host);
    check(getComputedStyle(result).display === 'none', 'Search CSS did not select the generated class');
  };
  window.recordWidgetScriptEvent = (kind, control, event) => {
    check(root.contains(control), kind + ' callback selected a control outside the form');
    check(event.target === control, kind + ' callback received the wrong event target');
    record.events.push({ kind, id: control.id, name: control.name, event: event.type });
  };
  window.$ = value => {
    if (typeof value === 'function') { value(); return; }
    check(value instanceof Element && root.contains(value), 'A generated callback must register on its actual control');
    return { on(type, callback) {
      check(typeof callback === 'function', 'A generated callback must be callable');
      record.registrations.push({ type, id: value.id });
      value.addEventListener(type, callback);
    } };
  };
};

async function inspectScripts(page: Page) {
  return page.evaluate(() => {
    const root = document.getElementById('form');
    if (!root) throw new Error('the page has no form');
    const record = window.widgetScriptRecord;
    const select = root.querySelector('select');
    if (!select) throw new Error('the form has no select');
    select.dispatchEvent(new CustomEvent('select2:select', { bubbles: true }));
    const button = root.querySelector<HTMLButtonElement>('button[onclick]');
    if (!button) throw new Error('the form has no script button');
    button.click();
    return { ...record, scripts: root.querySelectorAll('script').length };
  });
}

for (const prefix of ["form scope:'한글", "another:'日本語:scope"]) {
  test(`script widgets select controls with scope ${JSON.stringify(prefix)}`, { timeout: 60000 }, async () => {
    const { page, failures } = await openPage();
    try {
      let initialHtml: string | undefined;
      for (const phase of ['initial', 'injected']) {
        await page.evaluate(hostSource);
        const { html, defaultRowCalls } = await page.evaluate(({ spec, data, prefix, phase }: { spec: unknown; data: unknown; prefix: string; phase: string }) => {
          window.widgetScriptTest.mount(spec, phase === 'initial' ? data : {}, prefix);
          let defaultRowCalls: string[] | undefined;
          if (phase === 'injected') {
            // The empty form's default row ran its scripts; the injected row runs its own.
            const record = window.widgetScriptRecord;
            defaultRowCalls = record.calls.map(call => call.helper);
            record.calls.length = 0;
            record.registrations.length = 0;
            window.widgetScriptTest.inject(data);
          }
          return { html: window.widgetScriptTest.html(), defaultRowCalls };
        }, { spec, data, prefix, phase });
        if (phase === 'injected') {
          assert.deepEqual(defaultRowCalls, [...types.slice(0, 6).map(type => `editor_${type}`), 'select2']);
        }
        if (phase === 'initial') initialHtml = html;
        else assert.equal(html, initialHtml, 'Initial and injected React HTML must be identical');
        const result = await inspectScripts(page);
        assert.deepEqual(result.errors, []);
        const id = (type: string) => `${encodeURIComponent(prefix)}:${encodeURIComponent(`rows.${rowKey}.${fieldName(type)}`)}`;
        const name = (type: string) => `form[rows][${rowKey}][${fieldName(type)}]`;
        // A button field has no script: its onclick attribute runs on a click, and the button has no name.
        assert.equal(result.scripts, 7);
        assert.deepEqual(result.calls.map(call => call.helper), [...types.slice(0, 6).map(type => `editor_${type}`), 'select2']);
        for (const [index, call] of result.calls.entries()) {
          const type = types[index];
          assert.ok(type !== undefined, `call ${index} has a widget type`);
          assert.equal(call.id, id(type));
          assert.equal(call.name, name(type));
          assert.equal(call.tag, index < 4 ? 'TEXTAREA' : type === 'search' ? 'SELECT' : 'INPUT');
          assert.ok(call.selector.startsWith('#'));
        }
        assert.deepEqual(result.calls.map(call => call.args), [
          [300, resource, false], [resource], [resource], [resource], [3], [3, resource], ['2', '250', id('search') + '_select2'],
        ]);
        assert.deepEqual(result.registrations, [{ type: 'select2:select', id: id('search') }]);
        assert.deepEqual(result.events, [
          { kind: 'search', id: id('search'), name: name('search'), event: 'select2:select' },
          { kind: 'button', id: id('button'), name: '', event: 'click' },
        ]);
        assert.deepEqual(failures, [], 'Generated scripts must execute without browser errors');
        await page.evaluate(() => {
          window.widgetScriptTest.unmount();
          const results = document.getElementById('host-results');
          if (!results) throw new Error('the page has no host results');
          results.replaceChildren();
        });
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
  ] satisfies [string, string, string][];
  const spec = { type: 'group', properties: { day: { type: 'date' }, time: { type: 'datetime' } } };
  const listSpec = { columns: { time: { field: 'time', format: { type: 'date', pattern: 'YYYY-MM-DDTHH:mm:ss' } } } };
  const baseline = new Map<string, unknown>();
  for (const timezone of ['UTC', 'Asia/Seoul', 'America/Los_Angeles']) {
    const { page, failures } = await openPage(timezone);
    try {
      assert.equal(await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone), timezone);
      for (const [input, date, datetime] of cases) {
        const data = { day: input, time: input };
        let initial: unknown;
        for (const phase of ['initial', 'injected']) {
          const result = await page.evaluate(({ spec, listSpec, data, phase }: { spec: unknown; listSpec: unknown; data: unknown; phase: string }) => {
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
          assert.equal(result.fields[0]?.widget.attrs.value, date);
          assert.equal(result.fields[1]?.widget.attrs.value, datetime);
          assert.equal(result.list.model.rows[0]?.cells[0]?.display, datetime);
          assert.ok(result.list.text.includes(datetime));
          if (phase === 'initial') initial = result;
          else assert.deepEqual(result, initial, `${timezone}: initial and injected date rendering must match`);
          if (timezone === 'UTC') baseline.set(`${input}:${phase}`, result);
          else assert.deepEqual(result, baseline.get(`${input}:${phase}`), `${timezone}: date rendering must match UTC`);
        }
      }
      assert.deepEqual(failures, [], 'Date rendering must complete without browser errors');
    } finally { await page.close(); }
  }
});
