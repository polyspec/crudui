import puppeteer from 'puppeteer';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { checkInteraction } from './check-interaction.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.join(root, '.form-comparison/results');
await mkdir(output, { recursive: true });
const browser = await puppeteer.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1680, height: 1100 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const initialMounts = new Map();
  await page.setRequestInterception(true);
  page.on('request', async request => {
    const match = request.url().match(/\/api\/load\/(original-keyed|original|keyed)\/(react|vue|svelte)$/);
    const key = match?.slice(1).join('/');
    if (key && !initialMounts.has(key)) {
      const result = { mode: match[1], framework: match[2], passed: false };
      initialMounts.set(key, result);
      try {
        result.passed = await request.frame().evaluate(() => Array.from(document.querySelectorAll('#view input[name]')).some(input => /^form\[companies\]\[[^\]]+\]\[stores\]\[[^\]]+\]\[name\]$/.test(input.name)));
        if (!result.passed) result.error = 'Nested form was not mounted before the PHP load request';
      } catch (error) { result.error = error.message; }
    }
    await request.continue();
  });
  await page.goto('http://127.0.0.1:4317', { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.comparison, { timeout: 30000 });
  await page.screenshot({ path: path.join(output, 'forms.png'), fullPage: true });
  const report = await page.evaluate(() => window.comparison.runAll());
  report.interactions = await checkInteraction(page);
  report.initialMounts = [...initialMounts.values()];
  report.browser = await browser.version();
  report.pageErrors = errors;
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  await page.screenshot({ path: path.join(output, 'comparison.png'), fullPage: true });
  for (const result of report.reports) {
    process.stdout.write(`${result.mode}/${result.framework}: ${result.results.filter(item => item.passed).length}/${result.results.length}\n`);
    for (const check of result.results.filter(item => !item.passed)) process.stdout.write(`  FAIL ${check.id}: ${check.error}\n`);
  }
  if (errors.length) process.stdout.write(`Browser errors: ${JSON.stringify(errors)}\n`);
  const complete = report.reports.length === 9 &&
    report.reports.every(result => result.results.length === 17) && report.interactions.length === 27 && report.initialMounts.length === 9;
  const failed = report.reports.some(result => result.results.some(check => !check.passed));
  if (!complete) process.stderr.write('Comparison results are incomplete.\n');
  for (const result of report.initialMounts) process.stdout.write(`${result.mode}/${result.framework}/mount-before-load: ${result.passed ? 'PASS' : `FAIL ${result.error}`}\n`);
  if (!complete || failed || errors.length || report.interactions.some(result => !result.passed) || report.initialMounts.some(result => !result.passed)) process.exitCode = 1;
} finally { await browser.close(); }
