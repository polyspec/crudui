import assert from 'node:assert/strict';
import { renameSync, writeFileSync } from 'node:fs';
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
import { stepSilenceLimitMs } from './src/step-runner.mjs';
import { measuredLimitMs } from './src/unit-pool.mjs';
import { browserReportLimitsMs, browserReportMeasurementsMs } from './src/browser-job.mjs';
import { verificationCommand, verificationStep } from './verification.mjs';
import { verifyEvidence } from './verification-evidence.mjs';
import * as browserPolicy from './browser-report-policy.mjs';
import * as pipelineCheck from './check-pipeline.mjs';
import { pipelineReport } from './check-pipeline.mjs';
import { pipelineCombinations } from './src/pipeline-flow.mjs';
import * as tree from './verify-tree.mjs';

const { verificationChecks, verificationStages } = tree;

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

async function evidenceFixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'crudui-verification-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(path.join(directory, 'source.json'), JSON.stringify(source));
  await writeFile(path.join(directory, 'generation.json'), JSON.stringify(generationReport()));
  await writeFile(path.join(directory, 'server-report.json'), JSON.stringify(serverReport()));
  await writeFile(path.join(directory, 'browser-summary.json'), JSON.stringify(browserSummary()));
  await writeFile(path.join(directory, 'pipeline.json'), JSON.stringify(pipelineEvidence()));
  return directory;
}

test('verifies the deployed services alone, without repeating host tests', () => {
  const stages = verificationStages();
  assert.deepEqual(stages.map(stage => stage.map(step => step.id)), [
    ['php-modes'], ['generation'], ['persistence'], ['pipeline'],
    ['browser-php', 'browser-php-ext', 'browser-go', 'browser-rust'],
    ['browser-summary'],
  ]);
  const checks = verificationChecks();
  // The source suite, the Go and Rust server tests and the ordered JSON tests read no build
  // output of this container; the host and CI run them before a deployment.
  assert.doesNotMatch(JSON.stringify(checks),
    /test:form-comparison|source-suite|server-tests|"npm"|"cargo"|json\.test\.mjs/);
  // Single operations hold a total limit; checks made of units hold only an inactivity limit.
  const unitChecks = ['pipeline', 'browser-php', 'browser-php-ext', 'browser-go', 'browser-rust'];
  for (const check of checks) {
    assert.ok(check.cwd.startsWith('/workspace/build/tree'), `${check.id}: ${check.cwd}`);
    if (unitChecks.includes(check.id)) {
      assert.equal(check.timeoutMs, undefined, `${check.id}: a step made of units has no total limit`);
      assert.equal(check.silenceLimitMs, stepSilenceLimitMs, `${check.id}: inactivity limit`);
    } else {
      assert.ok(Number.isSafeInteger(check.timeoutMs) && check.timeoutMs > 0,
        `${check.id} must carry its own timeout`);
      assert.ok(check.timeoutMs <= 120_000, `${check.id}: a single operation has a short limit`);
      assert.equal(check.silenceLimitMs, undefined, check.id);
    }
  }
  assert.equal(stepSilenceLimitMs, 45_000, 'three missed 15-second heartbeats stop a step');
  const byId = Object.fromEntries(checks.map(check => [check.id, check]));
  assert.deepEqual(byId.pipeline.args, ['check-pipeline.mjs', '--origin', 'http://127.0.0.1:8080',
    '--report', '/results/pipeline.json']);
  assert.deepEqual(byId['php-modes'].args, ['test-php-modes.mjs',
    '/workspace/build/tree/.form-comparison/sources/ordered-json/php-extension/src/modules/ordered_json.so',
    '/workspace/build/tree/packages/php-ext/modules/crudui.so', '/workspace/build/tree']);
  assert.deepEqual(byId.generation.args, ['check-generation.mjs', '--url', 'http://127.0.0.1:8080',
    '--library', '/workspace/build/tree', '--report', '/results/generation.json']);
  assert.deepEqual(byId['browser-php'].args, ['check.mjs', 'php', 'http://127.0.0.1:8080']);
  assert.deepEqual(byId['browser-summary'].args, ['check-browser-reports.mjs',
    '--results', '/results', '--origin', 'http://127.0.0.1:8080',
    '--source', '/results/source.json', '--report', '/results/browser-summary.json']);
  assert.doesNotMatch(JSON.stringify(checks), /\/workspace\/source|\/opt\/|archive|metadata/);
});

test('runs verification inside the comparison container as the application user', () => {
  assert.deepEqual(verificationCommand('crudui-comparison'), [
    'exec', '--user', 'node', '--env', 'HOME=/home/node', 'crudui-comparison',
    'node', '/workspace/build/tree/examples/form-comparison/verify-tree.mjs',
  ]);
});

test('the host waits for the container run while it reports progress, without a total limit', () => {
  const runtime = { executable: '/usr/bin/container-runtime', environment: { CONTAINER_HOST: 'unix:///run/test.sock' } };
  const step = verificationStep('crudui-comparison', runtime);
  assert.equal(step.command, runtime.executable);
  assert.deepEqual(step.environment, runtime.environment);
  assert.equal(step.id, 'tree-verification');
  assert.equal(step.timeoutMs, undefined, 'the host verification has no whole-run limit');
  assert.equal(step.silenceLimitMs, stepSilenceLimitMs);
  assert.deepEqual(step.args, verificationCommand('crudui-comparison'));
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
  assert.deepEqual(Object.keys(browserPolicy.browserUnitLimitsMs).sort(),
    ['artifacts', 'browser-close', 'browser-start', 'frame-documents', 'interactions', 'main-page']);
  assert.equal(pipelineCheck.pipelineBrowserLimitMs, undefined, 'the pipeline check starts and closes its browser with the measured limits');
});

