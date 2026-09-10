import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { formFrameworks, formRenderingPaths } from './src/runtime-paths.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const output = process.env.FORM_COMPARISON_RESULTS ?? path.join(root, '.form-comparison/results');
if (!path.isAbsolute(output)) throw new Error('FORM_COMPARISON_RESULTS must be an absolute path');
if (!process.argv[2] || process.argv[3]) throw new Error('Usage: node check-typing.mjs <http-origin>');
const base = new URL(process.argv[2]);
if (!['http:', 'https:'].includes(base.protocol) || base.pathname !== '/' || base.search || base.hash || base.username || base.password) throw new Error('Expected an HTTP origin');
await mkdir(output, { recursive: true });
try {
  const previous = JSON.parse(await readFile(path.join(output, 'typing-report.json'), 'utf8'));
  await copyFile(path.join(output, 'typing-report.json'), path.join(output, `typing-report-${previous.generatedAt.replaceAll(':', '-')}.json`));
} catch (error) { if (error.code !== 'ENOENT') throw error; }
const browser = await puppeteer.launch({ headless: true });
const results = [];
const pageErrors = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.evaluateOnNewDocument(() => {
    globalThis.cruduiFrameReady = new Promise(resolve => {
      addEventListener('message', event => {
        if (event.origin === location.origin && event.source === window
            && event.data?.type === 'crudui:frame-ready') resolve(event.data);
      });
    });
  });
  for (const framework of formFrameworks) {
    for (const renderingPath of formRenderingPaths) {
      await page.goto(base.origin + '/frames/' + renderingPath + '-' + framework
        + '/?server=php', { waitUntil: 'load' });
      assert.deepEqual(await page.evaluate(() => globalThis.cruduiFrameReady), {
        type: 'crudui:frame-ready', server: 'php', framework, path: renderingPath,
      });
      const selector = 'input[name$="[stores][__0000000000001__][name]"]';
      for (const delay of [0, 10, 50]) {
        let error;
        try {
          await page.evaluate(() => window.comparison.reset());
          const input = await page.$(selector);
          await input.click({ count: 3 });
          await input.press('Backspace');
          await page.evaluate(() => window.comparison.idle());
          await page.evaluate(() => window.comparison.save());
          const expected = 'Seoul stores remain editable';
          await (await page.$(selector)).type(expected, { delay });
          assert.equal(await page.$eval(selector, input => input.value), expected, 'native typing retains every character');
          await page.evaluate(() => window.comparison.idle());
          assert.equal(await page.$eval(selector, input => input.value), expected, 'queued rendering retains the final value');
          assert.equal(await page.$eval(selector, input => input === document.activeElement), true, 'typing retains focus');
          assert.equal(await page.$eval(selector, input => input.selectionStart), expected.length, 'typing retains the caret');
        } catch (failure) { error = failure.stack; }
        const result = { path: renderingPath, framework, delay, passed: !error,
          ...(error ? { error } : {}) };
        results.push(result);
        process.stdout.write(renderingPath + '/' + framework + '/' + delay + 'ms: '
          + (error ? 'FAIL ' + error : 'PASS') + '\n');
      }
      await page.evaluate(() => window.comparison.reset());
    }
  }
} finally {
  await writeFile(path.join(output, 'typing-report.json'), JSON.stringify({ generatedAt: new Date().toISOString(), origin: base.origin, browser: await browser.version(), results, pageErrors }, null, 2) + '\n');
  await browser.close();
}
const expectedResults = formFrameworks.length * formRenderingPaths.length * 3;
if (results.length !== expectedResults || results.some(result => !result.passed)
    || pageErrors.length) process.exitCode = 1;
