import assert from 'node:assert/strict';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  browserFrameworks, browserPaths, browserScenarioCheckIds, browserServers, browserTransports,
  verifyServerReport,
} from './browser-report-policy.mjs';
import { formInitializations } from './src/runtime-paths.mjs';
import { assertSourceIdentity, sameSourceIdentity } from './src/source-identity.mjs';

export {
  browserFrameworks, browserPaths, browserScenarioCheckIds, browserServers, browserTransports,
};

function origin(value) {
  const parsed = new URL(value);
  assert.ok(['http:', 'https:'].includes(parsed.protocol) && parsed.pathname === '/'
    && !parsed.search && !parsed.hash && !parsed.username && !parsed.password,
  'Expected an HTTP origin');
  return parsed.origin;
}

function aggregate(summaries) {
  return Object.fromEntries(browserPaths.map(renderingPath => [renderingPath,
    Object.fromEntries(['scenarios', 'initializations', 'interactions', 'mounts', 'documents'].map(section =>
      [section, {
        total: summaries.reduce((sum, report) =>
          sum + report[section][renderingPath].total, 0),
        failed: summaries.reduce((sum, report) =>
          sum + report[section][renderingPath].failed, 0),
      }]))]));
}

/**
 * Every frame document of one rendering path and framework is the same built page: the CSR
 * document is that page, and an SSR document is that page with the server's insertions removed.
 */
function applyFrameDocumentAgreement(reports) {
  for (const renderingPath of browserPaths) {
    for (const framework of browserFrameworks) {
      const documents = browserServers.flatMap(server => reports[server].frameDocuments
        ?.filter(item => item.path === renderingPath && item.framework === framework) ?? []);
      if (documents.length !== browserServers.length * formInitializations.length) continue;
      if (new Set(documents.map(document => document.frameSha256)).size === 1) continue;
      for (const document of documents) {
        document.passed = false;
        document.error = 'Frame documents differ between API servers';
      }
    }
  }
}

/** Verify and summarize current implementation reports for every API server. */
export function summarizeBrowserReports(reports, expectedOrigin, expectedSource) {
  assert.deepEqual(Object.keys(reports ?? {}).sort(), [...browserServers].sort(),
    'All four server reports are required');
  assertSourceIdentity(expectedSource, 'Browser aggregate requires a source identity');
  reports = structuredClone(reports);
  applyFrameDocumentAgreement(reports);
  const normalizedOrigin = origin(expectedOrigin);
  const verification = [];
  const serverRuns = [];
  for (const server of browserServers) {
    const report = reports[server];
    assert.equal(report.origin, normalizedOrigin, `${server} verification: report origin`);
    assert.ok(sameSourceIdentity(report.source, expectedSource), `${server} verification: source identity`);
    const summary = verifyServerReport(report, server);
    verification.push(summary);
    serverRuns.push(summary);
  }

  const failedChecks = verification.reduce((sum, report) => sum + report.failedChecks, 0);
  const performancePassed = verification.every(report => report.performance.passed);
  return {
    generatedAt: new Date().toISOString(),
    origin: normalizedOrigin,
    source: expectedSource,
    complete: true,
    performancePassed,
    failedChecks,
    passed: failedChecks === 0 && performancePassed,
    verification: aggregate(verification),
    serverRuns,
  };
}

function parseOptions(argv) {
  const options = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!['--results', '--origin', '--source', '--report'].includes(name) || !value || options.has(name)) {
      throw new Error('Usage: node check-browser-reports.mjs --results /absolute/results --origin http://127.0.0.1:8080 --source /absolute/source.json --report /absolute/report.json');
    }
    options.set(name, value);
  }
  for (const name of ['--results', '--origin', '--source', '--report']) {
    assert.ok(options.has(name), `Missing ${name}`);
  }
  for (const name of ['--results', '--source', '--report']) {
    assert.ok(path.isAbsolute(options.get(name)), `${name} must be absolute`);
  }
  assert.equal(path.dirname(options.get('--report')), options.get('--results'),
    '--report must be inside --results');
  return options;
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const directory = options.get('--results');
  const destination = options.get('--report');
  if (existsSync(destination)) {
    const previous = JSON.parse(await readFile(destination, 'utf8'));
    await rename(destination, path.join(directory,
      `${path.parse(destination).name}-${previous.generatedAt.replaceAll(':', '-')}.json`));
  }
  const source = JSON.parse(await readFile(options.get('--source'), 'utf8'));
  const reports = Object.fromEntries(await Promise.all(browserServers.map(async server =>
    [server, JSON.parse(await readFile(path.join(directory, `report-${server}.json`), 'utf8'))])));
  const summary = summarizeBrowserReports(reports, options.get('--origin'), source);
  await writeFile(destination, JSON.stringify(summary, null, 2) + '\n');
  const checked = Object.values(summary.verification).reduce((sum, renderingPath) =>
    sum + Object.values(renderingPath).reduce((count, section) => count + section.total, 0), 0);
  process.stdout.write(`Browser verification completed: ${checked} checks recorded; ${summary.failedChecks} checks failed; candidate ${summary.passed ? 'passed' : 'failed'}\n`);
  if (!summary.passed) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
