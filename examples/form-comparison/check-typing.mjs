import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const output = fileURLToPath(new URL('../../.form-comparison/results/', import.meta.url));
await mkdir(output, { recursive: true });
try {
  const previous = JSON.parse(await readFile(`${output}/typing-report.json`, 'utf8'));
  await copyFile(`${output}/typing-report.json`, `${output}/typing-report-${previous.generatedAt.replaceAll(':', '-')}.json`);
} catch (error) { if (error.code !== 'ENOENT') throw error; }
const browser = await puppeteer.launch({ headless: true });
const results = [];
const pageErrors = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', error => pageErrors.push(error.message));
  for (const framework of ['react', 'vue', 'svelte']) {
    for (const mode of ['corrected', 'original-keyed', 'original', 'keyed']) {
      await page.goto(`http://127.0.0.1:4317/frames/${mode}-${framework}/?server=php`, { waitUntil: 'networkidle0' });
      await page.waitForFunction(() => window.comparison);
      const selector = 'input[name$="[stores][__0000000000001__][name]"], input[name$="[stores][0][name]"]';
      for (const delay of [0, 10, 50]) {
        let error;
        try {
          await page.evaluate(() => window.comparison.reset());
          const input = await page.$(selector);
          await input.click({ count: 3 });
          await input.press('Backspace');
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          await page.click('#save');
          await page.waitForFunction(() => document.querySelector('#validation').textContent.length > 0);
          const expected = 'Seoul stores remain editable';
          await (await page.$(selector)).type(expected, { delay });
          assert.equal(await page.$eval(selector, input => input.value), expected, 'native typing retains every character');
          await new Promise(resolve => setTimeout(resolve, 250));
          assert.equal(await page.$eval(selector, input => input.value), expected, 'queued rendering retains the final value');
          assert.equal(await page.$eval(selector, input => input === document.activeElement), true, 'typing retains focus');
          assert.equal(await page.$eval(selector, input => input.selectionStart), expected.length, 'typing retains the caret');
        } catch (failure) { error = failure.stack; }
        const result = { mode, framework, delay, passed: !error, ...(error ? { error } : {}) };
        results.push(result);
        process.stdout.write(`${mode}/${framework}/${delay}ms: ${error ? `FAIL ${error}` : 'PASS'}\n`);
      }
      await page.evaluate(() => window.comparison.reset());
    }
  }
} finally {
  await writeFile(`${output}/typing-report.json`, JSON.stringify({ generatedAt: new Date().toISOString(), browser: await browser.version(), results, pageErrors }, null, 2) + '\n');
  await browser.close();
}
if (results.length !== 36 || results.some(result => !result.passed) || pageErrors.length) process.exitCode = 1;
