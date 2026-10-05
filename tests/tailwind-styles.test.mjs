// The Tailwind version of the core stylesheet (form markup contract, Tailwind CSS): compiled with the
// theme and the utilities of Tailwind CSS, @crudui/generator-core/crudui.tailwind.css gives every
// element of the expected HTML of every shared render fixture the same computed style, without custom
// properties, as crudui.css at 360 and 1280 CSS pixels in Chromium, Firefox and WebKit.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { compile } from '@tailwindcss/node';
import { engineDrivers, engines } from './browser-engines.mjs';
import { teardown } from '../scripts/test-progress/teardown.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const styles = `${root}packages/generator-core/styles`;
const corpora = ['form-render', 'form-complete', 'list-render', 'detail-render'];
const cases = corpora.flatMap(corpus => JSON.parse(readFileSync(`${root}tests/fixtures/${corpus}/cases.json`, 'utf8'))
  .map(item => ({ name: `${corpus}: ${item.name}`, html: item.expected_html })));
const widths = [360, 1280];

const browsers = {};
let core, tailwind;
before(async () => {
  core = readFileSync(`${styles}/crudui.css`, 'utf8');
  // A stylesheet that imports the Tailwind theme and utilities and then the CRUDUI file.
  const input = [
    '@layer theme, base, components, utilities;',
    '@import "tailwindcss/theme.css" layer(theme);',
    '@import "tailwindcss/utilities.css" layer(utilities);',
    `@import "${styles}/crudui.tailwind.css";`,
  ].join('\n');
  const compiler = await compile(input, { base: root, onDependency: () => {} });
  tailwind = compiler.build([]);
  for (const engine of engines) browsers[engine] = await engineDrivers[engine].launch();
}, { timeout: 60000 });
teardown('browser close', () => Promise.all(Object.values(browsers).map(browser => browser.close())));

// In the page: places one case and returns the computed style of every element, without custom
// properties, in document order.
function computed(html) {
  document.body.innerHTML = html;
  return Array.from(document.body.querySelectorAll('*'), element => {
    const style = getComputedStyle(element);
    const values = [];
    for (let index = 0; index < style.length; index++) {
      const name = style[index];
      if (!name.startsWith('--')) values.push(`${name}:${style.getPropertyValue(name)}`);
    }
    return `${element.tagName.toLowerCase()}.${String(element.className)} ${values.join(';')}`;
  });
}

async function open(engine, width, stylesheet) {
  const page = await engineDrivers[engine].open(browsers[engine], { width, height: 800 });
  await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width"><style>${stylesheet}</style></head><body style="margin:0"></body></html>`);
  return page;
}

test('the compiled Tailwind version holds the CRUDUI rules in the layer components', () => {
  assert.match(tailwind, /@layer components\s*{/);
  assert.ok(tailwind.includes('.crudui-form'), 'the compiled stylesheet has no CRUDUI rule');
});

for (const engine of engines) {
  for (const width of widths) {
    test(`${engine} at ${width} px: the Tailwind version computes the styles of crudui.css`, { timeout: 600000 }, async t => {
      const started = performance.now();
      const plain = await open(engine, width, core);
      const layered = await open(engine, width, tailwind);
      try {
        const failures = [];
        for (const item of cases) {
          const expected = await plain.mainFrame().evaluate(computed, item.html);
          const actual = await layered.mainFrame().evaluate(computed, item.html);
          const index = expected.findIndex((value, at) => value !== actual[at]);
          if (index >= 0 || expected.length !== actual.length) {
            const differing = (expected[index] ?? '').split(';').filter(entry => !(actual[index] ?? '').split(';').includes(entry));
            failures.push(`${item.name}: element ${index}: ${differing.slice(0, 3).join('; ')}`);
          }
        }
        t.diagnostic(`${engine} ${width} px: ${cases.length} cases, ${failures.length} differ, ${Math.round(performance.now() - started)} ms`);
        assert.deepEqual(failures, []);
      } finally {
        await plain.close();
        await layered.close();
      }
    });
  }
}
