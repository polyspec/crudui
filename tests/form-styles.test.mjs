// Browser layout checks for the core stylesheet (@crudui/generator-core/crudui.css) in Chromium,
// Firefox and WebKit. jsdom has no layout, so sticky stacking and focus scrolling are verified in
// real browsers. Every check runs the same way in a page, in a scrolling box and in a frame, and
// every engine runs the same scenario through one engine adapter.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import { engineDrivers, engines } from './browser-engines.mjs';

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
import { compileForm, connectForm, connectOutline, createForm, patchContent } from '@crudui/generator-core';
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
    // Patch every change into the page and synchronize, as an HTML renderer application does.
    form.subscribe(() => {
      patchContent(element, renderForm(form));
      connection.sync();
      patchContent(outline, renderOutline(form));
    });
  },
};
`;

const viewport = { width: 1000, height: 700 };

/**
 * The engine adapter (tests/browser-engines.mjs) with each engine's known convention for a
 * pointer press on a button in `pointerFocusesButtons`.
 */
const drivers = {
  chromium: { ...engineDrivers.chromium, pointerFocusesButtons: true },
  firefox: { ...engineDrivers.firefox, pointerFocusesButtons: true },
  // Safari on macOS does not focus a button on a pointer press; other WebKit ports follow
  // their own platform, which the scenario measures.
  webkit: { ...engineDrivers.webkit, pointerFocusesButtons: process.platform === 'darwin' ? false : undefined },
};
const browsers = {};
let server, url, frameUrl, cacheDirectory;
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
  for (const engine of engines) browsers[engine] = await drivers[engine].launch();
}, { timeout: 60000 });
after(async () => {
  try { await Promise.all(Object.values(browsers).map(browser => browser.close())); }
  finally {
    try { await server?.close(); }
    finally { if (cacheDirectory) await rm(cacheDirectory, { recursive: true, force: true }); }
  }
});

/**
 * Open the form document in a host: the page itself, a 420 px scrolling box in the page,
 * or a 600 px frame. Returns the frame that runs the form and records page errors.
 */
async function openHost(engine, host) {
  const page = await drivers[engine].open(browsers[engine], viewport);
  const failures = [];
  page.on('pageerror', error => failures.push(error.message));
  page.on('console', message => { if (message.type() === 'error') failures.push(message.text()); });
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

for (const engine of engines) for (const host of hosts) {
  test(`${engine} ${host}: sticky row headers stack on their lines and show their labels only while stuck`, async () => {
    const { page, target, failures } = await openHost(engine, host);
    try {
      await target.evaluate(([spec, data]) => window.formStylesTest.mount(spec, data), [spec, data]);
      // Scroll until the deepest row's top is 10 px past its line, under the four pinned ancestor headers.
      await target.evaluate(source => {
        const { scroller, top, token } = eval(source);
        const rows = document.querySelectorAll('.crudui-node--sticky');
        scroller.scrollTop += rows[rows.length - 1].getBoundingClientRect().top - top - (4 * token - 10);
      }, containerSource);
      await frames(target);
      const layout = await target.evaluate(source => {
        const { top, token } = eval(source);
        const headers = [...document.querySelectorAll('.crudui-node--sticky')].map(row => row.querySelector(':scope > .crudui-node__header-container'));
        const first = headers[0];
        const title = first.querySelector('.crudui-node__title');
        return {
          token,
          scrollState: CSS.supports('container-type: scroll-state'),
          border: parseFloat(getComputedStyle(first.parentElement).borderLeftWidth),
          headers: headers.map(header => ({
            offset: header.getBoundingClientRect().top - top,
            line: parseFloat(getComputedStyle(header).top),
            height: header.getBoundingClientRect().height,
            label: getComputedStyle(header.querySelector('.crudui-node__label')).display,
            marked: header.hasAttribute('data-crudui-stuck'),
            labelBackground: getComputedStyle(header.querySelector('.crudui-node__label')).backgroundColor,
            labelRadius: getComputedStyle(header.querySelector('.crudui-node__label')).borderRadius,
          })),
          // The card top edge is drawn in the container and goes while the container is stuck,
          // so no border crosses the line and a seam keeps one border.
          edges: headers.map(header => ({
            row: getComputedStyle(header.parentElement).borderTopWidth,
            edge: getComputedStyle(header.querySelector(':scope > .crudui-node__header'), '::before').display,
          })),
          lines: headers.map(header => getComputedStyle(header.querySelector(':scope > .crudui-node__header')).borderBottomWidth),
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
        assert.ok(Math.abs(header.line - index * (layout.token - layout.border)) < 0.5,
          `Level ${index} line is ${index} header heights less its border: ${header.line}`);
        assert.notEqual(header.label, 'none', `Level ${index} shows its label while stuck`);
        // A browser with scroll-state queries shows the label by the query; any other marks the header.
        assert.equal(header.marked, !layout.scrollState, `Level ${index} marking with scroll-state support ${layout.scrollState}`);
        assert.notEqual(header.labelBackground, 'rgba(0, 0, 0, 0)', `Level ${index} label has badge background`);
        assert.notEqual(header.labelRadius, '0px', `Level ${index} label has badge radius`);
      }
      for (const [index, edge] of layout.edges.entries()) {
        assert.equal(edge.row, '0px', `Level ${index} row carries no top border`);
        assert.equal(edge.edge, 'none', `Level ${index} card top edge goes while the header is stuck`);
      }
      for (const [index, line] of layout.lines.entries()) {
        assert.ok(Math.abs(parseFloat(line) - layout.border) < 0.01, `Level ${index} header owns the line under it, one row border: ${line}`);
      }
      assert.equal(layout.titleTruncated, true, 'A long title is truncated');
      assert.equal(layout.actionRows, 1, 'Header controls stay on one line');

      // Scrolled back to the top, nothing is stuck and the level labels are hidden.
      await target.evaluate(source => { eval(source).scroller.scrollTop = 0; }, containerSource);
      await frames(target);
      const loose = await target.evaluate(() => [...document.querySelectorAll('.crudui-node--sticky > .crudui-node__header-container > .crudui-node__header')].map(header => ({
        label: getComputedStyle(header.querySelector(':scope > .crudui-node__label')).display,
        edge: getComputedStyle(header, '::before').display,
      })));
      assert.ok(loose.every(header => header.label === 'none'), `Level labels are hidden while headers are not stuck: ${loose.map(header => header.label)}`);
      assert.ok(loose.every(header => header.edge !== 'none'), `A row that is not stuck draws its card top edge: ${loose.map(header => header.edge)}`);
    } finally { await page.close(); }
  });

  test(`${engine} ${host}: without scroll-state queries, the binding marks stuck headers to show their labels and hide their card top edges`, async () => {
    const { page, target, failures } = await openHost(engine, host);
    try {
      // Act as Firefox or Safari: no scroll-state support and no container rule.
      await target.evaluate(([spec, data]) => {
        const supports = CSS.supports;
        CSS.supports = (...args) => !String(args.join(':')).includes('scroll-state') && supports.apply(CSS, args);
        for (const sheet of document.styleSheets) {
          for (let index = sheet.cssRules.length - 1; index >= 0; index--) {
            if (sheet.cssRules[index] instanceof CSSContainerRule && sheet.cssRules[index].conditionText.includes('scroll-state')) sheet.deleteRule(index);
          }
        }
        window.formStylesTest.mount(spec, data);
      }, [spec, data]);
      const labels = () => target.evaluate(() => [...document.querySelectorAll('.crudui-node--sticky > .crudui-node__header-container')]
        .map(header => getComputedStyle(header.querySelector(':scope > .crudui-node__header > .crudui-node__label')).display));
      // The marking hides the card top edge as the query does.
      const edges = () => target.evaluate(() => [...document.querySelectorAll('.crudui-node--sticky > .crudui-node__header-container > .crudui-node__header')]
        .map(header => getComputedStyle(header, '::before').display));
      await frames(target);
      const top = await labels();
      assert.ok(top.every(display => display === 'none'), `Level labels are hidden while headers are not stuck: ${top}`);
      const topEdges = await edges();
      assert.ok(topEdges.every(display => display !== 'none'), `Card top edges show while headers are not stuck: ${topEdges}`);
      await target.evaluate(source => {
        const { scroller, top, token } = eval(source);
        const rows = document.querySelectorAll('.crudui-node--sticky');
        scroller.scrollTop += rows[rows.length - 1].getBoundingClientRect().top - top - (4 * token - 10);
      }, containerSource);
      await frames(target);
      const stuck = await labels();
      assert.ok(stuck.every(display => display !== 'none'), `Level labels show while stuck: ${stuck}`);
      const stuckEdges = await edges();
      assert.ok(stuckEdges.every(display => display === 'none'), `Card top edges go while stuck: ${stuckEdges}`);
      // A re-render keeps the marks.
      await target.evaluate(() => { const input = document.querySelector('.crudui-form input[name]'); input.value += 'x'; input.dispatchEvent(new Event('input', { bubbles: true })); });
      await frames(target);
      const rendered = await labels();
      assert.ok(rendered.every(display => display !== 'none'), `Level labels still show after a render: ${rendered}`);
      const renderedEdges = await edges();
      assert.ok(renderedEdges.every(display => display === 'none'), `Card top edges stay hidden after a render: ${renderedEdges}`);
      await target.evaluate(source => { eval(source).scroller.scrollTop = 0; }, containerSource);
      await frames(target);
      const back = await labels();
      assert.ok(back.every(display => display === 'none'), `Level labels hide again at the top: ${back}`);
      const backEdges = await edges();
      assert.ok(backEdges.every(display => display !== 'none'), `Card top edges show again at the top: ${backEdges}`);
      assert.deepEqual(failures, []);
    } finally { await page.close(); }
  });

  test(`${engine} ${host}: focusing a row after an action or a map selection scrolls it clear of the sticky headers and the footer`, async () => {
    const { page, target, failures } = await openHost(engine, host);
    try {
      await target.evaluate(([spec, data]) => window.formStylesTest.mount(spec, data), [spec, siblingData]);
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
      // up; the binding scrolls its input into view clear of the pinned headers and the footer.
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

  test(`${engine} ${host}: a restored focus keeps its visibility and a moved focus is visible, after pointer or keyboard input`, async () => {
    const { page, target, failures } = await openHost(engine, host);
    try {
      await target.evaluate(([spec, data]) => window.formStylesTest.mount(spec, data), [spec, siblingData]);
      const state = () => target.evaluate(() => ({
        action: document.activeElement.getAttribute('data-crudui-action'),
        name: document.activeElement.getAttribute('name'),
        visible: document.activeElement.matches(':focus-visible'),
      }));
      const toggle = async () => (await target.evaluateHandle(() => document.querySelector('#form [data-crudui-action="toggle-row"]'))).asElement();

      // Whether a pointer press focuses a button is the platform's convention: Chromium and
      // Firefox focus it, WebKit on macOS leaves the focus where it was. A plain button outside
      // the form shows the convention the restored focus must keep.
      const probe = (await target.evaluateHandle(() => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = 'Probe';
        button.style.cssText = 'position:fixed;left:0;top:0';
        document.body.append(button);
        return button;
      })).asElement();
      await probe.click();
      const pointerFocuses = await probe.evaluate(button => { const focused = document.activeElement === button; button.blur(); button.remove(); return focused; });
      if (drivers[engine].pointerFocusesButtons !== undefined) assert.equal(pointerFocuses, drivers[engine].pointerFocusesButtons, `${engine} pointer focus convention`);

      // A pointer press focuses the toggle, where the platform does, without visible focus. Every
      // change re-renders the form, so the toggle is a new element and its restored focus stays
      // without it; where the press focuses nothing, the render focuses nothing either.
      await (await toggle()).click();
      await frames(target);
      const pointerRestored = await state();
      await target.evaluate(() => document.querySelector('#form [data-crudui-action="toggle-row"]').click());
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
      const add = (await target.evaluateHandle(() => {
        const row = [...document.querySelectorAll('#form .crudui-node--sticky')].find(node => node.querySelector('input[name$="[name]"]')?.value === 'stores one');
        return [...row.querySelectorAll('[data-crudui-action="add-row"]')].find(button => button.closest('[data-crudui-row-key]') === row);
      })).asElement();
      await add.click();
      await frames(target);
      const moved = await state();

      assert.deepEqual(failures, []);
      assert.deepEqual(pointerRestored, pointerFocuses
        ? { action: 'toggle-row', name: null, visible: false }
        : { action: null, name: null, visible: false },
      pointerFocuses ? 'A pointer-focused toggle is restored without visible focus' : 'A pointer press that focuses nothing leaves nothing focused after the render');
      assert.deepEqual(keyboardRestored, { action: 'toggle-row', name: null, visible: true }, 'A visibly focused toggle is restored with visible focus');
      assert.match(moved.name ?? '', /\[stores\]\[[^\]]+\]\[name\]$/, 'Focus moved to the new store row');
      assert.equal(moved.visible, true, 'The moved focus is visible');
    } finally { await page.close(); }
  });
}
