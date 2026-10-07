import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { expectedBrowserSections } from './browser-report-policy.mjs';
import {
  expectedGenerationCombinations, expectedGenerationRequests, expectedGenerationResults,
  finalizeGenerationReport, generationFrameworks, generationRenderingPaths, generationServers,
} from './check-generation.mjs';
import { finalizePersistenceReport, persistenceCheckIds } from './persistence-report.mjs';
import { assertStep } from './src/step-runner.mjs';
import { measuredLimitMs } from './src/unit-pool.mjs';
import { browserReportLimitsMs, browserReportMeasurementsMs } from './src/browser-job.mjs';
import { expectedTypingResults, typingDelays, verifyEvidence } from './verification-evidence.mjs';
import * as browserPolicy from './browser-report-policy.mjs';
import * as pipelineCheck from './check-pipeline.mjs';
import { pipelineReport } from './check-pipeline.mjs';
import { pipelineCombinations } from './src/pipeline-flow.mjs';
import { formFrameworks, formRenderingPaths, formServers } from './src/runtime-paths.mjs';
import { selectedServers, takeBrowserReports, verificationStages } from './local-verification.mjs';

const source = { commit: 'a'.repeat(40), changes: 'c'.repeat(64) };
const generationCheckIds = [
  'load-current-record', 'compile-reference', 'reject-missing-reference',
  'render-and-inject/nested-order', 'render-and-inject/explicit-empty',
  'render-and-inject/default-rows', 'render-and-inject/stored-en',
  'render-and-inject/stored-ko', 'frame-document', 'ssr/en', 'ssr/ko', 'reject-ssr-request',
  'reject-invalid-render-data', 'stored-record-unchanged',
];

function generationReport(identity = source) {
  const templateHash = '2'.repeat(64);
  const results = generationServers.flatMap(server => generationRenderingPaths.flatMap(renderingPath =>
    generationFrameworks.flatMap(framework => generationCheckIds.map(id => {
      let evidence;
      if (id === 'compile-reference') {
        evidence = { serializedTemplateSha256: templateHash,
          referenceReads: server === 'go' || server === 'rust' ? 1 : null };
      } else if (id === 'reject-missing-reference') {
        evidence = { retainedTemplateSha256: templateHash };
      } else if (id.startsWith('render-and-inject/')) {
        evidence = { afterRejectedCompile: true, serializedTemplateSha256: templateHash };
      }
      return { server, path: renderingPath, framework, id, passed: true, evidence };
    }))));
  results.push(
    { server: 'shared', path: 'all', framework: 'all', id: 'library-and-source', passed: true },
    { server: 'shared', path: 'all', framework: 'all', id: 'unchanged-library-inputs', passed: true },
  );
  return finalizeGenerationReport({
    servers: generationServers, renderingPaths: generationRenderingPaths,
    frameworks: generationFrameworks, source: identity, results,
    requests: Array.from({ length: expectedGenerationRequests }, () => ({})),
  }, '2026-09-10T00:01:00.000Z');
}

function serverReport() {
  const results = generationServers.flatMap(server => generationRenderingPaths.flatMap(renderingPath =>
    persistenceCheckIds.map(id => ({ server, path: renderingPath, id, passed: true }))));
  return finalizePersistenceReport(results, source, '2026-09-10T00:02:00.000Z');
}

function browserSummary() {
  const sections = Object.fromEntries(Object.entries(expectedBrowserSections())
    .map(([section, total]) => [section, { total, failed: 0 }]));
  return {
    generatedAt: '2026-09-10T00:03:00.000Z', source, complete: true, passed: true, failedChecks: 0,
    verification: { bindForm: structuredClone(sections), createForm: structuredClone(sections) },
    serverRuns: generationServers.map(server => ({
      server, complete: true, passed: true, failedChecks: 0, durationMs: 100,
    })),
  };
}

function pipelineEvidence(identity = source) {
  const unit = id => ({ id, status: 'passed', durationMs: 10, timeoutMs: 60_000 });
  return pipelineReport({
    origin: 'http://127.0.0.1:8080/', source: identity, startedAt: '2026-09-10T00:04:00.000Z', durationMs: 500,
    resets: ['js', 'php', 'php-ext', 'go', 'rust'].map(server => unit(`reset/${server}`)),
    combinations: pipelineCombinations().map(combination => unit(combination.id)),
  });
}

