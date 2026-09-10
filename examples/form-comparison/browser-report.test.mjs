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

const origin = 'http://127.0.0.1:8080';
const metadata = {
  source: { commit: 'a'.repeat(40), archiveSha256: '1'.repeat(64) },
};
const startedAt = '2026-09-10T00:00:00.000Z';
const completedAt = '2026-09-10T00:05:00.000Z';

function evidence(item) {
  return {
    generatedAt: completedAt,
    server: item.server,
    path: item.path,
    framework: item.framework,
    transport: item.transport,
    commit: item.commit,
    randomSource: 'test-sequence',
    stages: [{ route: 'initial', stage: 'mounted' }],
    comparisons: [{ label: 'initial/injected/mounted', results: [] }],
    cssFailures: {},
  };
}

function scenario(server, renderingPath, framework, transport) {
  const item = {
    server, path: renderingPath, framework, transport, commit: metadata.source.commit,
    startedAt, completedAt, durationMs: 1_000,
  };
  item.results = browserScenarioCheckIds.map(id => ({
    id,
    passed: true,
    ...(id === 'initialization' ? { evidence: evidence(item) } : {}),
  }));
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
  const documents = browserPaths.flatMap(renderingPath => browserFrameworks.map(framework => ({
    server, path: renderingPath, framework, passed: true, sha256,
  })));
  return {
    scope: 'verification', origin, metadata,
    startedAt, completedAt, generatedAt: completedAt, durationMs: 300_000,
    activity: {
      requests: 100, responses: 100,
      lastRequestAt: '2026-09-10T00:04:59.000Z',
      lastResponseAt: '2026-09-10T00:04:59.500Z',
    },
    scenarioJob: {
      status: 'completed', completedReports: 12, totalReports: 12, current: null,
      startedAt, completedAt, durationMs: 299_000,
    },
    reports: combinations,
    interactions,
    initialMounts: documents.map(({ sha256: _sha256, ...item }) => item),
    staticDocuments: documents,
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
  assert.deepEqual(summary.verification.bindForm.scenarios, { total: 480, failed: 0 });
  assert.deepEqual(summary.verification.createForm.scenarios, { total: 480, failed: 0 });
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

test('rejects missing activity and initialization evidence', () => {
  const noActivity = completeReports();
  delete noActivity.php.activity;
  assert.throws(() => summarizeBrowserReports(noActivity, origin, metadata), /activity/);

  const noEvidence = completeReports();
  delete noEvidence.php.reports[0].results.find(item => item.id === 'initialization').evidence;
  assert.throws(() => summarizeBrowserReports(noEvidence, origin, metadata),
    /initialization evidence/);
});

test('fails when corresponding static HTML differs between servers', () => {
  const reports = completeReports();
  reports.rust.staticDocuments[0].sha256 = '0'.repeat(64);
  const summary = summarizeBrowserReports(reports, origin, metadata);
  assert.equal(summary.passed, false);
  assert.equal(summary.verification.bindForm.documents.failed, 4);
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
