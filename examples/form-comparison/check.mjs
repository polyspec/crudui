import puppeteer from 'puppeteer';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { checkInteraction } from './check-interaction.mjs';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.join(root, '.form-comparison/results');
const selectedServer = process.argv[2];
const servers = selectedServer ? [selectedServer] : ['php', 'go', 'rust'];
if (servers.some(server => !['php', 'go', 'rust'].includes(server))) throw new Error('Use php, go or rust');
const suffix = selectedServer ? `-${selectedServer}` : '';
const reportFile = `report${suffix}.json`;
const formsFile = `forms${suffix}.png`;
const comparisonFile = `comparison${suffix}.png`;
await mkdir(output, { recursive: true });
if (existsSync(path.join(output, reportFile))) {
  const previous = JSON.parse(await readFile(path.join(output, reportFile), 'utf8'));
  const stamp = previous.generatedAt.replaceAll(':', '-');
  for (const file of [reportFile, formsFile, comparisonFile]) {
    const source = path.join(output, file);
    if (existsSync(source)) await copyFile(source, path.join(output, `${path.parse(file).name}-${stamp}${path.extname(file)}`));
  }
}
const browser = await puppeteer.launch({ headless: true, protocolTimeout: 900000 });
let page;
try {
  page = await browser.newPage();
  await page.setViewport({ width: 1680, height: 1100 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const initialMounts = new Map();
  const staticDocuments = new Map();
  const documentChecks = [];
  page.on('response', response => {
    if (response.request().resourceType() !== 'document') return;
    const url = new URL(response.url());
    const match = url.pathname.match(/^\/frames\/(corrected|original-keyed|original|keyed)-(react|vue|svelte)\/$/);
    if (!match) return;
    const server = url.searchParams.get('server') ?? 'php';
    const key = `${server}/${match[1]}/${match[2]}`;
    if (staticDocuments.has(key)) return;
    const result = { server, mode: match[1], framework: match[2], passed: false };
    staticDocuments.set(key, result);
    documentChecks.push((async () => {
      try {
        const html = await response.text();
        result.sha256 = createHash('sha256').update(html).digest('hex');
        result.passed = response.status() === 200 && await page.evaluate(source => {
          const document = new DOMParser().parseFromString(source, 'text/html');
          const view = document.querySelector('#view');
          return view !== null && view.childNodes.length === 0 && document.querySelector('script[type=module]') !== null;
        }, html);
        if (!result.passed) result.error = 'The HTML response must contain an empty form container and the browser module';
      } catch (error) { result.error = error.message; }
    })());
  });
  await page.setRequestInterception(true);
  page.on('request', async request => {
    const match = request.url().match(/\/api\/(php|go|rust)\/load\/(corrected|original-keyed|original|keyed)\/(react|vue|svelte)$/);
    const key = match?.slice(1).join('/');
    if (key && !initialMounts.has(key)) {
      const result = { server: match[1], mode: match[2], framework: match[3], passed: false };
      initialMounts.set(key, result);
      try {
        result.passed = await request.frame().evaluate(() => Array.from(document.querySelectorAll('#view input[name]')).some(input => /^form\[companies\]\[[^\]]+\]\[stores\]\[[^\]]+\]\[name\]$/.test(input.name)));
        if (!result.passed) result.error = 'Nested form was not mounted before the server load request';
      } catch (error) { result.error = error.message; }
    }
    await request.continue();
  });
  await page.goto(`http://127.0.0.1:4317/?server=${servers[0]}`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.comparison, { timeout: 30000 });
  await page.screenshot({ path: path.join(output, formsFile), fullPage: true });
  const report = await page.evaluate(servers => window.comparison.runAll(servers), servers);
  report.interactions = await checkInteraction(page, servers);
  report.initialMounts = [...initialMounts.values()];
  await Promise.all(documentChecks);
  report.staticDocuments = [...staticDocuments.values()];
  for (const document of report.staticDocuments) {
    if (report.staticDocuments.some(other => other.mode === document.mode && other.framework === document.framework && other.sha256 !== document.sha256)) {
      document.passed = false; document.error = 'Static HTML changed with the selected API server';
    }
  }
  report.browser = await browser.version();
  report.pageErrors = errors;
  report.initializationArtifacts = `initialization-${report.generatedAt.replaceAll(':', '-')}`;
  for (const result of report.reports) {
    const evidence = result.results.find(check => check.id === 'initialization')?.evidence;
    if (!evidence) continue;
    const directory = path.join(output, report.initializationArtifacts, result.server, result.mode, result.framework, result.transport);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'comparisons.json'), JSON.stringify({ comparisons: evidence.comparisons, cssFailures: evidence.cssFailures }, null, 2) + '\n');
    await Promise.all(evidence.stages.map(async ({ html, ...state }) => {
      const name = `${state.route}-${state.stage}`;
      await writeFile(path.join(directory, `${name}.html`), html);
      await writeFile(path.join(directory, `${name}.json`), JSON.stringify(state, null, 2) + '\n');
    }));
  }
  await writeFile(path.join(output, reportFile), JSON.stringify(report, null, 2) + '\n');
  await page.screenshot({ path: path.join(output, comparisonFile), fullPage: true });
  for (const result of report.reports) {
    process.stdout.write(`${result.server}/${result.mode}/${result.framework}/${result.transport}: ${result.results.filter(item => item.passed).length}/${result.results.length}\n`);
    for (const check of result.results.filter(item => !item.passed)) process.stdout.write(`  FAIL ${check.id}: ${check.error}\n`);
  }
  if (errors.length) process.stdout.write(`Browser errors: ${JSON.stringify(errors)}\n`);
  const variants = new Set(report.reports.map(result => `${result.server}/${result.mode}/${result.framework}/${result.transport}`));
  const interactions = new Set(report.interactions.map(result => `${result.server}/${result.mode}/${result.framework}/${result.transport}/${result.action}`));
  const complete = report.reports.length === 24 * servers.length && variants.size === 24 * servers.length &&
    report.reports.every(result => result.results.length === 20) && report.interactions.length === 108 * servers.length && interactions.size === 108 * servers.length && report.interactions.every(result => servers.includes(result.server)) && report.initialMounts.length === 12 * servers.length && report.staticDocuments.length === 12 * servers.length;
  const failed = report.reports.some(result => result.results.some(check => !check.passed));
  if (!complete) process.stderr.write('Comparison results are incomplete.\n');
  for (const result of report.initialMounts) process.stdout.write(`${result.server}/${result.mode}/${result.framework}/mount-before-load: ${result.passed ? 'PASS' : `FAIL ${result.error}`}\n`);
  for (const result of report.staticDocuments) process.stdout.write(`${result.server}/${result.mode}/${result.framework}/static-html: ${result.passed ? 'PASS' : `FAIL ${result.error}`}\n`);
  if (!complete || failed || errors.length || report.interactions.some(result => !result.passed) || report.initialMounts.some(result => !result.passed) || report.staticDocuments.some(result => !result.passed)) process.exitCode = 1;
} catch (error) {
  const reports = await page?.evaluate(() => window.comparison?.getReports() ?? []).catch(() => []);
  await writeFile(path.join(output, `incomplete-${Date.now()}${suffix}.json`), JSON.stringify({ generatedAt: new Date().toISOString(), reports, error: error.stack }, null, 2) + '\n');
  throw error;
} finally { await browser.close(); }