function typingReport() {
  return {
    generatedAt: '2026-09-10T00:05:00.000Z', origin: 'http://127.0.0.1:41000', browser: 'Chrome',
    pageErrors: [],
    results: formRenderingPaths.flatMap(renderingPath => formFrameworks.flatMap(framework =>
      typingDelays.map(delay => ({ path: renderingPath, framework, delay, passed: true })))),
  };
}

async function evidenceFixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'crudui-verification-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(path.join(directory, 'source.json'), JSON.stringify(source));
  await writeFile(path.join(directory, 'generation.json'), JSON.stringify(generationReport()));
  await writeFile(path.join(directory, 'server-report.json'), JSON.stringify(serverReport()));
  await writeFile(path.join(directory, 'browser-summary.json'), JSON.stringify(browserSummary()));
  await writeFile(path.join(directory, 'pipeline.json'), JSON.stringify(pipelineEvidence()));
  await writeFile(path.join(directory, 'typing-report.json'), JSON.stringify(typingReport()));
  return directory;
}

const stackOrigin = 'http://127.0.0.1:41000';
const formServerIds = () => [...formServers];
const prepared = {
  orderedJsonModule: '/run/sources/ordered-json/php-extension/src/modules/ordered_json.so',
  cruduiModule: '/checkout/packages/php-ext/modules/crudui.so',
};

test('verifies the local stack in stages, against the origin of its public server', () => {
  const stages = verificationStages({ origin: stackOrigin, results: '/run/results', data: '/run/data', prepared, library: '/checkout' });
  assert.deepEqual(stages.map(stage => stage.map(step => step.id)), [
    ['php-modes'], ['generation'], ['persistence'], ['pipeline'],
    ['browser-php', 'browser-php-ext', 'browser-go', 'browser-rust'],
    ['browser-summary'], ['typing'],
  ]);
  const checks = stages.flat();
  // A check is a long operation: it runs to its end without a limit; its units hold their own.
  for (const check of checks) {
    assert.equal(check.command, process.execPath, check.id);
    assert.doesNotThrow(() => assertStep(check), `${check.id} holds no time limit`);
  }
  const byId = Object.fromEntries(checks.map(check => [check.id, check]));
  assert.deepEqual(byId['php-modes'].args, ['test-php-modes.mjs', prepared.orderedJsonModule, prepared.cruduiModule, '/checkout']);
  assert.deepEqual(byId.generation.args, ['check-generation.mjs', '--url', stackOrigin,
    '--library', '/checkout', '--report', '/run/results/generation.json']);
  assert.deepEqual(byId.persistence.args, ['check-servers.mjs', '--origin', stackOrigin, '--data', '/run/data',
    '--report', '/run/results/server-report.json']);
  assert.deepEqual(byId.pipeline.args, ['check-pipeline.mjs', '--origin', stackOrigin, '--report', '/run/results/pipeline.json']);
  assert.deepEqual(byId['browser-php'].args, ['check.mjs', 'php', stackOrigin]);
  assert.deepEqual(byId['browser-php'].environment, { FORM_COMPARISON_RESULTS: '/run/results' });
  assert.deepEqual(byId['browser-summary'].args, ['check-browser-reports.mjs',
    '--results', '/run/results', '--origin', stackOrigin,
    '--source', '/run/results/source.json', '--report', '/run/results/browser-summary.json']);
  assert.deepEqual(byId.typing.args, ['check-typing.mjs', stackOrigin]);
  assert.deepEqual(byId.typing.environment, { FORM_COMPARISON_RESULTS: '/run/results' });
  // No check reaches a container, a fixed port or a fixed directory of a deployment.
  assert.doesNotMatch(JSON.stringify(checks), /\/workspace|"\/results|"\/data|:8080|container/);
});

