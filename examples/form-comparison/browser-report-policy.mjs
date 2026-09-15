import assert from 'node:assert/strict';

import {
  formFrameworks, formInitializations, formRenderingPaths, formServers, formTransports,
  initializationCategories, initializationComparisons,
} from './src/runtime-paths.mjs';

export const browserServers = formServers;
export const browserPaths = formRenderingPaths;
export const browserFrameworks = formFrameworks;
export const browserTransports = formTransports;
export const browserServerRunBudgetMs = 15 * 60 * 1000;
export const browserScenarioCheckIds = [
  'identity', 'render', 'plus', 'copy', 'order', 'inject', 'transport',
  'nonsequential', 'saved', 'serverValid', 'serverInvalid', 'exact',
  'empty', 'deletion', 'shape', 'equivalence', 'jsonSyntax', 'keyedNames', 'cache',
];
export const browserInitializationResultIds = initializationComparisons.flatMap(label =>
  initializationCategories.map(category => `${label}/${category}`));

const interactionActions = ['pointer', 'keyboard', 'condition', 'validation', 'empty-keyboard'];

/**
 * Expected check totals of one rendering path across every server, derived from the
 * browser matrix: the only place these totals are defined.
 */
export function expectedBrowserSections() {
  const reports = browserServers.length * browserFrameworks.length;
  return {
    scenarios: reports * browserTransports.length * browserScenarioCheckIds.length,
    initializations: reports * browserInitializationResultIds.length,
    interactions: reports * browserTransports.length * interactionActions.length,
    mounts: reports,
    documents: reports * formInitializations.length,
  };
}

function exactKeys(actual, expected, label) {
  assert.deepEqual([...new Set(actual)].sort(), [...expected].sort(), `${label} combinations differ`);
  assert.equal(actual.length, expected.length, `${label} contains duplicates`);
}

function reportCombinations() {
  return browserPaths.flatMap(renderingPath => browserFrameworks.flatMap(framework =>
    browserTransports.map(transport => `${renderingPath}/${framework}/${transport}`)));
}

function interactionCombinations() {
  return browserPaths.flatMap(renderingPath => browserFrameworks.flatMap(framework =>
    browserTransports.flatMap(transport => interactionActions
      .map(action => `${renderingPath}/${framework}/${transport}/${action}`))));
}

function documentCombinations() {
  return browserPaths.flatMap(renderingPath =>
    browserFrameworks.map(framework => `${renderingPath}/${framework}`));
}

/** Both initialization documents of every rendering path and framework. */
function frameDocumentCombinations() {
  return documentCombinations().flatMap(combination =>
    formInitializations.map(initialization => `${combination}/${initialization}`));
}

/** Reports one server's browser job produces: its scenario reports and initialization reports. */
export function browserJobReportCount() {
  return reportCombinations().length + documentCombinations().length;
}

function pathSummary(items, checks) {
  return Object.fromEntries(browserPaths.map(renderingPath => {
    const selected = items.filter(item => item.path === renderingPath);
    const entries = checks ? selected.flatMap(item => item.results) : selected;
    return [renderingPath, {
      total: entries.length,
      failed: entries.filter(item => !item.passed).length,
    }];
  }));
}

function verifyTiming(value, label) {
  assert.ok(typeof value.startedAt === 'string' && !Number.isNaN(Date.parse(value.startedAt)), `${label}: startedAt`);
  assert.ok(typeof value.completedAt === 'string' && !Number.isNaN(Date.parse(value.completedAt)), `${label}: completedAt`);
  assert.ok(Date.parse(value.completedAt) >= Date.parse(value.startedAt), `${label}: completion order`);
  assert.ok(Number.isFinite(value.durationMs) && value.durationMs >= 0, `${label}: durationMs`);
}

function verifyActivity(activity, report, label) {
  assert.ok(activity && typeof activity === 'object' && !Array.isArray(activity), `${label}: activity`);
  for (const field of ['requests', 'responses']) {
    assert.ok(Number.isSafeInteger(activity[field]) && activity[field] > 0,
      `${label}: activity ${field}`);
  }
  assert.ok(activity.responses <= activity.requests, `${label}: activity response count`);
  for (const field of ['lastRequestAt', 'lastResponseAt']) {
    assert.ok(typeof activity[field] === 'string' && !Number.isNaN(Date.parse(activity[field])),
      `${label}: activity ${field}`);
    assert.ok(Date.parse(activity[field]) >= Date.parse(report.startedAt)
      && Date.parse(activity[field]) <= Date.parse(report.completedAt),
    `${label}: activity ${field} range`);
  }
}

function verifyInitialization(item, report, label) {
  verifyTiming(item, label);
  assert.equal(item.kind, 'initialization', `${label}: report kind`);
  assert.equal(item.commit, report.metadata?.source?.commit, `${label}: source commit`);
  assert.ok(Array.isArray(item.results), `${label}: comparison results`);
  assert.deepEqual(item.results.map(result => `${result.label}/${result.category}`),
    browserInitializationResultIds, `${label}: comparison IDs`);
  assert.ok(item.results.every(result => typeof result.passed === 'boolean'),
    `${label}: comparison result`);
  assert.ok(Array.isArray(item.stages) && item.stages.length > 0, `${label}: initialization stages`);
  assert.ok(item.cssFailures && typeof item.cssFailures === 'object'
    && !Array.isArray(item.cssFailures), `${label}: initialization CSS failures`);
}

