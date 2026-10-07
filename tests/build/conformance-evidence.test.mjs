import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { checkConformance, evidenceSuites, readEvidence, readRuns, suiteStates, summarize } from '../../scripts/check-conformance.mjs';
import { recordConformance } from '../conformance/evidence.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');

const fixture = 'tests/fixtures/list-render/cases.json';
const feature = { id: 'renderList', support: { php: 'pass', go: 'unsupported' }, fixtures: [fixture] };
const registry = [{ path: fixture, kind: 'list-html' }];
const base = { features: [feature], registry, cases: { [fixture]: ['a', 'b'] }, families: ['tests/fixtures/list-render'] };
const record = (runtime, name, passed = true, extra = {}) => ({ feature: 'renderList', fixture, runtime, case: name, passed, ...extra });

test('every case of a supported runtime needs passing evidence', () => {
  const problems = checkConformance({ ...base, evidence: [record('php', 'a'), record('php', 'b', false)] });
  assert.deepEqual(problems.missing, []);
  assert.deepEqual(problems.failed, [{ feature: 'renderList', fixture, runtime: 'php', case: 'b' }]);
  const none = checkConformance({ ...base, evidence: [] });
  assert.deepEqual(none.missing.map(item => item.case), ['a', 'b']);
  assert.deepEqual(summarize(none), [{ id: `renderList · ${fixture} · php`, runtime: 'php', missing: ['a', 'b'], failed: [], suites: [] }]);
});

test('a case recorded twice passes only when every run passed', () => {
  const problems = checkConformance({ ...base, evidence: [record('php', 'a'), record('php', 'a', false), record('php', 'b')] });
  assert.deepEqual(problems.failed.map(item => item.case), ['a']);
});

test('evidence for an unsupported or undeclared runtime, feature, fixture or case is reported', () => {
  const problems = checkConformance({
    ...base,
    evidence: [
      record('php', 'a'), record('php', 'b'),
      record('go', 'a'),
      record('rust', 'a'),
      record('php', 'c'),
      { ...record('php', 'a'), feature: 'renderTable' },
      { ...record('php', 'a'), fixture: 'tests/fixtures/detail-render/cases.json' },
    ],
  });
  assert.deepEqual(problems.undeclaredEvidence.map(item => item.reason), [
    'runtime declared unsupported',
    'runtime not declared by the feature',
    'case not in the fixture',
    'unknown feature',
    'fixture not declared by the feature',
  ]);
});

test('unregistered families, unproven fixtures and named fixtures without cases are reported', () => {
  const problems = checkConformance({
    features: [{ ...feature, fixtures: [fixture, 'tests/fixtures/form-session/scenario.mjs'] }],
    registry: [
      ...registry,
      { path: 'tests/fixtures/expr/cases.json', kind: 'expression' },
    ],
    cases: { ...base.cases, 'tests/fixtures/expr/cases.json': ['t'] },
    families: ['tests/fixtures/list-render', 'tests/fixtures/expr', 'tests/fixtures/form-session'],
    evidence: [record('php', 'a'), record('php', 'b')],
  });
  assert.deepEqual(problems.unregisteredFamilies, ['tests/fixtures/form-session']);
  assert.deepEqual(problems.unprovenFixtures, ['tests/fixtures/expr/cases.json']);
  assert.deepEqual(problems.undeclaredFixtures, [
    { feature: 'renderList', fixture: 'tests/fixtures/form-session/scenario.mjs' },
  ]);
});

test('the JavaScript recorder appends one line per case only when an evidence directory is set', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'crudui-evidence-'));
  const previous = process.env.CRUDUI_CONFORMANCE_EVIDENCE;
  try {
    delete process.env.CRUDUI_CONFORMANCE_EVIDENCE;
    recordConformance(record('php', 'a'));
    assert.deepEqual(await readdir(directory), []);
    process.env.CRUDUI_CONFORMANCE_EVIDENCE = directory;
    recordConformance(record('php', 'a'));
    recordConformance(record('php', 'b', false));
    const files = await readdir(directory);
    assert.equal(files.length, 1);
    const lines = (await readFile(path.join(directory, files[0]), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
    assert.deepEqual(lines, [record('php', 'a'), record('php', 'b', false)]);
    assert.throws(() => recordConformance({ ...record('php', 'a'), passed: 'yes' }), /passed must be a boolean/);
  } finally {
    if (previous === undefined) delete process.env.CRUDUI_CONFORMANCE_EVIDENCE;
    else process.env.CRUDUI_CONFORMANCE_EVIDENCE = previous;
    await rm(directory, { recursive: true, force: true });
  }
});

const suites = [
  { name: 'validator PHP', run: { program: 'scripts/run-tests.mjs', tool: 'phpunit', cwd: 'packages/validator-php' }, runtimes: ['php'] },
  { name: 'native generators', run: { program: 'tests/native-generators/run.mjs' }, runtimes: ['php', 'go'] },
  { name: 'PHP extension', run: { program: 'scripts/run-tests.mjs', tool: 'node', argument: 'packages/php-ext/tests/engine.test.mjs' }, runtimes: ['php-native'] },
  { name: 'Svelte renderer', run: { program: 'scripts/run-tests.mjs', tool: 'vitest', cwd: 'packages/generator-svelte' }, runtimes: ['svelte'] },
];
const run = (fields, started, status) => ({ tool: null, cwd: '.', args: [], ...fields, started, status });