test('splits the verification into the browser checks of selected servers and every other check', async t => {
  const options = { origin: stackOrigin, results: '/run/results', data: '/run/data', prepared, library: '/checkout' };
  const full = verificationStages(options).flat();
  const browser = verificationStages({ ...options, servers: ['php'] });
  assert.deepEqual(browser.map(stage => stage.map(step => step.id)), [['browser-php']]);
  assert.deepEqual(browser[0][0], full.find(step => step.id === 'browser-php'));
  const rest = verificationStages({ ...options, browserReports: true });
  assert.deepEqual(rest.map(stage => stage.map(step => step.id)), [
    ['php-modes'], ['generation'], ['persistence'], ['pipeline'], ['browser-summary'], ['typing'],
  ]);
  // The four browser jobs and the summary together run every check of the full run, each once, unchanged.
  const parts = [...formServerIds().flatMap(server => verificationStages({ ...options, servers: [server] }).flat()), ...rest.flat()];
  assert.deepEqual(parts.map(step => step.id).sort(), full.map(step => step.id).sort());
  for (const step of parts) assert.deepEqual(step, full.find(item => item.id === step.id));
  assert.throws(() => verificationStages({ ...options, servers: ['php'], browserReports: true }), /not both/);

  assert.deepEqual(selectedServers('php-ext,rust'), ['php-ext', 'rust']);
  for (const list of ['', 'js', 'php,php', 'php,node']) assert.throws(() => selectedServers(list), /--servers/, list);

  // The summary reads the report of every server; a missing report fails before any check.
  const reports = await mkdtemp(path.join(tmpdir(), 'crudui-browser-reports-'));
  const results = await mkdtemp(path.join(tmpdir(), 'crudui-results-'));
  t.after(() => Promise.all([reports, results].map(directory => rm(directory, { recursive: true, force: true }))));
  for (const server of formServerIds()) await writeFile(path.join(reports, `report-${server}.json`), JSON.stringify({ server }));
  await takeBrowserReports(reports, results);
  for (const server of formServerIds()) {
    assert.deepEqual(JSON.parse(await readFile(path.join(results, `report-${server}.json`), 'utf8')), { server });
  }
  await rm(path.join(reports, 'report-go.json'));
  await assert.rejects(takeBrowserReports(reports, results), /ENOENT/);
});

test('no browser run has a budget or a summed limit; every unit limit comes from a measurement', () => {
  assert.equal(browserPolicy.browserServerRunBudgetMs, undefined, 'a server run has no duration budget');
  assert.equal(browserPolicy.browserCheckLimitMs, undefined, 'a browser check has no summed limit');
  // Three times the slowest measurement, rounded up to five seconds, at least ten seconds.
  assert.equal(measuredLimitMs(32_415), 100_000);
  assert.equal(measuredLimitMs(1_804), 10_000);
  for (const [name, measurements, limits] of [
    ['report', browserReportMeasurementsMs, browserReportLimitsMs],
    ['browser unit', browserPolicy.browserUnitMeasurementsMs, browserPolicy.browserUnitLimitsMs],
  ]) {
    assert.deepEqual(Object.keys(limits).sort(), Object.keys(measurements ?? {}).sort(), `${name} limits`);
    for (const [id, measured] of Object.entries(measurements)) {
      assert.equal(limits[id], measuredLimitMs(measured), `${name} ${id}: limit from its measurement`);
    }
  }
  // Starting and closing the browser are long operations, not units with a limit.
  assert.deepEqual(Object.keys(browserPolicy.browserUnitLimitsMs).sort(),
    ['artifacts', 'frame-documents', 'interactions', 'main-page']);
  assert.equal(pipelineCheck.pipelineBrowserLimitMs, undefined, 'the pipeline check has no browser limit');
});