export function verifyServerReport(report, expectedServer) {
  assert.ok(browserServers.includes(expectedServer), 'Expected a supported browser server');
  const label = `${expectedServer} verification`;
  assert.equal(report.scope, 'verification', `${label}: report scope`);
  assert.ok(typeof report.generatedAt === 'string' && !Number.isNaN(Date.parse(report.generatedAt)), `${label}: generatedAt`);
  verifyTiming(report, `${label}: server run`);
  assert.deepEqual(
    { status: report.scenarioJob?.status, completedReports: report.scenarioJob?.completedReports, totalReports: report.scenarioJob?.totalReports },
    { status: 'completed', completedReports: browserJobReportCount(), totalReports: browserJobReportCount() },
    `${label}: scenario job`,
  );
  verifyTiming(report.scenarioJob, `${label}: scenario job`);
  assert.ok(typeof report.browser === 'string' && report.browser.length > 0, `${label}: browser version`);
  assert.ok(Array.isArray(report.pageErrors) && report.pageErrors.every(error => typeof error === 'string'),
    `${label}: browser page errors`);
  verifyActivity(report.activity, report, label);
  assert.ok(typeof report.initializationArtifacts === 'string'
    && /^initialization-/.test(report.initializationArtifacts),
  `${label}: initialization artifacts`);

  assert.ok(Array.isArray(report.reports), `${label}: scenario reports`);
  assert.equal(report.reports.length, reportCombinations().length, `${label}: scenario report count`);
  assert.ok(report.reports.every(item => item.server === expectedServer), `${label}: scenario server`);
  exactKeys(report.reports.map(item => `${item.path}/${item.framework}/${item.transport}`),
    reportCombinations(), `${label}: scenario`);
  for (const item of report.reports) {
    const itemLabel = `${expectedServer}/${item.path}/${item.framework}/${item.transport}`;
    verifyTiming(item, itemLabel);
    assert.equal(item.commit, report.metadata?.source?.commit, `${itemLabel}: source commit`);
    assert.deepEqual(item.results.map(result => result.id), browserScenarioCheckIds, `${itemLabel}: check IDs`);
    assert.equal(item.kind, 'scenario', `${itemLabel}: report kind`);
    assert.ok(item.results.every(result => typeof result.passed === 'boolean'), `${itemLabel}: check result`);
  }

  assert.ok(Array.isArray(report.initializations), `${label}: initialization reports`);
  assert.equal(report.initializations.length, documentCombinations().length, `${label}: initialization report count`);
  assert.ok(report.initializations.every(item => item.server === expectedServer),
    `${label}: initialization server`);
  exactKeys(report.initializations.map(item => `${item.path}/${item.framework}`),
    documentCombinations(), `${label}: initialization`);
  for (const item of report.initializations) {
    verifyInitialization(item, report, `${expectedServer}/${item.path}/${item.framework}/initialization`);
  }

  assert.ok(Array.isArray(report.interactions), `${label}: interactions`);
  assert.equal(report.interactions.length, interactionCombinations().length, `${label}: interaction count`);
  assert.ok(report.interactions.every(item => item.server === expectedServer), `${label}: interaction server`);
  exactKeys(report.interactions.map(item => `${item.path}/${item.framework}/${item.transport}/${item.action}`),
    interactionCombinations(), `${label}: interaction`);
  assert.ok(report.interactions.every(item => typeof item.passed === 'boolean'),
    `${label}: interaction result`);

  for (const [name, items, combinations, key] of [
    ['mount-before-load', report.initialMounts, documentCombinations(),
      item => `${item.path}/${item.framework}`],
    ['frame-document', report.frameDocuments, frameDocumentCombinations(),
      item => `${item.path}/${item.framework}/${item.initialization}`],
  ]) {
    assert.ok(Array.isArray(items), `${label}: ${name}`);
    assert.equal(items.length, combinations.length, `${label}: ${name} count`);
    assert.ok(items.every(item => item.server === expectedServer), `${label}: ${name} server`);
    exactKeys(items.map(key), combinations, `${label}: ${name}`);
    assert.ok(items.every(item => typeof item.passed === 'boolean'), `${label}: ${name} result`);
    if (name === 'frame-document') {
      assert.ok(items.every(item => typeof item.frameSha256 === 'string' && /^[0-9a-f]{64}$/.test(item.frameSha256)),
        `${label}: frame-document SHA-256`);
    }
  }

  const scenarios = pathSummary(report.reports, true);
  const initializations = pathSummary(report.initializations, true);
  const interactions = pathSummary(report.interactions, false);
  const mounts = pathSummary(report.initialMounts, false);
  const documents = pathSummary(report.frameDocuments, false);
  const resultCount = report.reports.reduce(
    (total, item) => total + item.results.filter(result => !result.passed).length, 0,
  ) + report.initializations.reduce(
    (total, item) => total + item.results.filter(result => !result.passed).length, 0,
  ) + report.interactions.filter(item => !item.passed).length
    + report.initialMounts.filter(item => !item.passed).length
    + report.frameDocuments.filter(item => !item.passed).length;
  const performance = {
    durationMs: report.durationMs,
    budgetMs: browserServerRunBudgetMs,
    passed: report.durationMs <= browserServerRunBudgetMs,
  };

  const common = {
    server: expectedServer,
    scope: 'verification',
    generatedAt: report.generatedAt,
    browser: report.browser,
    complete: true,
    performance,
    scenarios, initializations, interactions, mounts, documents,
  };
  const failedChecks = resultCount + report.pageErrors.length;
  return { ...common, passed: failedChecks === 0 && performance.passed, failedChecks };
}
