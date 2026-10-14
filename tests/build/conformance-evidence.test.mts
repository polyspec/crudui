import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { checkConformance, evidenceSuites, readEvidence, readRuns, suiteStates, summarize } from '../../scripts/check-conformance.mts';
import { recordConformance } from '../conformance/evidence.mts';
import { parseJson, type JTDSchemaType } from '../json.mts';

/** A suite run record as tests/conformance/runs.mts writes it. */
interface RunRecord { program: string; tool: string | null; cwd: string; args: string[]; started: string; status: number | null }
const runSchema: JTDSchemaType<RunRecord> = {
  properties: {
    program: { type: 'string' }, tool: { type: 'string', nullable: true }, cwd: { type: 'string' }, args: { elements: { type: 'string' } },
    started: { type: 'string' }, status: { type: 'int32', nullable: true },
  },
};

const ROOT = path.resolve(import.meta.dirname, '../..');

const fixture = 'tests/fixtures/list-render/cases.json';
const feature = { id: 'renderList', support: { php: 'pass', go: 'unsupported' }, fixtures: [fixture] };
const registry = [{ path: fixture, kind: 'list-html' }];
const base = { features: [feature], registry, cases: { [fixture]: ['a', 'b'] }, families: ['tests/fixtures/list-render'] };
const record = (runtime: string, name: string, passed = true, extra = {}) => ({ feature: 'renderList', fixture, runtime, case: name, passed, ...extra });

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
    features: [{ ...feature, fixtures: [fixture, 'tests/fixtures/form-session/scenario.mts'] }],
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
    { feature: 'renderList', fixture: 'tests/fixtures/form-session/scenario.mts' },
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
    const [file] = files;
    assert.ok(file !== undefined);
    const lines = (await readFile(path.join(directory, file), 'utf8')).trim().split('\n').map((line): unknown => JSON.parse(line));
    assert.deepEqual(lines, [record('php', 'a'), record('php', 'b', false)]);
    // A record that arrives as JSON from a recorder of another language, whose passed is no boolean.
    const parsed: unknown = JSON.parse(JSON.stringify({ ...record('php', 'a'), passed: 'yes' }));
    assert.throws(() => Reflect.apply(recordConformance, undefined, [parsed]), /passed must be a boolean/);
  } finally {
    if (previous === undefined) delete process.env.CRUDUI_CONFORMANCE_EVIDENCE;
    else process.env.CRUDUI_CONFORMANCE_EVIDENCE = previous;
    await rm(directory, { recursive: true, force: true });
  }
});

const suites = [
  { name: 'validator PHP', run: { program: 'tests/conformance/run-suite.mts', tool: 'phpunit', cwd: 'packages/validator/php' }, runtimes: ['php'] },
  { name: 'native generators', run: { program: 'tests/native-generators/run.mts' }, runtimes: ['php', 'go'] },
  { name: 'PHP extension', run: { program: 'tests/conformance/run-suite.mts', tool: 'node', argument: 'packages/php-ext/tests/engine.test.mjs' }, runtimes: ['php-native'] },
  { name: 'Svelte renderer', run: { program: 'tests/conformance/run-suite.mts', tool: 'vitest', cwd: 'packages/svelte' }, runtimes: ['svelte'] },
];
/** The fields of a run record that a case sets; the others take the values of a run of the native suite. */
interface RunFields { program: string; tool?: string; cwd?: string; args?: string[] }
const run = (fields: RunFields, started: string, status: number | null) => ({ tool: null, cwd: '.', args: [], ...fields, started, status });