test('every phase of a browser check runs as a unit, and the browser starts and closes as an operation', async () => {
  const check = await readFile(new URL('./check.mjs', import.meta.url), 'utf8');
  assert.match(check, /from '\.\/src\/unit-pool\.mjs'/, 'check.mjs runs its phases as units');
  assert.doesNotMatch(check, /Promise\.race\(\[action\(\)/, 'no phase waits with only a start and an end line');
  for (const id of ['main-page', 'interactions', 'frame-documents', 'artifacts']) {
    assert.match(check, new RegExp(`(?:runPhase|phase)\\('${id}'`), `${id} runs as a unit`);
  }
  const pipeline = await readFile(new URL('./check-pipeline.mjs', import.meta.url), 'utf8');
  for (const [file, source] of [['check.mjs', check], ['check-pipeline.mjs', pipeline]]) {
    for (const id of ['browser-start', 'browser-close']) {
      assert.match(source, new RegExp(`runOperation\\(\\{\\s*id: '${id}'`), `${file}: ${id} runs as an operation without a limit`);
    }
    assert.doesNotMatch(source, /setTimeout\(/, `${file} sets no deadline of its own`);
  }
  assert.doesNotMatch(check, /^const browser = await puppeteer\.launch/m, 'the browser starts inside an operation');
});

test('accepts complete evidence for one source identity', async t => {
  const result = await verifyEvidence(await evidenceFixture(t));
  assert.deepEqual(result.source, source);
  assert.deepEqual(result.generation, {
    results: expectedGenerationResults, requests: expectedGenerationRequests,
    combinations: expectedGenerationCombinations,
  });
  assert.equal(result.persistence.results, 120);
  assert.equal(result.browser.checks,
    2 * Object.values(expectedBrowserSections()).reduce((sum, total) => sum + total, 0));
  assert.deepEqual(result.pipeline, { combinations: 40 });
  assert.deepEqual(result.typing, { results: expectedTypingResults });
});

test('rejects evidence without a complete passing typing report', async t => {
  const directory = await evidenceFixture(t);
  const failed = typingReport();
  failed.results[2] = { ...failed.results[2], passed: false, error: 'lost a character' };
  await writeFile(path.join(directory, 'typing-report.json'), JSON.stringify(failed));
  await assert.rejects(verifyEvidence(directory), /Typing .* failed/);
  const partial = typingReport();
  partial.results.pop();
  await writeFile(path.join(directory, 'typing-report.json'), JSON.stringify(partial));
  await assert.rejects(verifyEvidence(directory), /Typing results differ/);
  await writeFile(path.join(directory, 'typing-report.json'), JSON.stringify({ ...typingReport(), pageErrors: ['boom'] }));
  await assert.rejects(verifyEvidence(directory), /Typing report has page errors/);
});

test('rejects evidence without a complete pipeline report for the same tree', async t => {
  const directory = await evidenceFixture(t);
  const failed = pipelineEvidence();
  failed.combinations[3] = { ...failed.combinations[3], status: 'timed-out' };
  await writeFile(path.join(directory, 'pipeline.json'), JSON.stringify(pipelineReport({ ...failed, source })));
  await assert.rejects(verifyEvidence(directory), /Pipeline report failed/);
  // A report that claims success must still list every combination.
  const partial = pipelineEvidence();
  partial.combinations.pop();
  partial.passedCombinations = 39;
  partial.passed = true;
  await writeFile(path.join(directory, 'pipeline.json'), JSON.stringify(partial));
  await assert.rejects(verifyEvidence(directory), /Pipeline combinations differ/);
  await writeFile(path.join(directory, 'pipeline.json'),
    JSON.stringify(pipelineEvidence({ commit: 'b'.repeat(40), changes: null })));
  await assert.rejects(verifyEvidence(directory), /Pipeline report source identity differs/);
});

test('rejects failed evidence and evidence for another tree', async t => {
  const directory = await evidenceFixture(t);
  const failed = serverReport();
  failed.results[0].passed = false;
  failed.passed = false;
  failed.failedChecks = 1;
  await writeFile(path.join(directory, 'server-report.json'), JSON.stringify(failed));
  await assert.rejects(verifyEvidence(directory), /Persistence report failed/);
  await writeFile(path.join(directory, 'server-report.json'), JSON.stringify(serverReport()));

  await writeFile(path.join(directory, 'generation.json'),
    JSON.stringify(generationReport({ commit: source.commit, changes: null })));
  await assert.rejects(verifyEvidence(directory), /Generation report source identity differs/);
  await writeFile(path.join(directory, 'generation.json'), JSON.stringify(generationReport()));

  await writeFile(path.join(directory, 'source.json'), JSON.stringify({ commit: source.commit }));
  await assert.rejects(verifyEvidence(directory), /requires the verified source identity/);
  await rm(path.join(directory, 'source.json'));
  await assert.rejects(verifyEvidence(directory), /ENOENT/);
});
