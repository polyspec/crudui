import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertGenerationReportInvariants,
  expectedGenerationRequests,
  expectedGenerationResults,
  expectedGenerationCombinations,
  finalizeGenerationReport,
  generationFrameworks,
  generationRenderingPaths,
  generationServers,
  requiredCombinationIds,
} from './check-generation.mjs';

function completeReport() {
  const hash = 'a'.repeat(64);
  const results = [
    { server: 'shared', path: 'all', framework: 'all', id: 'library-and-source', passed: true },
    ...generationServers.flatMap(server => generationRenderingPaths.flatMap(path =>
      generationFrameworks.flatMap(framework =>
      requiredCombinationIds.map(id => ({
        server, path, framework, id, passed: true, evidence: id === 'compile-reference'
          ? { serializedTemplateSha256: hash, referenceReads: server === 'go' || server === 'rust' ? 1 : null }
          : id === 'reject-missing-reference'
            ? { retainedTemplateSha256: hash }
            : id.startsWith('render-and-inject/')
              ? { afterRejectedCompile: true, serializedTemplateSha256: hash }
              : {},
      }))))),
    { server: 'shared', path: 'all', framework: 'all', id: 'unchanged-library-inputs', passed: true },
  ];
  return {
    servers: [...generationServers],
    renderingPaths: [...generationRenderingPaths],
    frameworks: [...generationFrameworks],
    requests: Array.from({ length: expectedGenerationRequests }, (_, index) => ({ endpoint: `/request/${index}` })),
    results,
  };
}

test('accepts the complete current generation matrix', () => {
  const report = completeReport();
  assert.equal(report.results.length, expectedGenerationResults);
  assert.doesNotThrow(() => assertGenerationReportInvariants(report));
  finalizeGenerationReport(report, '2026-09-09T00:00:00.000Z');
  assert.deepStrictEqual(report.invariants, {
    passed: true, results: 290, requests: 411, combinations: 24,
  });
  assert.equal(report.passed, 290);
  assert.equal(report.failed, 0);
});

test('rejects missing and duplicate required combination IDs', () => {
  const missing = completeReport();
  missing.results.splice(missing.results.findIndex(result =>
    result.server === 'php' && result.path === 'bindForm'
      && result.framework === 'react' && result.id === 'render-and-inject/default-rows'), 1);
  assert.throws(() => assertGenerationReportInvariants(missing), error =>
    error.message.includes('php/bindForm/react: required generation check IDs or order differ'));

  const duplicate = completeReport();
  duplicate.results.push({ server: 'php', path: 'bindForm', framework: 'react',
    id: 'compile-reference', passed: true });
  assert.throws(() => assertGenerationReportInvariants(duplicate), error =>
    error.message.includes('php/bindForm/react: required generation check IDs or order differ'));
});

test('rejects missing evidence that the serialized template survived compile failure', () => {
  const report = completeReport();
  const render = report.results.find(result =>
    result.server === 'rust' && result.path === 'createForm'
      && result.framework === 'vue' && result.id === 'render-and-inject/default-rows');
  delete render.evidence.afterRejectedCompile;
  assert.throws(() => assertGenerationReportInvariants(report), /missing rejected-compile reuse evidence/);
});

test('rejects missing combinations and changed request totals', () => {
  const missingCombination = completeReport();
  missingCombination.results = missingCombination.results.filter(result =>
    result.server !== 'rust' || result.path !== 'createForm' || result.framework !== 'svelte');
  assert.throws(() => assertGenerationReportInvariants(missingCombination), error =>
    error.message.includes(`${expectedGenerationCombinations} server/rendering-path/framework combinations`));

  const shortRequests = completeReport();
  shortRequests.requests.pop();
  assert.throws(() => assertGenerationReportInvariants(shortRequests), /exactly 411 HTTP requests/);
});

test('records an invariant failure instead of allowing an incomplete run to pass', () => {
  const report = completeReport();
  report.results.splice(report.results.findIndex(result =>
    result.server === 'go' && result.path === 'bindForm'
      && result.framework === 'vue' && result.id === 'ssr/ko'), 1);
  finalizeGenerationReport(report, '2026-09-09T00:00:00.000Z');
  assert.equal(report.invariants.passed, false);
  assert.equal(report.results.at(-1).id, 'checker-invariants');
  assert.equal(report.results.at(-1).passed, false);
  assert.equal(report.failed, 1);
});

test('retains an ordinary check failure when the report structure is complete', () => {
  const report = completeReport();
  report.results.find(result => result.server === 'php-ext' && result.framework === 'svelte').passed = false;
  finalizeGenerationReport(report, '2026-09-09T00:00:00.000Z');
  assert.equal(report.invariants.passed, true);
  assert.equal(report.passed, 289);
  assert.equal(report.failed, 1);
});
