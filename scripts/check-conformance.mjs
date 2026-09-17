#!/usr/bin/env node
// Conformance evidence check. contracts/features.json is the standard: each feature declares
// the runtimes that support it and the shared fixtures that prove it. Every test that runs a
// shared fixture case records evidence (tests/conformance/evidence.mjs and its PHP, Go and Rust
// counterparts). This check fails when a supported runtime has no passing evidence for a case,
// when evidence exists for a runtime the standard does not declare, when a fixture family is not
// registered and when a registered case fixture is proven by no feature. A registered corpus is
// shared input without cases.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createProgress } from './test-progress/progress.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Compare the required evidence with the recorded evidence.
 *
 * @param {object} input
 * @param {Array<{id: string, support: Record<string, string>, fixtures: string[]}>} input.features
 * @param {Array<{path: string, kind: string}>} input.registry the declared fixtures
 * @param {Record<string, string[]>} input.cases case names of every declared case fixture
 * @param {string[]} input.families every fixture family path under tests/fixtures
 * @param {Array<{feature: string, fixture: string, runtime: string, case: string, passed: boolean}>} input.evidence
 */
export function checkConformance({ features, registry, cases, families, evidence }) {
  const key = (feature, fixture, runtime, name) => JSON.stringify([feature, fixture, runtime, name]);
  const recorded = new Map();
  for (const item of evidence) {
    const id = key(item.feature, item.fixture, item.runtime, item.case);
    // A case recorded more than once passes only when every run passed.
    recorded.set(id, (recorded.get(id) ?? true) && item.passed === true);
  }
  const required = new Set();
  const declared = new Map();
  const problems = {
    undeclaredFixtures: [], unregisteredFamilies: [], unprovenFixtures: [], missing: [], failed: [], undeclaredEvidence: [],
  };
  const registered = new Map(registry.map(fixture => [fixture.path, fixture]));
  for (const feature of features) {
    declared.set(feature.id, feature);
    for (const fixture of feature.fixtures) {
      const names = registered.get(fixture)?.kind === 'corpus' ? undefined : cases[fixture];
      if (!names) {
        problems.undeclaredFixtures.push({ feature: feature.id, fixture });
        continue;
      }
      for (const [runtime, support] of Object.entries(feature.support)) {
        if (support !== 'pass') continue;
        for (const name of names) {
          const id = key(feature.id, fixture, runtime, name);
          required.add(id);
          if (!recorded.has(id)) problems.missing.push({ feature: feature.id, fixture, runtime, case: name });
          else if (!recorded.get(id)) problems.failed.push({ feature: feature.id, fixture, runtime, case: name });
        }
      }
    }
  }
  // Every family directory is registered, and every registered case fixture is proven by a feature.
  for (const family of families) {
    if (!registry.some(fixture => fixture.path.startsWith(`${family}/`))) problems.unregisteredFamilies.push(family);
  }
  const proven = new Set(features.flatMap(feature => feature.fixtures));
  for (const fixture of registry) {
    if (fixture.kind !== 'corpus' && !proven.has(fixture.path)) problems.unprovenFixtures.push(fixture.path);
  }
  const reported = new Set();
  for (const item of evidence) {
    const id = key(item.feature, item.fixture, item.runtime, item.case);
    if (required.has(id) || reported.has(id)) continue;
    reported.add(id);
    const feature = declared.get(item.feature);
    const support = feature?.support[item.runtime];
    const reason = !feature ? 'unknown feature'
      : !feature.fixtures.includes(item.fixture) ? 'fixture not declared by the feature'
        : support === undefined ? 'runtime not declared by the feature'
          : support !== 'pass' ? `runtime declared ${support}`
            : 'case not in the fixture';
    problems.undeclaredEvidence.push({ ...item, reason });
  }
  return problems;
}

/** Group the missing and failed cases by feature, fixture and runtime for a readable report. */
export function summarize(problems) {
  const groups = new Map();
  for (const [state, list] of [['missing', problems.missing], ['failed', problems.failed]]) {
    for (const item of list) {
      const id = `${item.feature} · ${item.fixture} · ${item.runtime}`;
      const group = groups.get(id) ?? { id, missing: [], failed: [] };
      group[state].push(item.case);
      groups.set(id, group);
    }
  }
  return [...groups.values()];
}

