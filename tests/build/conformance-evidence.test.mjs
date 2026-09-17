import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { checkConformance, summarize } from '../../scripts/check-conformance.mjs';
import { recordConformance } from '../conformance/evidence.mjs';

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
  assert.deepEqual(summarize(none), [{ id: `renderList · ${fixture} · php`, missing: ['a', 'b'], failed: [] }]);
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
    features: [{ ...feature, fixtures: [fixture, 'tests/fixtures/form-session/scenario.mjs', 'tests/fixtures/specs/Product.yml'] }],
    registry: [
      ...registry,
      { path: 'tests/fixtures/translate/cases.json', kind: 'translation' },
      { path: 'tests/fixtures/specs/Product.yml', kind: 'corpus' },
    ],
    cases: { ...base.cases, 'tests/fixtures/translate/cases.json': ['t'] },
    families: ['tests/fixtures/list-render', 'tests/fixtures/translate', 'tests/fixtures/form-session', 'tests/fixtures/specs'],
    evidence: [record('php', 'a'), record('php', 'b')],
  });
  assert.deepEqual(problems.unregisteredFamilies, ['tests/fixtures/form-session']);
  assert.deepEqual(problems.unprovenFixtures, ['tests/fixtures/translate/cases.json']);
  assert.deepEqual(problems.undeclaredFixtures, [
    { feature: 'renderList', fixture: 'tests/fixtures/form-session/scenario.mjs' },
    { feature: 'renderList', fixture: 'tests/fixtures/specs/Product.yml' },
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
