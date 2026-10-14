// The form inspector in a real browser: a snapshot comparison detects computed style and
// pseudo-element content changes and nothing else.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';
import puppeteer, { type Browser, type Page } from 'puppeteer';

import { setup, teardown } from '@polyspec/kit/test-hooks';

import type { compareSnapshots } from './form-snapshot.mts';

/** What the page keeps between checks: a snapshot of the form, the comparison and the first snapshot. */
interface Inspector {
  snapshot: () => Record<string, unknown>;
  compareSnapshots: typeof compareSnapshots;
  expected: Record<string, unknown>;
}

declare global {
  interface Window { inspector: Inspector }
}

// The browser loads the module as it is, so it gets the module without its types.
const source = stripTypeScriptTypes(await readFile(new URL('./form-snapshot.mts', import.meta.url), 'utf8'));
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
let browser: Browser | undefined;
let page: Page;

setup('browser launch and page', async () => {
  browser = await puppeteer.launch({ headless: true });
  page = await browser.newPage();
  await page.setContent('<style>.row { color: rgb(1, 2, 3); } .row::before { content: "Before"; } .row::after { content: "After"; }</style><form><div class="row"><input name="form[name]" value="Saved"></div></form>');
  await page.evaluate(async url => {
    // The module at the data URL is form-snapshot.mts without its types.
    const { formSnapshot, styleSnapshot, compareSnapshots } = await import(url) as typeof import('./form-snapshot.mts');
    const form = document.querySelector('form');
    if (!form) throw new Error('the page has no form');
    const snapshot = () => ({ ...formSnapshot(form, form), css: styleSnapshot(form) });
    window.inspector = { snapshot, compareSnapshots, expected: snapshot() };
  }, moduleUrl);
});
teardown('browser close', () => browser?.close());

const unchanged = () => page.evaluate(() => {
  const { snapshot, compareSnapshots, expected } = window.inspector;
  return compareSnapshots(snapshot(), expected).every(result => result.passed);
});

test('an unchanged form compares equal', async () => {
  assert.equal(await unchanged(), true);
});

for (const [name, rule] of [
  ['computed style', '.row { color: rgb(4, 5, 6); }'],
  ['hidden display', '.row { display: none; }'],
  ['before content', '.row::before { content: "Changed"; }'],
  ['after content', '.row::after { content: "Changed"; }'],
] satisfies [string, string][]) {
  test(`a ${name} change is a CSS difference only`, async () => {
    const detected = await page.evaluate(rule => {
      const { snapshot, compareSnapshots, expected } = window.inspector;
      const sheet = document.styleSheets[0];
      if (!sheet) throw new Error('the page has no stylesheet');
      const index = sheet.insertRule(rule, sheet.cssRules.length);
      try {
        const compared = compareSnapshots(snapshot(), expected);
        return compared.find(result => result.category === 'css')?.passed === false
          && compared.filter(result => result.category !== 'css').every(result => result.passed);
      } finally {
        sheet.deleteRule(index);
      }
    }, rule);
    assert.equal(detected, true);
  });
}

test('a restored stylesheet compares equal again', async () => {
  assert.equal(await unchanged(), true);
});