/**
 * Case names of a registered fixture: the `name` of every case in a cases.json or in the module
 * export the registry names, or the module's declared cases.
 */
async function fixtureCases(fixture) {
  if (fixture.path.endsWith('/cases.json')) {
    const cases = JSON.parse(await readFile(path.join(ROOT, fixture.path), 'utf8'));
    return cases.map(item => item.name);
  }
  if (fixture.export) {
    const module = await import(pathToFileURL(path.join(ROOT, fixture.path)).href);
    return module[fixture.export].map(item => item.name);
  }
  return fixture.cases;
}

async function readEvidence(directory) {
  const evidence = [];
  let files = [];
  try { files = await readdir(directory); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  for (const file of files.filter(name => name.endsWith('.jsonl')).sort()) {
    const text = await readFile(path.join(directory, file), 'utf8');
    for (const line of text.split('\n').filter(Boolean)) evidence.push(JSON.parse(line));
  }
  return { evidence, files: files.length };
}

async function main() {
  const directory = process.env.CRUDUI_CONFORMANCE_EVIDENCE;
  if (!directory) throw new Error('CRUDUI_CONFORMANCE_EVIDENCE names the evidence directory');
  const standard = JSON.parse(await readFile(path.join(ROOT, 'contracts/features.json'), 'utf8'));
  const features = standard.features.map(({ id, support, fixtures }) => ({ id, support, fixtures }));
  const registry = standard.fixtures;
  const cases = {};
  for (const fixture of registry) {
    const names = fixture.kind === 'corpus' ? undefined : await fixtureCases(fixture);
    if (names) cases[fixture.path] = names;
  }
  const families = (await readdir(path.join(ROOT, 'tests/fixtures'), { withFileTypes: true }))
    .filter(entry => entry.isDirectory()).map(entry => `tests/fixtures/${entry.name}`).sort();
  const { evidence, files } = await readEvidence(path.resolve(directory));
  const problems = checkConformance({ features, registry, cases, families, evidence });
  const lines = createProgress({ write: text => process.stdout.write(text) });
  const out = text => lines.line(text);
  lines.start('conformance: evidence against contracts/features.json', { group: true });
  out(`conformance: ${evidence.length} evidence records from ${files} files`);
  for (const item of problems.undeclaredFixtures) out(`✖ ${item.feature} names ${item.fixture}, which is not a registered case fixture`);
  for (const family of problems.unregisteredFamilies) out(`✖ ${family} has no registered fixture`);
  for (const fixture of problems.unprovenFixtures) out(`✖ ${fixture} is proven by no feature`);
  for (const group of summarize(problems)) {
    const parts = [];
    if (group.missing.length) parts.push(`${group.missing.length} missing (${group.missing.slice(0, 3).join(', ')}${group.missing.length > 3 ? ', …' : ''})`);
    if (group.failed.length) parts.push(`${group.failed.length} failed (${group.failed.slice(0, 3).join(', ')}${group.failed.length > 3 ? ', …' : ''})`);
    out(`✖ ${group.id}: ${parts.join(', ')}`);
  }
  const undeclared = new Map();
  for (const item of problems.undeclaredEvidence) {
    const id = `${item.feature} · ${item.fixture} · ${item.runtime}: ${item.reason}`;
    undeclared.set(id, (undeclared.get(id) ?? 0) + 1);
  }
  for (const [id, count] of undeclared) out(`✖ evidence without a declaration: ${id} (${count} cases)`);
  const failing = problems.undeclaredFixtures.length + problems.unregisteredFamilies.length + problems.unprovenFixtures.length + problems.missing.length
    + problems.failed.length + problems.undeclaredEvidence.length;
  if (failing) lines.fail('conformance: evidence against contracts/features.json', undefined, `${failing} problems`);
  else lines.pass('conformance: evidence against contracts/features.json');
  lines.close('conformance');
  process.exitCode = failing ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
