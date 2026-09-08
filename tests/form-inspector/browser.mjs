import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import puppeteer from 'puppeteer';

const source = await readFile(new URL('./form-snapshot.mjs', import.meta.url), 'utf8');
const browser = await puppeteer.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setContent('<style>.row { color: rgb(1, 2, 3); } .row::before { content: "Before"; } .row::after { content: "After"; }</style><form><div class="row"><input name="form[name]" value="Saved"></div></form>');
  const results = await page.evaluate(async url => {
    const { formSnapshot, styleSnapshot, compareSnapshots } = await import(url);
    const form = document.querySelector('form');
    const snapshot = () => ({ ...formSnapshot(form, form), css: styleSnapshot(form) });
    const expected = snapshot();
    const results = [{ name: 'unchanged form', passed: compareSnapshots(snapshot(), expected).every(result => result.passed) }];
    for (const [name, rule] of [
      ['computed style', '.row { color: rgb(4, 5, 6); }'],
      ['hidden display', '.row { display: none; }'],
      ['before content', '.row::before { content: "Changed"; }'],
      ['after content', '.row::after { content: "Changed"; }'],
    ]) {
      const sheet = document.styleSheets[0];
      const index = sheet.insertRule(rule, sheet.cssRules.length);
      const compared = compareSnapshots(snapshot(), expected);
      results.push({ name, passed: compared.find(result => result.category === 'css').passed === false && compared.filter(result => result.category !== 'css').every(result => result.passed) });
      sheet.deleteRule(index);
    }
    results.push({ name: 'restored stylesheet', passed: compareSnapshots(snapshot(), expected).every(result => result.passed) });
    return results;
  }, `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  for (const result of results) process.stdout.write(`${result.passed ? 'PASS' : 'FAIL'} ${result.name}\n`);
  assert.ok(results.every(result => result.passed), 'The inspector must detect real computed and pseudo-element CSS changes');
} finally { await browser.close(); }