// CI downloads the evidence of each job into a directory of its own, so files of two jobs with the same name, such as
// php-<pid>.jsonl of processes with the same id on two runners, are both read.
test('the check reads the evidence and the run records of every subdirectory', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'crudui-evidence-jobs-'));
  try {
    for (const [job, name] of [['conformance-evidence-php-api-8.4', 'a'], ['conformance-evidence-php-api-8.5', 'b']] as const) {
      await mkdir(path.join(directory, job, 'runs'), { recursive: true });
      await writeFile(path.join(directory, job, 'php-1234.jsonl'), `${JSON.stringify(record('php', name))}\n`);
      await writeFile(path.join(directory, job, 'runs', '1234-0a.json'), `${JSON.stringify(run({ program: 'tests/native-generators/run.mts' }, '2026-10-07T10:00:00.000Z', 0))}\n`);
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
    run({ program: 'tests/conformance/run-suite.mts', tool: 'phpunit', cwd: 'packages/validator/php' }, '2026-10-05T10:00:00.000Z', 1),
    run({ program: 'tests/conformance/run-suite.mts', tool: 'phpunit', cwd: 'packages/validator/php' }, '2026-10-05T11:00:00.000Z', 0),
    run({ program: 'tests/conformance/run-suite.mts', tool: 'node', args: ['packages/php-ext/tests/engine.test.mjs', 'packages/php-ext/tests/api.test.mjs'] }, '2026-10-05T10:00:00.000Z', null),
    run({ program: 'tests/conformance/run-suite.mts', tool: 'vitest', cwd: 'packages/svelte' }, '2026-10-05T10:00:00.000Z', 0),
    run({ program: 'tests/conformance/run-suite.mts', tool: 'vitest', cwd: 'packages/svelte', args: ['--config', 'vitest.client.config.ts'] }, '2026-10-05T10:01:00.000Z', 2),
    run({ program: 'tests/conformance/run-suite.mts', tool: 'go', cwd: 'packages/generator/go' }, '2026-10-05T10:00:00.000Z', 1),
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
  const standard = parseJson<{ features: { support: Record<string, string> }[] }>(await readFile(path.join(ROOT, 'contracts/features.json'), 'utf8'), {
    properties: { features: { elements: { properties: { support: { values: { type: 'string' } } }, additionalProperties: true } } },
    additionalProperties: true,
  }, 'contracts/features.json');
  const supported = new Set(standard.features.flatMap(item => Object.entries(item.support)
    .filter(([, support]) => support === 'pass').map(([runtime]) => runtime)));
  const proven = new Set(evidenceSuites.flatMap(suite => suite.runtimes));
  assert.deepEqual([...supported].filter(runtime => !proven.has(runtime)).sort(), []);
});

test('the suite runner and the native suite leave a run record with their exit status', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'crudui-suite-runs-'));
  try {
    const passing = path.join(directory, 'pass.test.mjs');
    const failing = path.join(directory, 'fail.test.mjs');
    await writeFile(passing, "import test from 'node:test';\ntest('passes', () => {});\n");
    await writeFile(failing, "import test from 'node:test';\ntest('fails', () => { throw new Error('failed'); });\n");
    const evidence = path.join(directory, 'evidence');
    const env: NodeJS.ProcessEnv = { ...process.env, CRUDUI_CONFORMANCE_EVIDENCE: evidence };
    delete env.NODE_TEST_CONTEXT;
    for (const file of [passing, failing]) {
      spawnSync(process.execPath, [path.join(ROOT, 'tests/conformance/run-suite.mts'), 'node', '--', file], { cwd: ROOT, env, encoding: 'utf8' });
    }
    // The native suite records its run before it reads its arguments, so a usage error ends the run.
    spawnSync(process.execPath, [path.join(ROOT, 'tests/native-generators/run.mts'), '--unknown'], { cwd: ROOT, env, encoding: 'utf8' });
    const runs = await Promise.all((await readdir(path.join(evidence, 'runs'))).map(async file => (
      parseJson(await readFile(path.join(evidence, 'runs', file), 'utf8'), runSchema, file))));
    const summary = runs.map(({ program, tool, cwd, args, status }) => ({ program, tool, cwd, args, status }))
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
    assert.deepEqual(summary, [
      { program: 'tests/conformance/run-suite.mts', tool: 'node', cwd: '.', args: [failing], status: 1 },
      { program: 'tests/conformance/run-suite.mts', tool: 'node', cwd: '.', args: [passing], status: 0 },
      { program: 'tests/native-generators/run.mts', tool: null, cwd: '.', args: ['--unknown'], status: 1 },
    ]);
    assert.ok(runs.every(item => !Number.isNaN(Date.parse(item.started))));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('a partial runtime is measured by the cases it records, and each recorded case must pass', () => {
  const partial = { ...feature, support: { php: 'partial', go: 'unsupported' } };
  const withPartial = { ...base, features: [partial] };
  const proven = checkConformance({ ...withPartial, evidence: [record('php', 'a')] });
  assert.deepEqual(proven, { undeclaredFixtures: [], unregisteredFamilies: [], unprovenFixtures: [], missing: [], failed: [], undeclaredEvidence: [] });
  const failing = checkConformance({ ...withPartial, evidence: [record('php', 'a', false)] });
  assert.deepEqual(failing.failed, [{ feature: 'renderList', fixture, runtime: 'php', case: 'a' }]);
  assert.deepEqual(failing.undeclaredEvidence, []);
  const outside = checkConformance({ ...withPartial, evidence: [record('php', 'c'), record('go', 'a')] });
  assert.deepEqual(outside.undeclaredEvidence.map(item => item.reason), ['case not in the fixture', 'runtime declared unsupported']);
});