// CI downloads the evidence of each job into a directory of its own, so files of two jobs with the same name, such as
// php-<pid>.jsonl of processes with the same id on two runners, are both read.
test('the check reads the evidence and the run records of every subdirectory', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'crudui-evidence-jobs-'));
  try {
    for (const [job, name] of [['conformance-evidence-php-api-8.4', 'a'], ['conformance-evidence-php-api-8.5', 'b']]) {
      await mkdir(path.join(directory, job, 'runs'), { recursive: true });
      await writeFile(path.join(directory, job, 'php-1234.jsonl'), `${JSON.stringify(record('php', name))}\n`);
      await writeFile(path.join(directory, job, 'runs', '1234-0a.json'), `${JSON.stringify(run({ program: 'tests/native-generators/run.mjs' }, '2026-10-07T10:00:00.000Z', 0))}\n`);
      await writeFile(path.join(directory, job, 'runs', '1234-0b.json.partial'), '{');
    }
    await writeFile(path.join(directory, 'javascript-1234.jsonl'), `${JSON.stringify(record('javascript', 'a'))}\n`);
    const { evidence, files } = await readEvidence(directory);
    assert.equal(files, 3);
    assert.deepEqual(evidence.map(item => `${item.runtime} ${item.case}`).sort(), ['javascript a', 'php a', 'php b']);
    assert.equal((await readRuns(directory)).length, 2);
    assert.deepEqual(await readEvidence(path.join(directory, 'missing')), { evidence: [], files: 0 });
    assert.deepEqual(await readRuns(path.join(directory, 'missing')), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('missing evidence names each suite of its runtime that did not run, did not finish or failed', () => {
  const runs = [
    run({ program: 'scripts/run-tests.mjs', tool: 'phpunit', cwd: 'packages/validator-php' }, '2026-10-05T10:00:00.000Z', 1),
    run({ program: 'scripts/run-tests.mjs', tool: 'phpunit', cwd: 'packages/validator-php' }, '2026-10-05T11:00:00.000Z', 0),
    run({ program: 'scripts/run-tests.mjs', tool: 'node', args: ['packages/php-ext/tests/engine.test.mjs', 'packages/php-ext/tests/api.test.mjs'] }, '2026-10-05T10:00:00.000Z', null),
    run({ program: 'scripts/run-tests.mjs', tool: 'vitest', cwd: 'packages/generator-svelte' }, '2026-10-05T10:00:00.000Z', 0),
    run({ program: 'scripts/run-tests.mjs', tool: 'vitest', cwd: 'packages/generator-svelte', args: ['--config', 'vitest.client.config.ts'] }, '2026-10-05T10:01:00.000Z', 2),
    run({ program: 'scripts/run-tests.mjs', tool: 'go', cwd: 'packages/generator-go' }, '2026-10-05T10:00:00.000Z', 1),
  ];
  assert.deepEqual(Object.fromEntries(suiteStates(suites, runs)), {
    'validator PHP': 'passed',
    'native generators': 'did not run',
    'PHP extension': 'did not finish',
    'Svelte renderer': 'ended with failure (exit 2)',
  });
  const problems = checkConformance({ ...base, evidence: [record('php', 'a')] });
  assert.deepEqual(summarize(problems, { suites, runs }), [{
    id: `renderList · ${fixture} · php`, runtime: 'php', missing: ['b'], failed: [],
    suites: [{ name: 'validator PHP', state: 'passed' }, { name: 'native generators', state: 'did not run' }],
  }]);
});

test('every runtime that a feature supports is proven by a declared suite', async () => {
  const standard = JSON.parse(await readFile(path.join(ROOT, 'contracts/features.json'), 'utf8'));
  const supported = new Set(standard.features.flatMap(item => Object.entries(item.support)
    .filter(([, support]) => support === 'pass').map(([runtime]) => runtime)));
  const proven = new Set(evidenceSuites.flatMap(suite => suite.runtimes));
  assert.deepEqual([...supported].filter(runtime => !proven.has(runtime)).sort(), []);
});

test('the test runner and the native suite leave a run record with their exit status', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'crudui-suite-runs-'));
  try {
    const passing = path.join(directory, 'pass.test.mjs');
    const failing = path.join(directory, 'fail.test.mjs');
    await writeFile(passing, "import test from 'node:test';\ntest('passes', () => {});\n");
    await writeFile(failing, "import test from 'node:test';\ntest('fails', () => { throw new Error('failed'); });\n");
    const evidence = path.join(directory, 'evidence');
    const env = { ...process.env, CRUDUI_CONFORMANCE_EVIDENCE: evidence };
    delete env.NODE_TEST_CONTEXT;
    for (const file of [passing, failing]) {
      spawnSync(process.execPath, [path.join(ROOT, 'scripts/run-tests.mjs'), 'node', '--', file], { cwd: ROOT, env, encoding: 'utf8' });
    }
    // The native suite records its run before it reads its arguments, so a usage error ends the run.
    spawnSync(process.execPath, [path.join(ROOT, 'tests/native-generators/run.mjs'), '--unknown'], { cwd: ROOT, env, encoding: 'utf8' });
    const runs = await Promise.all((await readdir(path.join(evidence, 'runs'))).map(async file => (
      JSON.parse(await readFile(path.join(evidence, 'runs', file), 'utf8')))));
    const summary = runs.map(({ program, tool, cwd, args, status }) => ({ program, tool, cwd, args, status }))
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
    assert.deepEqual(summary, [
      { program: 'scripts/run-tests.mjs', tool: 'node', cwd: '.', args: [failing], status: 1 },
      { program: 'scripts/run-tests.mjs', tool: 'node', cwd: '.', args: [passing], status: 0 },
      { program: 'tests/native-generators/run.mjs', tool: null, cwd: '.', args: ['--unknown'], status: 1 },
    ]);
    assert.ok(runs.every(item => !Number.isNaN(Date.parse(item.started))));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
