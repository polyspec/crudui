// Widget and raw-content scripts run once, when their markup first appears, in every renderer
// and in Chromium, Firefox and WebKit: a server-rendered script runs as the page is parsed and
// never again on hydration; a client-rendered script, and one in a newly added row or list row,
// runs when it is inserted; a re-render, a patch or a move never runs a kept script again. jsdom
// runs cloned scripts, which browsers never run, so only real browsers decide this rule.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { createServer } from 'vite';
import { engineDrivers, engines } from './browser-engines.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const clientEntry = '/__crudui_script_runs__.mjs';
const serverEntry = '/__crudui_script_runs_server__.mjs';
const viewHost = '/packages/generator-svelte/test/ViewHost.svelte';
const adapters = ['html', 'react', 'vue', 'svelte'];
const modes = ['client', 'server'];
const first = '__0000000000001__';

const scenario = {
  spec: {
    type: 'group',
    properties: {
      rows: {
        type: 'group', label: 'Rows', multiple: { copy: true, sortable: true },
        properties: { name: { type: 'text', label: 'Name' }, body: { type: 'tinymce', label: 'Body' } },
      },
    },
  },
  data: { rows: { [first]: { name: 'A', body: 'Text' } } },
  listSpec: { columns: { name: { field: 'name', label: 'Name' }, note: { field: 'note', label: 'Note', format: { type: 'html' } } } },
  row: tag => ({ name: tag, note: `<b>${tag}</b><script nonce="">scriptRuns.push(${JSON.stringify(`cell:${tag}`)})</script>` }),
};

// Shared by the server and the browser modules.
const shared = `
const scenario = ${JSON.stringify({ ...scenario, row: undefined })};
const row = ${scenario.row.toString()};
const listRows = tags => tags.map(row);
const createSession = () => createForm(compileForm(scenario.spec, { keyPrefix: 'form' }), scenario.data, { language: 'en' });
`;

const serverSource = `
import React from 'react';
import { renderToString } from 'react-dom/server';
import { createSSRApp, h } from 'vue';
import { renderToString as renderVue } from 'vue/server-renderer';
import { render as renderSvelte } from 'svelte/server';
import { writable } from 'svelte/store';
import { buildList, compileForm, createForm } from '@crudui/generator-core';
import { renderForm as htmlForm, renderList as htmlList } from '@crudui/generator-html';
import { Form as ReactForm, List as ReactList } from '@crudui/generator-react';
import { Form as VueForm, List as VueList } from '@crudui/generator-vue';
import { Form as SvelteForm } from '@crudui/generator-svelte';
import ViewHost from '${viewHost}';
${shared}
export async function render(adapter) {
  const form = createSession();
  const rows = listRows(['one']);
  if (adapter === 'html') return { form: htmlForm(form), list: htmlList(scenario.listSpec, rows) };
  if (adapter === 'react') {
    return {
      form: renderToString(React.createElement(ReactForm, { form })),
      list: renderToString(React.createElement(ReactList, { vm: buildList(scenario.listSpec, rows) })),
    };
  }
  if (adapter === 'vue') {
    return {
      form: await renderVue(createSSRApp({ render: () => h(VueForm, { form }) })),
      list: await renderVue(createSSRApp({ render: () => VueList(buildList(scenario.listSpec, rows)) })),
    };
  }
  const source = writable({ kind: 'list', layout: 'table', spec: scenario.listSpec, data: rows });
  return {
    form: renderSvelte(SvelteForm, { props: { form } }).body,
    list: renderSvelte(ViewHost, { props: { source } }).body,
  };
}
`;

