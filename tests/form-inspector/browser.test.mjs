// The form inspector in a real browser: a snapshot comparison detects computed style and
// pseudo-element content changes and nothing else.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import puppeteer from 'puppeteer';

const source = await readFile(new URL('./form-snapshot.mjs', import.meta.url), 'utf8');
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
let browser, page;

before(async () => {
  browser = await puppeteer.launch({ headless: true });
  page = await browser.newPage();
  await page.setContent('<style>.row { color: rgb(1, 2, 3); } .row::before { content: "Before"; } .row::after { content: "After"; }</style><form><div class="row"><input name="form[name]" value="Saved"></div></form>');
  await page.evaluate(async url => {
    const { formSnapshot, styleSnapshot, compareSnapshots } = await import(url);
    const form = document.querySelector('form');
    const snapshot = () => ({ ...formSnapshot(form, form), css: styleSnapshot(form) });
    window.inspector = { snapshot, compareSnapshots, expected: snapshot() };
  }, moduleUrl);
});
after(async () => { await browser?.close(); });

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
]) {
  test(`a ${name} change is a CSS difference only`, async () => {
    const detected = await page.evaluate(rule => {
      const { snapshot, compareSnapshots, expected } = window.inspector;
      const sheet = document.styleSheets[0];
      const index = sheet.insertRule(rule, sheet.cssRules.length);
      try {
        const compared = compareSnapshots(snapshot(), expected);
        return compared.find(result => result.category === 'css').passed === false
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
