// Chromium layout checks for the core stylesheet (@crudui/generator-core/crudui.css).
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

// Two stores, the second like the reference form's 판교점 after 강남점 with its nested rows.
const second = '__0000000000002__';
const siblingData = { [levels[0]]: { [key]: { ...levelData(0)[key], name: 'ACME', stores: { ...levelData(1), [second]: { name: 'Pangyo', note: '', departments: {} } } } } };

// Short rows without notes, so the last row is shorter than the viewport.
function shortLevel(index) {
  const properties = { name: { type: 'text', label: 'Name' } };
  if (index + 1 < 3) properties[levels[index + 1]] = shortLevel(index + 1);
  return { type: 'group', label: levels[index], multiple: { header: 'sticky', title: 'name' }, properties };
}
const shortSpec = { type: 'group', properties: { [levels[0]]: shortLevel(0) } };
const shortData = { [levels[0]]: { [key]: { name: 'ACME', stores: {
  [key]: { name: 'Gangnam', departments: { [key]: { name: 'Sales' }, [second]: { name: 'Support' } } },
  [second]: { name: 'Pangyo', departments: { [key]: { name: 'Ops' } } },
} } } };

const browserSource = `
import '/packages/generator-core/styles/crudui.css';
import { compileForm, connectForm, connectOutline, createForm } from '@crudui/generator-core';
import { renderForm, renderOutline } from '@crudui/generator-html';

const element = document.getElementById('form');
const outline = document.getElementById('outline');
window.formStylesTest = {
  renders: 0,
  mount(spec, data) {
    const form = createForm(compileForm(spec), data, { language: 'en' });
    element.innerHTML = renderForm(form);
    outline.innerHTML = renderOutline(form);
    const connection = connectForm(element, form);
    connectOutline(outline, form, element);
    // Render every change and synchronize, as an HTML renderer application does.
    form.subscribe(() => {
      window.formStylesTest.renders++;
      element.innerHTML = renderForm(form);
      connection.sync();
      outline.innerHTML = renderOutline(form);
    });
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
            const html = await vite.transformIndexHtml('/form-styles', `<!doctype html><html><head><link rel="icon" href="data:,"><style>body{margin:0;padding-top:40px}textarea{height:900px}</style></head><body><div id="form"></div><div id="outline" style="position:fixed;top:0;right:0;width:12rem"></div><script type="module" src="${entry}"></script></body></html>`);
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

test('the scroll position alone decides the current row; moving to a row scrolls it to its line', async () => {
  const page = await browser.newPage();
  const failures = [];
  page.on('pageerror', error => failures.push(error.message));
  page.on('console', message => { if (message.type() === 'error') failures.push(message.text()); });
  try {
    await page.setViewport({ width: 1000, height: 700 });
    await page.goto(url);
    await page.waitForFunction(() => window.formStylesTest !== undefined);
    await page.evaluate((spec, data) => window.formStylesTest.mount(spec, data), spec, siblingData);
    const stores = `${levels[0]}.${key}.stores`;
    const frame = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const state = () => page.evaluate(() => {
      const current = document.querySelector('[data-crudui-current]');
      const header = current.firstElementChild;
      return {
        currentKey: current.getAttribute('data-crudui-row-key'),
        currentName: current.querySelector('input[name$="[name]"]')?.value,
        headerTop: header.getBoundingClientRect().top,
        line: parseFloat(getComputedStyle(header).top),
        stuck: current.hasAttribute('data-crudui-stuck'),
        label: getComputedStyle(header.querySelector('.crudui-node__label')).display,
        active: document.activeElement.getAttribute('name'),
        scrollY: window.scrollY,
        maxScrollY: document.scrollingElement.scrollHeight - window.innerHeight,
        currentCount: document.querySelectorAll('[data-crudui-current]').length,
      };
    });

    // Moving to a row (here: the row an Add action creates) scrolls it to its line, which makes it current.
    await page.evaluate((path, rowKey) => {
      const scope = [...document.querySelectorAll('[data-field-path]')].find(node => node.getAttribute('data-field-path') === path);
      const row = [...scope.querySelectorAll('[data-crudui-row-key]')].find(node => node.getAttribute('data-crudui-row-key') === rowKey && node.parentElement.closest('[data-field-path]') === scope);
      [...row.querySelectorAll('[data-crudui-action="add-row"]')].find(button => button.closest('[data-crudui-row-key]') === row).click();
    }, stores, key);
    await frame();
    const moved = await state();
    assert.deepEqual(failures, []);
    assert.equal(moved.currentCount, 1, 'Exactly one current row');
    assert.ok(Math.abs(moved.headerTop - moved.line) < 0.5, `The new row header sits on its line: ${moved.headerTop} vs ${moved.line}`);
    assert.equal(moved.stuck, true, 'The row at its line is stuck');
    assert.notEqual(moved.label, 'none', 'Its level label shows');
    assert.equal(moved.active.endsWith('[name]'), true, 'Focus moved into the new row');

    // Focus stays put while the user scrolls away; the scroll alone moves the current row.
    await page.evaluate(() => document.querySelector('input[name$="[name]"]').focus());
    const focused = (await state()).active;
    const rendersBefore = await page.evaluate(() => window.formStylesTest.renders);
    const mapped = [];
    for (let step = 0; step < 40; step++) {
      await page.mouse.wheel({ deltaY: 400 });
      await frame();
      mapped.push(await page.evaluate(() => {
        const marked = [...document.querySelectorAll('#outline [aria-current="true"]')];
        return { marked: marked.map(row => row.getAttribute('data-crudui-row-key')), current: document.querySelector('#form [data-crudui-current]').getAttribute('data-crudui-row-key') };
      }));
    }
    const end = await state();
    // Following the current row changes no state, so scrolling renders nothing.
    assert.equal(await page.evaluate(() => window.formStylesTest.renders), rendersBefore, 'Scrolling renders nothing');
    for (const { marked, current } of mapped) {
      assert.deepEqual(marked, [current], 'The structure map marks exactly the current form row');
    }
    assert.ok(new Set(mapped.map(entry => entry.current)).size > 1, 'Scrolling changed the current row');
    assert.ok(Math.abs(end.scrollY - end.maxScrollY) < 0.5, `Scrolling reaches the end with focus elsewhere: ${end.scrollY} vs ${end.maxScrollY}`);
    assert.equal(end.active, focused, 'Scrolling does not move focus');
    assert.equal(end.currentName, 'Pangyo', 'At the end the last row is current');
    assert.equal(end.stuck, true, 'At the end the last row has reached its line');
  } finally { await page.close(); }
});

test('the row at the end of the form limits scrolling at its line, with no blank inside rows', async () => {
  const page = await browser.newPage();
  const failures = [];
  page.on('pageerror', error => failures.push(error.message));
  page.on('console', message => { if (message.type() === 'error') failures.push(message.text()); });
  try {
    await page.setViewport({ width: 1000, height: 700 });
    await page.goto(url);
    await page.waitForFunction(() => window.formStylesTest !== undefined);
    await page.evaluate((spec, data) => window.formStylesTest.mount(spec, data), shortSpec, shortData);
    // Scrolling must never be pulled back.
    await page.evaluate(() => {
      window.scrollLog = [];
      window.addEventListener('scroll', () => window.scrollLog.push(window.scrollY), { passive: true });
    });
    for (let step = 0; step < 20; step++) {
      await page.mouse.wheel({ deltaY: 400 });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    }
    const log = await page.evaluate(() => window.scrollLog);
    assert.ok(log.length > 0 && log.every((y, index) => index === 0 || y >= log[index - 1] - 0.5),
      `Scrolling down never moves back up: ${JSON.stringify(log)}`);
    const rows = await page.evaluate(() => [...document.querySelectorAll('.crudui-node--sticky')].map(row => {
      const header = row.firstElementChild;
      return {
        name: row.querySelector('input[name$="[name]"]').value,
        rowTop: row.getBoundingClientRect().top,
        alignedTop: parseFloat(getComputedStyle(row).scrollMarginTop),
        headerTop: header.getBoundingClientRect().top,
        naturalHeaderTop: row.getBoundingClientRect().top + row.clientTop,
        bodyGap: header.nextElementSibling.getBoundingClientRect().top - header.getBoundingClientRect().bottom,
        minHeight: getComputedStyle(row).minHeight,
        current: row.hasAttribute('data-crudui-current'),
        scrollY: window.scrollY,
        maxScrollY: document.scrollingElement.scrollHeight - window.innerHeight,
      };
    }));
    const pangyo = rows.find(row => row.name === 'Pangyo');
    const ops = rows.find(row => row.name === 'Ops');
    const support = rows.find(row => row.name === 'Support');
    assert.deepEqual(failures, []);
    assert.ok(Math.abs(pangyo.scrollY - pangyo.maxScrollY) < 0.5, 'Scrolled to the end');
    // Ops is the deepest row at the end of the form; its top stops exactly on its line.
    assert.ok(Math.abs(ops.rowTop - ops.alignedTop) < 0.5, `Scrolling ends when the end row reaches its line: ${ops.rowTop} vs ${ops.alignedTop}`);
    assert.equal(ops.current, true, 'The end row is current');
    for (const row of rows.filter(row => Math.abs(row.headerTop - row.naturalHeaderTop) < 0.5)) {
      assert.ok(Math.abs(row.bodyGap) < 0.5, `${row.name}: the body follows the header without a gap (${row.bodyGap})`);
    }
    assert.ok(['0px', 'auto'].includes(support.minHeight), `Support, a last row followed by other content, has no minimum height: ${support.minHeight}`);
    assert.ok(['0px', 'auto'].includes(ops.minHeight), `The end row keeps its content height: ${ops.minHeight}`);
    // The space that lets the end row reach its line is outside the form.
    const outside = await page.evaluate(() => {
      const form = document.querySelector('.crudui-form');
      return { formBottomToDocumentEnd: document.scrollingElement.scrollHeight - (form.getBoundingClientRect().bottom + window.scrollY), marginBottom: parseFloat(getComputedStyle(form).marginBottom) };
    });
    assert.ok(outside.marginBottom > 0 && Math.abs(outside.formBottomToDocumentEnd - outside.marginBottom) < 1,
      `The trailing space is the form's outside margin: ${JSON.stringify(outside)}`);
  } finally { await page.close(); }
});
