import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { parse } from 'yaml';

import { formServers } from '../../examples/form-comparison/src/runtime-paths.mjs';
import { makeDryRun } from './make-dry-run.mjs';

const repository = path.resolve(import.meta.dirname, '../..');

function workflowJob(source, name) {
  const lines = source.split('\n');
  const start = lines.findIndex(line => line === `  ${name}:`);
  assert.notEqual(start, -1, `CI must define the ${name} job`);
  const endOffset = lines.slice(start + 1).findIndex(line => /^ {2}[a-z0-9-]+:$/.test(line));
  const end = endOffset === -1 ? lines.length : start + 1 + endOffset;
  return lines.slice(start, end).join('\n');
}

test('CI runs the complete form comparison regression suite', async () => {
  const workflow = await readFile(path.join(repository, '.github/workflows/ci.yml'), 'utf8');
  const job = workflowJob(workflow, 'form-comparison');

  assert.match(job, /runs-on:\s*ubuntu-24\.04/);
  assert.match(job, /uses: actions\/checkout@/);
  assert.match(job, /uses: actions\/setup-node@/);
  assert.match(job, /node-version-file:\s*['"]?\.node-version['"]?/);
  assert.match(job, /uses: shivammathur\/setup-php@/);
  assert.match(job, /php-version:\s*['"]?8\.5['"]?/);
  assert.match(job, /run: make install-npm\n/);
  assert.match(job, /run: make install-node-modules install-composer\n/);
  assert.match(job, /run: make ci-targets TARGETS="test-form-comparison"\n/);
});

test('CI builds and runs the five record stores and the canonical flow', async () => {
  const workflow = await readFile(path.join(repository, '.github/workflows/ci.yml'), 'utf8');
  const job = workflowJob(workflow, 'form-comparison-pipeline');
  // The test runner bounds each test; the job has no time limit over them (test-commands.test.mjs).
  assert.doesNotMatch(job, /^ {4}timeout-minutes:/m);
  assert.match(job, /uses: shivammathur\/setup-php@/);
  assert.match(job, /tools: composer/);
  assert.match(job, /PHP_EXTENSION_PHP_CONFIG:\s*\/usr\/bin\/php-config8\.5/);
  assert.match(job, /uses: actions\/setup-go@/);
  assert.match(job, /go-version-file:\s*['"]?\.go-version['"]?/);
  assert.match(job, /run: make install-rust\n/);
  // The Rust record server builds from the OrderedJSON checkout, which make install-crates installs before the crates.
  assert.match(job, /run: make install-crates\n/);
  assert.match(job, /workspaces: examples\/form-comparison\/servers\/rust/);
  assert.match(job, /run: make install-node-modules install-composer\n/);
  assert.match(job, /run: make ci-targets TARGETS="test-form-comparison-pipeline"\n/);
  const scripts = JSON.parse(await readFile(path.join(repository, 'package.json'), 'utf8')).scripts;
  assert.match(scripts['test:form-comparison:pipeline'], /examples\/form-comparison\/record-stores\.test\.mjs/);
  assert.match(scripts['test:form-comparison:pipeline'], /examples\/form-comparison\/pipeline\.browser\.mjs/);
  // The Go and Rust server tests need the OrderedJSON checkout the record-store test prepares.
  const order = ['record-stores.test.mjs', 'go --cwd examples/form-comparison/servers/go',
    'examples/form-comparison/servers/rust/Cargo.toml', 'pipeline.browser.mjs']
    .map(part => scripts['test:form-comparison:pipeline'].indexOf(part));
  assert.ok(order.every((index, position) => index >= 0 && (position === 0 || index > order[position - 1])), String(order));
});

test('CI runs the browser checks of each form server in a job of its own and every other check once after them', async () => {
  const workflow = parse(await readFile(path.join(repository, '.github/workflows/ci.yml'), 'utf8'));
  const browser = workflow.jobs['form-comparison-browser'];
  const summary = workflow.jobs['form-comparison-checks'];
  const run = job => job.steps.map(step => step.run).filter(command => /^make ci-targets\b/.test(command ?? ''));
  // One job per server of the browser matrix, each with the runner to itself.
  assert.deepEqual(browser.strategy.matrix.server, [...formServers]);
  assert.equal(browser.strategy['fail-fast'], false);
  assert.equal(browser.env.FORM_SERVERS, '${{ matrix.server }}');
  assert.deepEqual(run(browser), ['make ci-targets TARGETS="test-form-comparison-browser"']);
  const upload = browser.steps.find(step => step.with?.path === 'var/form-comparison/browser');
  assert.deepEqual({ if: upload.if, name: upload.with.name, missing: upload.with['if-no-files-found'] },
    { if: '${{ !cancelled() }}', name: 'form-comparison-browser-${{ matrix.server }}', missing: 'error' });
  // The summary job runs after all four, reads their reports and runs every other check of the verification.
  assert.equal(summary.needs, 'form-comparison-browser');
  assert.equal(summary.strategy, undefined);
  const download = summary.steps.find(step => String(step.uses ?? '').startsWith('actions/download-artifact@'));
  assert.deepEqual(download.with, { pattern: 'form-comparison-browser-*', path: 'var/form-comparison/browser', 'merge-multiple': true });
  assert.ok(summary.steps.indexOf(download) < summary.steps.findIndex(step => step.run === run(summary)[0]));
  assert.deepEqual(run(summary), ['make ci-targets TARGETS="test-form-comparison-summary"']);
  for (const job of [browser, summary]) {
    assert.equal(job.env.PHP_EXTENSION_PHP_CONFIG, '/usr/bin/php-config8.5');
    assert.ok(job.steps.some(step => step.run === 'make install-crates'));
  }
  // Both parts start their public server on one address and share one report directory.
  const dryRun = target => makeDryRun(repository, target);
  const browserRun = dryRun('test-form-comparison-browser');
  const summaryRun = dryRun('test-form-comparison-summary');
  assert.equal(browserRun.status, 0, browserRun.stderr);
  assert.equal(summaryRun.status, 0, summaryRun.stderr);
  const reports = path.join(repository, 'var/form-comparison/browser');
  assert.match(browserRun.stdout, new RegExp(`run test:form-comparison:checks -- --servers php,php-ext,go,rust --results ${reports} --address 127\\.0\\.0\\.1:47100$`, 'm'));
  assert.match(summaryRun.stdout, new RegExp(`run test:form-comparison:checks -- --browser-reports ${reports} --address 127\\.0\\.0\\.1:47100$`, 'm'));
});

test('native PHP matrix passes the selected regular php-config path', async () => {
  const workflow = await readFile(path.join(repository, '.github/workflows/ci.yml'), 'utf8');
  const job = workflowJob(workflow, 'php-api');

  assert.match(job, /php:\s*\['8\.4', '8\.5'\]/);
  assert.match(
    job,
    /PHP_EXTENSION_PHP_CONFIG:\s*\/usr\/bin\/php-config\$\{\{ matrix\.php \}\}/,
  );
});

test('native job caches the generator packages and the programs that run them', async () => {
  const workflow = await readFile(path.join(repository, '.github/workflows/ci.yml'), 'utf8');
  const job = workflowJob(workflow, 'native-generators');
  for (const entry of ['packages/generator-go/go.mod', 'tests/native-generators/programs/go/go.mod', 'packages/generator-rust', 'tests/native-generators/programs/rust']) {
    assert.match(job, new RegExp(`^\\s+${entry.replaceAll('.', '\\.')}$`, 'm'), entry);
  }
});

test('native report upload uses the current Node.js 24 artifact action', async () => {
  const workflow = await readFile(path.join(repository, '.github/workflows/ci.yml'), 'utf8');
  for (const name of ['php-engine', 'native-generators', 'php-api']) {
    const job = workflowJob(workflow, name);
    const versions = [...job.matchAll(/uses:\s*actions\/upload-artifact@([^\n]+)/g)]
      .map(match => match[1].trim());

    assert.ok(versions.length > 0, `The native job ${name} uploads its report`);
    assert.deepEqual(versions.filter(version => !/^[0-9a-f]{40} # v7\.\d+\.\d+$/.test(version)), []);
  }
});

test('browser CI jobs run the sandboxed Chrome that puppeteer pins', async () => {
  const workflow = await readFile(path.join(repository, '.github/workflows/ci.yml'), 'utf8');
  const failures = [];
  for (const name of ['form-runtime', 'form-comparison', 'form-comparison-pipeline', 'form-comparison-browser', 'form-comparison-checks', 'package-browser', 'native-generators']) {
    const job = workflowJob(workflow, name);
    if (!/PUPPETEER_CACHE_DIR:\s*\$\{\{ github\.workspace \}\}\/\.tools\/puppeteer\n/.test(job)) failures.push(`${name}: the cache of Puppeteer is not .tools/puppeteer of the checkout`);
    if (!/CHROME_DEVEL_SANDBOX:\s*\/usr\/local\/sbin\/chrome-devel-sandbox\n/.test(job)) failures.push(`${name}: CHROME_DEVEL_SANDBOX does not name the installed helper`);
    if (/PUPPETEER_EXECUTABLE_PATH|PUPPETEER_SKIP_DOWNLOAD/.test(job)) failures.push(`${name}: selects a browser outside the pinned build`);
    const install = job.search(/run:\s*make install-browsers BROWSERS="chrome\b[^\n]*--chrome-sandbox"/);
    const preflight = job.search(/run:\s*make check-ci-browser(?:\s|$)/);
    if (install === -1) failures.push(`${name}: missing installation of the pinned Chrome with its sandbox helper`);
    if (preflight === -1 || preflight < install) failures.push(`${name}: missing sandboxed Chrome preflight after the installation`);
    if (/--no-sandbox|--disable-setuid-sandbox/.test(job)) {
      failures.push(`${name}: disables the Chrome sandbox`);
    }
  }
  for (const file of ['tests/widget-scripts.test.mjs', 'tests/form-styles.test.mjs', 'tests/widget-script-runs.test.mjs', 'tests/browser-engines.mjs', 'packages/form-binding/tests/browser.test.ts']) {
    const checks = await readFile(path.join(repository, file), 'utf8');
    if (/--no-sandbox|--disable-setuid-sandbox/.test(checks)) {
      failures.push(`${file}: disables the Chrome sandbox`);
    }
  }
  assert.deepEqual(failures, []);
});
