import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  browserFrameworks, browserPaths, browserScenarioCheckIds, browserServers,
  browserTransports, summarizeBrowserReports,
} from './check-browser-reports.mjs';
import {
  browserInitializationResultIds, browserJobReportCount, expectedBrowserSections,
} from './browser-report-policy.mjs';
import { formInitializations } from './src/runtime-paths.mjs';

const origin = 'http://127.0.0.1:8080';
const metadata = {
  source: { commit: 'a'.repeat(40), archiveSha256: '1'.repeat(64) },
};
const startedAt = '2026-09-10T00:00:00.000Z';
const completedAt = '2026-09-10T00:05:00.000Z';

function initialization(server, renderingPath, framework) {
  return {
    kind: 'initialization', server, path: renderingPath, framework,
    commit: metadata.source.commit, startedAt, completedAt, durationMs: 1_000,
    results: browserInitializationResultIds.map(id => {
      const separator = id.lastIndexOf('/');
      return { label: id.slice(0, separator), category: id.slice(separator + 1), passed: true };
    }),
    stages: [{ column: 'ssr', stage: 'mounted', html: '' }],
    cssFailures: {},
  };
}

function scenario(server, renderingPath, framework, transport) {
  const item = {
    kind: 'scenario', server, path: renderingPath, framework, transport,
    commit: metadata.source.commit, startedAt, completedAt, durationMs: 1_000,
  };
  item.results = browserScenarioCheckIds.map(id => ({ id, passed: true }));
  return item;
}

function report(server, sha256 = 'f'.repeat(64)) {
  const combinations = browserPaths.flatMap(renderingPath =>
    browserFrameworks.flatMap(framework => browserTransports.map(transport =>
      scenario(server, renderingPath, framework, transport))));
  const interactions = combinations.flatMap(item =>
    ['pointer', 'keyboard', 'condition', 'validation', 'empty-keyboard'].map(action => ({
      server, path: item.path, framework: item.framework, transport: item.transport,
      action, passed: true,
    })));
  const mounts = browserPaths.flatMap(renderingPath => browserFrameworks.map(framework => ({
    server, path: renderingPath, framework, passed: true,
  })));
  const frameDocuments = mounts.flatMap(item => formInitializations.map(initialization =>
    ({ ...item, initialization, frameSha256: sha256 })));
  return {
    scope: 'verification', origin, metadata,
    startedAt, completedAt, generatedAt: completedAt, durationMs: 300_000,
    activity: {
      requests: 100, responses: 100,
      lastRequestAt: '2026-09-10T00:04:59.000Z',
      lastResponseAt: '2026-09-10T00:04:59.500Z',
    },
    scenarioJob: {
      status: 'completed', completedReports: browserJobReportCount(), totalReports: browserJobReportCount(), current: null,
      startedAt, completedAt, durationMs: 299_000,
    },
    reports: combinations,
    initializations: browserPaths.flatMap(renderingPath => browserFrameworks.map(framework =>
      initialization(server, renderingPath, framework))),
    interactions,
    initialMounts: mounts,
    frameDocuments,
    browser: 'Chrome/152.0.0.0',
    pageErrors: [],
    initializationArtifacts: 'initialization-2026-09-10T00-00-00.000Z',
  };
}

function completeReports() {
  return Object.fromEntries(browserServers.map(server => [server, report(server)]));
}

test('passes only a complete four-server verification with zero failures', () => {
  const summary = summarizeBrowserReports(completeReports(), origin, metadata);
  assert.equal(summary.complete, true);
  assert.equal(summary.passed, true);
  assert.equal(summary.performancePassed, true);
  assert.equal(summary.failedChecks, 0);
  const expected = expectedBrowserSections();
  assert.deepEqual(summary.verification.bindForm.scenarios, { total: expected.scenarios, failed: 0 });
  assert.deepEqual(summary.verification.createForm.scenarios, { total: expected.scenarios, failed: 0 });
  assert.deepEqual(summary.verification.bindForm.initializations, { total: expected.initializations, failed: 0 });
});

