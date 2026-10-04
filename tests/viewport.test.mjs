// Viewport checks for the core stylesheet (@crudui/generator-core/crudui.css) in Chromium, Firefox
// and WebKit (form markup contract, viewport widths): at 360 and 1280 CSS pixels the expected HTML
// of every case of the shared render fixtures causes no horizontal overflow of the document, and
// every control and action lies within the viewport, except inside an element that scrolls
// horizontally on its own.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { engineDrivers, engines } from './browser-engines.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const stylesheet = readFileSync(`${root}packages/generator-core/styles/crudui.css`, 'utf8');
const corpora = ['form-render', 'form-complete', 'list-render', 'detail-render'];
const cases = corpora.flatMap(corpus => JSON.parse(readFileSync(`${root}tests/fixtures/${corpus}/cases.json`, 'utf8'))
  .map(item => ({ name: `${corpus}: ${item.name}`, html: item.expected_html })));
const widths = [360, 1280];

const browsers = {};
before(async () => {
  for (const engine of engines) browsers[engine] = await engineDrivers[engine].launch();
}, { timeout: 60000 });
after(async () => {
  await Promise.all(Object.values(browsers).map(browser => browser.close()));
}, { timeout: 120000 });

// In the page: places one case and returns every overflow that the contract forbids.
function measure(html) {
  document.body.innerHTML = html;
  const width = document.documentElement.clientWidth;
  const problems = [];
  if (document.documentElement.scrollWidth > width) problems.push(`the document is ${document.documentElement.scrollWidth} px wide`);
  const scrollsOnItsOwn = element => {
    for (let parent = element.parentElement; parent !== null; parent = parent.parentElement) {
      const overflow = getComputedStyle(parent).overflowX;
      if (overflow === 'auto' || overflow === 'scroll') return true;
    }
    return false;
  };
  const selector = 'input, select, textarea, button, .crudui-action, .crudui-list__action, .crudui-detail__action';
  for (const element of document.body.querySelectorAll(selector)) {
    if (element.getClientRects().length === 0 || scrollsOnItsOwn(element)) continue;
    const box = element.getBoundingClientRect();
    if (box.left < -0.5 || box.right > width + 0.5) {
      problems.push(`${element.tagName.toLowerCase()}.${String(element.className).split(' ')[0]} spans ${Math.round(box.left)} to ${Math.round(box.right)} px`);
    }
  }
  return problems;
}

for (const engine of engines) {
  for (const width of widths) {
    test(`${engine} at ${width} px: every shared render case fits the viewport`, { timeout: 300000 }, async t => {
      const started = performance.now();
      const page = await engineDrivers[engine].open(browsers[engine], { width, height: 800 });
      try {
        await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width"><style>${stylesheet}</style></head><body style="margin:0"></body></html>`);
        const failures = [];
        for (const item of cases) {
          const problems = await page.mainFrame().evaluate(measure, item.html);
          if (problems.length > 0) failures.push(`${item.name}: ${problems.join('; ')}`);
        }
        t.diagnostic(`${engine} ${width} px: ${cases.length} cases, ${failures.length} failed, ${Math.round(performance.now() - started)} ms`);
        assert.deepEqual(failures, []);
      } finally {
        await page.close();
      }
    });
  }
}