const clientSource = `
import React from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { createApp, createSSRApp, h, shallowRef } from 'vue';
import { hydrate, mount } from 'svelte';
import { writable } from 'svelte/store';
import { buildList, compileForm, connectForm, createForm, patchContent } from '@crudui/generator-core';
import { renderForm as htmlForm, renderList as htmlList } from '@crudui/generator-html';
import { Form as ReactForm, List as ReactList } from '@crudui/generator-react';
import { Form as VueForm, List as VueList } from '@crudui/generator-vue';
import { Form as SvelteForm } from '@crudui/generator-svelte';
import ViewHost from '${viewHost}';
${shared}
const parameters = new URLSearchParams(location.search);
const adapter = parameters.get('adapter');
const server = parameters.get('mode') === 'server';
const formElement = document.getElementById('form');
const listElement = document.getElementById('list');
const form = createSession();

function start() {
  if (adapter === 'html') {
    if (!server) patchContent(formElement, htmlForm(form));
    const connection = connectForm(formElement, form);
    form.subscribe(() => { patchContent(formElement, htmlForm(form)); connection.sync(); });
    if (!server) patchContent(listElement, htmlList(scenario.listSpec, listRows(['one'])));
    return tags => patchContent(listElement, htmlList(scenario.listSpec, listRows(tags)));
  }
  if (adapter === 'react') {
    const formNode = React.createElement(ReactForm, { form });
    const listNode = tags => React.createElement(ReactList, { vm: buildList(scenario.listSpec, listRows(tags)) });
    let list;
    flushSync(() => {
      if (server) { hydrateRoot(formElement, formNode); list = hydrateRoot(listElement, listNode(['one'])); }
      else { createRoot(formElement).render(formNode); list = createRoot(listElement); list.render(listNode(['one'])); }
    });
    return tags => flushSync(() => list.render(listNode(tags)));
  }
  if (adapter === 'vue') {
    const tags = shallowRef(['one']);
    const create = server ? createSSRApp : createApp;
    create({ render: () => h(VueForm, { form }) }).mount(formElement);
    create({ render: () => VueList(buildList(scenario.listSpec, listRows(tags.value))) }).mount(listElement);
    return next => { tags.value = next; };
  }
  const source = writable({ kind: 'list', layout: 'table', spec: scenario.listSpec, data: listRows(['one']) });
  const place = server ? hydrate : mount;
  place(SvelteForm, { target: formElement, props: { form } });
  place(ViewHost, { target: listElement, props: { source } });
  return tags => source.set({ kind: 'list', layout: 'table', spec: scenario.listSpec, data: listRows(tags) });
}

const frames = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 0))));
const showList = start();
const button = (key, action) => formElement.querySelector('[data-crudui-row-key="' + key + '"] [data-crudui-action="' + action + '"]');
const record = async () => {
  await frames();
  const kept = window.parsedControl ? formElement.contains(window.parsedControl) : null;
  return { runs: [...scriptRuns], keys: Object.keys(form.getData().rows), kept };
};

window.scriptRunsTest = {
  started: record,
  async type() {
    const input = formElement.querySelector('input[name="form[rows][${first}][name]"]');
    input.focus();
    for (const character of 'bcd') {
      input.value += character;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await frames();
    }
    return record();
  },
  async act(action) { button('${first}', action).click(); return record(); },
  async reload() { form.setData(form.getData()); return record(); },
  async list(tags) { showList(tags); return record(); },
};
`;

const page = (body, adapter, mode) => `<!doctype html><html><head><link rel="icon" href="data:,"><script>
window.scriptRuns = [];
window.$ = value => { if (typeof value === 'function') value(); return { on() {} }; };
window.editor_tinymce = selector => { scriptRuns.push('row:' + /__[0-9a-z]+__/.exec(decodeURIComponent(selector))[0]); };
</script></head><body>${body}<script>window.parsedControl = document.querySelector('#form textarea');</script><script type="module" src="${clientEntry}?adapter=${adapter}&mode=${mode}"></script></body></html>`;

