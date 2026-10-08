// Viewport checks for the core stylesheet (@polyspec/crudui-generator-core/crudui.css) in Chromium, Firefox
// and WebKit (form markup contract, viewport widths): at 360 and 1280 CSS pixels the expected HTML
// of every case of the shared render fixtures causes no horizontal overflow of the document, and
// every control and action lies within the viewport, except inside an element that scrolls
// horizontally on its own.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { engineDrivers, engines } from './browser-engines.mjs';
import { setup, teardown } from '../scripts/kit/test-hooks.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const stylesheet = readFileSync(`${root}packages/generator-core/styles/crudui.css`, 'utf8');
const corpora = ['form-render', 'form-complete', 'list-render', 'detail-render'];
const cases = corpora.flatMap(corpus => JSON.parse(readFileSync(`${root}tests/fixtures/${corpus}/cases.json`, 'utf8'))
  .map(item => ({ name: `${corpus}: ${item.name}`, html: item.expected_html })));
const widths = [360, 1280];

const browsers = {};
setup('browser launch', async () => {
  for (const engine of engines) browsers[engine] = await engineDrivers[engine].launch();
});
teardown('browser close', () => Promise.all(Object.values(browsers).map(browser => browser.close())));

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

// One page per engine and width holds the stylesheet; every shared render case is its own test
// with the runner's timeout of a test.
for (const engine of engines) {
  for (const width of widths) {
    describe(`${engine} at ${width} px`, () => {
      let page;
      setup(`${engine} ${width} px page open`, async () => {
        page = await engineDrivers[engine].open(browsers[engine], { width, height: 800 });
        await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width"><style>${stylesheet}</style></head><body style="margin:0"></body></html>`);
      });
      teardown(`${engine} ${width} px page close`, () => page?.close());
      for (const item of cases) {
        test(`${item.name} fits the viewport`, async () => {
          assert.deepEqual(await page.mainFrame().evaluate(measure, item.html), []);
        });
      }
    });
  }
}