test('the local pipeline stack has no summed hook limit and starts its browser with the measured limit', async () => {
  for (const file of ['./pipeline.browser.mjs', './record-stores.test.mjs', './check-pipeline.mjs']) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /prepareLimitMs|stackStartLimitMs|pipelineBrowserLimitMs|\d_000 \+ \d/, `${file} sums no limits`);
  }
  const stack = await readFile(new URL('./pipeline.browser.mjs', import.meta.url), 'utf8');
  assert.match(stack, /browserUnitLimitsMs\['browser-start'\]/);
  assert.match(stack, /browserUnitLimitsMs\['browser-close'\]/);
});

test('every phase of a browser check, and the browser itself, runs as a unit', async () => {
  const check = await readFile(new URL('./check.mjs', import.meta.url), 'utf8');
  assert.match(check, /from '\.\/src\/unit-pool\.mjs'/, 'check.mjs runs its phases as units');
  assert.doesNotMatch(check, /Promise\.race\(\[action\(\)/, 'no phase waits with only a start and an end line');
  for (const id of ['browser-start', 'browser-close', 'main-page', 'interactions', 'frame-documents', 'artifacts']) {
    assert.match(check, new RegExp(`(?:runPhase|phase)\\('${id}'`), `${id} runs as a unit`);
  }
  assert.doesNotMatch(check, /^const browser = await puppeteer\.launch/m, 'the browser starts inside a unit');
});

/** A build state file replaced as the supervisor does, holding `states` in turn, repeating the last. */
async function stateWriter(t, states) {
  const directory = await mkdtemp(path.join(tmpdir(), 'crudui-build-state-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const stateFile = path.join(directory, 'build-state.json');
  let index = 0;
  const write = () => {
    const state = typeof states === 'function' ? states(index) : states[Math.min(index, states.length - 1)];
    index += 1;
    writeFileSync(`${stateFile}.tmp`, JSON.stringify(state));
    renameSync(`${stateFile}.tmp`, stateFile);
  };
  write();
  const timer = setInterval(write, 20);
  t.after(() => clearInterval(timer));
  return stateFile;
}

const readiness = { silenceLimitMs: 300, pollMs: 20, heartbeatMs: 60 };

test('the build readiness wait lasts while the build reports progress and has no total limit', async t => {
  assert.equal(typeof tree.readyBuild, 'function', 'verify-tree.mjs exports readyBuild({ stateFile, silenceLimitMs, pollMs, heartbeatMs, write })');
  assert.equal(tree.buildReadinessLimitMs, undefined, 'the wait has no total limit');
  const started = performance.now();
  // The build reports new progress for three silence limits, then is ready.
  const stateFile = await stateWriter(t, () => performance.now() - started < 900
    ? { status: 'building', cycle: 2, source: null, error: null, progress: { target: 'rust', at: performance.now() } }
    : { status: 'ready', cycle: 2, source: { commit: 'x' }, error: null, progress: null });
  const lines = [];
  const state = await tree.readyBuild({ stateFile, ...readiness, write: text => lines.push(text) });
  assert.equal(state.cycle, 2);
  assert.ok(performance.now() - started >= 900);
  // Its lines are unit progress lines, so the host's inactivity limit sees the wait as progress.
  assert.ok(lines.some(line => /^\[verification\] build-readiness: running \d+ms \(cycle 2 building rust\)$/m.test(line)), lines.join(''));
  assert.ok(lines.some(line => /^\[verification\] build-readiness: passed in \d+ms$/m.test(line)), lines.join(''));
});

test('the build readiness wait stops when the build reports no progress within the inactivity limit', async t => {
  const stateFile = await stateWriter(t, [{ status: 'building', cycle: 2, source: null, error: null, progress: { target: 'rust', at: 1 } }]);
  const lines = [];
  const started = performance.now();
  await assert.rejects(tree.readyBuild({ stateFile, ...readiness, write: text => lines.push(text) }),
    /build-readiness stalled after \d+ms: no build progress for \d+ms \(cycle 2 building rust\)/);
  assert.ok(performance.now() - started < 1_000);
  assert.ok(lines.some(line => /^\[verification\] build-readiness: stalled after/m.test(line)), lines.join(''));
});

test('the build readiness wait is bounded without a state file and fails on a failed build', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'crudui-build-state-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await assert.rejects(tree.readyBuild({ stateFile: path.join(directory, 'missing.json'), ...readiness, write: () => {} }),
    /build-readiness stalled after \d+ms: no build progress for \d+ms \(.*ENOENT/);
  const failed = await stateWriter(t, [{ status: 'failed', cycle: 4, source: null, error: 'go-1 failed after 2s', progress: null }]);
  await assert.rejects(tree.readyBuild({ stateFile: failed, ...readiness, write: () => {} }),
    /build-readiness failed after \d+ms: cycle 4 failed \(go-1 failed after 2s\)/);
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