test('rejects a missing server report', () => {
  const reports = completeReports();
  delete reports.rust;
  assert.throws(() => summarizeBrowserReports(reports, origin, metadata),
    /All four server reports are required/);
});

test('fails when any scenario check fails', () => {
  const reports = completeReports();
  reports.go.reports[0].results[0].passed = false;
  const summary = summarizeBrowserReports(reports, origin, metadata);
  assert.equal(summary.passed, false);
  assert.equal(summary.failedChecks, 1);
});

test('rejects non-boolean results and mismatched source commits', () => {
  const stringResult = completeReports();
  stringResult.php.interactions[0].passed = 'false';
  assert.throws(() => summarizeBrowserReports(stringResult, origin, metadata),
    /interaction result/);

  const wrongCommit = completeReports();
  wrongCommit['php-ext'].reports[0].commit = 'e'.repeat(40);
  assert.throws(() => summarizeBrowserReports(wrongCommit, origin, metadata),
    /source commit/);
});

test('rejects missing activity and incomplete initialization reports', () => {
  const noActivity = completeReports();
  delete noActivity.php.activity;
  assert.throws(() => summarizeBrowserReports(noActivity, origin, metadata), /activity/);

  const noStages = completeReports();
  noStages.php.initializations[0].stages = [];
  assert.throws(() => summarizeBrowserReports(noStages, origin, metadata),
    /initialization stages/);

  const missingComparison = completeReports();
  missingComparison.go.initializations[1].results.pop();
  assert.throws(() => summarizeBrowserReports(missingComparison, origin, metadata),
    /comparison IDs/);

  const missingReport = completeReports();
  missingReport.rust.initializations.pop();
  assert.throws(() => summarizeBrowserReports(missingReport, origin, metadata),
    /initialization report count/);
});

test('fails when an initialization comparison differs', () => {
  const reports = completeReports();
  reports.php.initializations[0].results[0].passed = false;
  const summary = summarizeBrowserReports(reports, origin, metadata);
  assert.equal(summary.passed, false);
  assert.equal(summary.failedChecks, 1);
  assert.deepEqual(summary.verification.bindForm.initializations, { total: expectedBrowserSections().initializations, failed: 1 });
});

test('fails when corresponding frame documents differ between servers', () => {
  const reports = completeReports();
  reports.rust.frameDocuments[0].frameSha256 = '0'.repeat(64);
  const summary = summarizeBrowserReports(reports, origin, metadata);
  assert.equal(summary.passed, false);
  assert.equal(summary.verification.bindForm.documents.failed,
    browserServers.length * formInitializations.length);
});

test('fails a server duration above 900000 milliseconds', () => {
  const reports = completeReports();
  reports.php.durationMs = 900_001;
  const summary = summarizeBrowserReports(reports, origin, metadata);
  assert.equal(summary.passed, false);
  assert.equal(summary.performancePassed, false);
  assert.deepEqual(summary.serverRuns[0].performance, {
    durationMs: 900_001, budgetMs: 900_000, passed: false,
  });
});

test('command returns status 0 only for a complete successful aggregate', t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'crudui-browser-report-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(path.join(directory, 'metadata.json'), JSON.stringify(metadata));
  for (const [server, value] of Object.entries(completeReports())) {
    writeFileSync(path.join(directory, `report-${server}.json`), JSON.stringify(value));
  }
  const script = fileURLToPath(new URL('./check-browser-reports.mjs', import.meta.url));
  const destination = path.join(directory, 'summary.json');
  const result = spawnSync(process.execPath, [
    script, '--results', directory, '--origin', origin,
    '--metadata', path.join(directory, 'metadata.json'), '--report', destination,
  ], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.match(result.stdout, /0 checks failed; candidate passed/);
  assert.equal(JSON.parse(readFileSync(destination)).passed, true);
});