let server, url, cacheDirectory;
const browsers = {};
before(async () => {
  cacheDirectory = await mkdtemp(join(tmpdir(), 'crudui-script-runs-'));
  server = await createServer({
    root, configFile: false, logLevel: 'error', cacheDir: cacheDirectory,
    optimizeDeps: {
      noDiscovery: true,
      include: ['react', 'react-dom', 'react-dom/client', 'vue', '@crudui/generator-core', '@crudui/generator-html', '@crudui/generator-react', '@crudui/generator-vue'],
    },
    server: { host: '127.0.0.1', port: 0 },
    plugins: [svelte({ configFile: false }), {
      name: 'script-runs-test',
      resolveId(id) {
        const path = id.split('?')[0];
        if (path === clientEntry) return '\0script-runs-client.mjs';
        if (path === serverEntry) return '\0script-runs-server.mjs';
      },
      load(id) {
        if (id === '\0script-runs-client.mjs') return clientSource;
        if (id === '\0script-runs-server.mjs') return serverSource;
      },
      configureServer(vite) {
        vite.middlewares.use(async (request, response, next) => {
          const address = new URL(request.url, 'http://localhost');
          if (address.pathname !== '/script-runs') return next();
          try {
            const adapter = address.searchParams.get('adapter');
            const mode = address.searchParams.get('mode');
            let form = '', list = '';
            if (mode === 'server') ({ form, list } = await (await vite.ssrLoadModule(serverEntry)).render(adapter));
            const body = `<form id="form">${form}</form><div id="list">${list}</div>`;
            response.setHeader('Content-Type', 'text/html');
            response.end(await vite.transformIndexHtml(request.url, page(body, adapter, mode)));
          } catch (error) { next(error); }
        });
      },
    }],
  });
  await server.listen();
  url = `${server.resolvedUrls.local[0]}script-runs`;
  for (const engine of engines) browsers[engine] = await engineDrivers[engine].launch();
}, { timeout: 120000 });
after(async () => {
  try { await Promise.all(Object.values(browsers).map(browser => browser.close())); }
  finally {
    try { await server?.close(); }
    finally { if (cacheDirectory) await rm(cacheDirectory, { recursive: true, force: true }); }
  }
});

const sorted = values => [...values].sort();

for (const engine of engines) for (const adapter of adapters) for (const mode of modes) {
  test(`${engine} ${adapter} ${mode}: each script runs once, when its markup first appears`, { timeout: 60000 }, async () => {
    const tab = await engineDrivers[engine].open(browsers[engine], { width: 1000, height: 700 });
    const failures = [];
    tab.on('pageerror', error => failures.push(error.message));
    tab.on('console', message => { if (message.type() === 'error') failures.push(message.text()); });
    try {
      await tab.goto(`${url}?adapter=${adapter}&mode=${mode}`);
      const frame = tab.mainFrame();
      await frame.waitForFunction(() => window.scriptRunsTest !== undefined, { timeout: 30000 });
      const call = (name, argument) => frame.evaluate(([name, argument]) => window.scriptRunsTest[name](argument), [name, argument]);
      const runs = [`row:${first}`, 'cell:one'];
      const expectRuns = (state, step) => assert.deepEqual(sorted(state.runs), sorted(runs), `${step}: ${JSON.stringify(state.runs)}`);

      const started = await call('started');
      // Hydration keeps the parsed nodes; a client render has none.
      assert.equal(started.kept, mode === 'server' ? true : null);
      expectRuns(started, 'first render');
      expectRuns(await call('type'), 'typing');
      let state = await call('act', 'add-row');
      runs.push(`row:${state.keys.find(key => !runs.includes(`row:${key}`))}`);
      expectRuns(state, 'adding a row');
      state = await call('act', 'copy-row');
      runs.push(`row:${state.keys.find(key => !runs.includes(`row:${key}`))}`);
      expectRuns(state, 'copying a row');
      expectRuns(await call('act', 'move-down'), 'moving a row');
      expectRuns(await call('reload'), 'loading the same data');
      expectRuns(await call('list', ['one']), 'showing the same list');
      runs.push('cell:two');
      expectRuns(await call('list', ['one', 'two']), 'adding a list row');
      expectRuns(await call('list', ['two', 'one']), 'reordering list rows');
      assert.equal(new Set(runs).size, 5);
      assert.deepEqual(failures, [], 'Scripts must run without browser errors');
    } finally { await tab.close(); }
  });
}
