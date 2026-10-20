#!/usr/bin/env node
// Conformance evidence check. contracts/features.json is the standard: each feature declares
// the runtimes that support it and the shared fixtures that prove it. Every test that runs a
// shared fixture case records evidence (tests/conformance/evidence.mts and its PHP, Go and Rust
// counterparts). This check fails when a supported runtime has no passing evidence for a case,
// when evidence exists for a runtime the standard does not declare, when a fixture family is not
// registered and when a registered fixture is proven by no feature.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createProgress } from '@polyspec/kit/test-progress';
import { readFeatureManifest } from './features-manifest.mts';
import { array, errorCode, parseJson, record, string, strings } from './values.mts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** A feature of contracts/features.json: the support of each runtime and the fixtures that prove it. */
export interface Feature {
  id: string;
  support: Record<string, string>;
  fixtures: string[];
}

/** A registered fixture of contracts/features.json. */
export interface RegisteredFixture {
  path: string;
  kind: string;
  export?: string;
  cases?: string[];
}

/** An evidence record of one run of a shared fixture case. */
export interface EvidenceRecord {
  feature: string;
  fixture: string;
  runtime: string;
  case: string;
  passed: boolean;
}

/** A case of a fixture for a runtime. */
export interface CaseProblem {
  feature: string;
  fixture: string;
  runtime: string;
  case: string;
}

export interface ConformanceProblems {
  undeclaredFixtures: { feature: string, fixture: string }[];
  unregisteredFamilies: string[];
  unprovenFixtures: string[];
  missing: CaseProblem[];
  failed: CaseProblem[];
  undeclaredEvidence: (EvidenceRecord & { reason: string })[];
}

export interface ConformanceInput {
  features: readonly Feature[];
  registry: readonly RegisteredFixture[];
  cases: Record<string, readonly string[] | undefined>;
  families: readonly string[];
  evidence: readonly EvidenceRecord[];
}

/** A suite that records evidence, with the command that runs it and the runtimes it proves. */
export interface EvidenceSuite {
  name: string;
  run: { program: string, tool?: string, cwd?: string, argument?: string };
  runtimes: string[];
}

/** The record of one run of a suite command. */
export interface RunRecord {
  program: string;
  tool: string | null;
  cwd: string;
  args: string[];
  started: string;
  status: number | null;
}

/** The missing and failed cases of a feature, fixture and runtime, with the state of each suite that proves it. */
export interface SummaryGroup {
  id: string;
  runtime: string;
  missing: string[];
  failed: string[];
  suites: { name: string, state: string | undefined }[];
}

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
export function checkConformance(
  { features, registry, cases, families, evidence }: ConformanceInput,
): ConformanceProblems {
  const key = (feature: string, fixture: string, runtime: string, name: string): string => JSON.stringify([feature, fixture, runtime, name]);
  const recorded = new Map<string, boolean>();
  for (const item of evidence) {
    const id = key(item.feature, item.fixture, item.runtime, item.case);
    // A case recorded more than once passes only when every run passed.
    recorded.set(id, (recorded.get(id) ?? true) && item.passed === true);
  }
  const required = new Set<string>();
  // The cases of a partial runtime: each recorded case must pass, and no case is required.
  const optional = new Set<string>();
  const declared = new Map<string, Feature>();
  const problems: ConformanceProblems = {
    undeclaredFixtures: [], unregisteredFamilies: [], unprovenFixtures: [], missing: [], failed: [], undeclaredEvidence: [],
  };
  for (const feature of features) {
    declared.set(feature.id, feature);
    for (const fixture of feature.fixtures) {
      const names = cases[fixture];
      if (!names) {
        problems.undeclaredFixtures.push({ feature: feature.id, fixture });
        continue;
      }
      for (const [runtime, support] of Object.entries(feature.support)) {
        if (support !== 'pass' && support !== 'partial') continue;
        for (const name of names) {
          const id = key(feature.id, fixture, runtime, name);
          if (support === 'partial') {
            optional.add(id);
            if (recorded.get(id) === false) problems.failed.push({ feature: feature.id, fixture, runtime, case: name });
            continue;
          }
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
    if (!proven.has(fixture.path)) problems.unprovenFixtures.push(fixture.path);
  }
  const reported = new Set<string>();
  for (const item of evidence) {
    const id = key(item.feature, item.fixture, item.runtime, item.case);
    if (required.has(id) || optional.has(id) || reported.has(id)) continue;
    reported.add(id);
    const feature = declared.get(item.feature);
    const support = feature?.support[item.runtime];
    const reason = !feature ? 'unknown feature'
      : !feature.fixtures.includes(item.fixture) ? 'fixture not declared by the feature'
        : support === undefined ? 'runtime not declared by the feature'
          : support === 'unsupported' ? 'runtime declared unsupported'
            : 'case not in the fixture';
    problems.undeclaredEvidence.push({ ...item, reason });
  }
  return problems;
}

/*
 * The suites that record evidence, each with the command that runs it and the runtimes it proves
 * (docs/spec/conformance.md, "Suite runs"). A run record matches a suite when its program, its
 * tool and its working directory are those declared and its arguments hold the declared argument.
 */
export const evidenceSuites: EvidenceSuite[] = [
  { name: 'validator JavaScript', run: { program: 'tests/conformance/run-suite.mts', tool: 'vitest', cwd: 'packages/validator/ts' }, runtimes: ['javascript'] },
  { name: 'validator PHP', run: { program: 'tests/conformance/run-suite.mts', tool: 'phpunit', cwd: 'packages/validator/php' }, runtimes: ['php'] },
  { name: 'validator Python', run: { program: 'tests/conformance/run-suite.mts', tool: 'python', cwd: 'packages/validator/python' }, runtimes: ['python'] },
  { name: 'validator Go', run: { program: 'tests/conformance/run-suite.mts', tool: 'go', cwd: 'packages/validator/go' }, runtimes: ['go'] },
  { name: 'validator Rust', run: { program: 'tests/conformance/run-suite.mts', tool: 'cargo', argument: 'packages/validator/rust/Cargo.toml' }, runtimes: ['rust'] },
  { name: 'HTML renderer', run: { program: 'tests/conformance/run-suite.mts', tool: 'vitest', cwd: 'packages/html' }, runtimes: ['javascript-html', 'javascript-dom'] },
  { name: 'React renderer', run: { program: 'tests/conformance/run-suite.mts', tool: 'vitest', cwd: 'packages/react' }, runtimes: ['react'] },
  { name: 'Vue renderer', run: { program: 'tests/conformance/run-suite.mts', tool: 'vitest', cwd: 'packages/vue' }, runtimes: ['vue'] },
  { name: 'Svelte renderer', run: { program: 'tests/conformance/run-suite.mts', tool: 'vitest', cwd: 'packages/svelte' }, runtimes: ['svelte'] },
  { name: 'PHP extension', run: { program: 'tests/conformance/run-suite.mts', tool: 'node', argument: 'packages/php-ext/tests/engine/engine.test.mjs' }, runtimes: ['php-native'] },
  { name: 'PHP extension API', run: { program: 'tests/conformance/run-suite.mts', tool: 'phpunit', cwd: 'packages/php-ext' }, runtimes: ['php-native'] },
  { name: 'generator Python', run: { program: 'tests/conformance/run-suite.mts', tool: 'python', cwd: 'packages/generator/python' }, runtimes: ['python'] },
  { name: 'native generators', run: { program: 'tests/native-generators/run.mts' }, runtimes: ['javascript', 'javascript-html', 'php', 'go', 'rust', 'php-native'] },
];

/**
 * The state of each suite from the run records: `did not run`, `did not finish`, `ended with
 * failure (exit <status>)` or `passed`. The latest record of each command decides, and a suite run
 * by several commands takes the worst state of them.
 *
 * @param {typeof evidenceSuites} suites
 * @param {Array<{program: string, tool: string|null, cwd: string, args: string[], started: string, status: number|null}>} runs
 * @returns {Map<string, string>}
 */
export function suiteStates(
  suites: readonly EvidenceSuite[], runs: readonly RunRecord[],
): Map<string, string> {
  const states = new Map<string, string>();
  for (const suite of suites) {
    const { program, tool, cwd, argument } = suite.run;
    const latest = new Map<string, RunRecord>();
    for (const record of runs) {
      if (record.program !== program || (tool !== undefined && record.tool !== tool)
        || (cwd !== undefined && record.cwd !== cwd) || (argument !== undefined && !record.args.includes(argument))) continue;
      const command = JSON.stringify([record.tool, record.cwd, record.args]);
      const previous = latest.get(command);
      if (!previous || previous.started < record.started) latest.set(command, record);
    }
    const ends = [...latest.values()];
    const unfinished = ends.some(record => record.status === null);
    const failed = ends.find(record => record.status !== null && record.status !== 0);
    states.set(suite.name, ends.length === 0 ? 'did not run' : unfinished ? 'did not finish'
      : failed ? `ended with failure (exit ${failed.status})` : 'passed');
  }
  return states;
}

/**
 * Group the missing and failed cases by feature, fixture and runtime for a readable report, each
 * group with the state of every suite that proves its runtime.
 */
export function summarize(
  problems: Pick<ConformanceProblems, 'missing' | 'failed'>,
  { suites = [], runs = [] }: { suites?: readonly EvidenceSuite[], runs?: readonly RunRecord[] } = {},
): SummaryGroup[] {
  const states = suiteStates(suites, runs);
  const groups = new Map<string, SummaryGroup>();
  for (const [state, list] of [['missing', problems.missing], ['failed', problems.failed]] as const) {
    for (const item of list) {
      const id = `${item.feature} · ${item.fixture} · ${item.runtime}`;
      const group: SummaryGroup = groups.get(id) ?? {
        id, runtime: item.runtime, missing: [], failed: [],
        suites: suites.filter(suite => suite.runtimes.includes(item.runtime)).map(suite => ({ name: suite.name, state: states.get(suite.name) })),
      };
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
async function fixtureCases(fixture: RegisteredFixture): Promise<string[] | undefined> {
  if (fixture.path.endsWith('/cases.json')) {
    const cases = array(parseJson(await readFile(path.join(ROOT, fixture.path), 'utf8')), fixture.path);
    return cases.map((item, index) => string(record(item, `${fixture.path}[${index}]`).name, `${fixture.path}[${index}].name`));
  }
  if (fixture.export) {
    // The registry names an export of the module that holds its cases.
    const module: unknown = await import(pathToFileURL(path.join(ROOT, fixture.path)).href);
    const what = `${fixture.export} of ${fixture.path}`;
    const cases = array(record(module, fixture.path)[fixture.export], what);
    return cases.map((item, index) => string(record(item, `${what}[${index}]`).name, `${what}[${index}].name`));
  }
  return fixture.cases;
}

/** A line of an evidence file, checked. */
function evidenceRecord(value: unknown, file: string): EvidenceRecord {
  const item = record(value, `an evidence record of ${file}`);
  const field = (name: string) => string(item[name], `${name} of an evidence record of ${file}`);
  if (typeof item.passed !== 'boolean') throw new Error(`passed of an evidence record of ${file} is no boolean`);
  return { feature: field('feature'), fixture: field('fixture'), runtime: field('runtime'), case: field('case'), passed: item.passed };
}

/** A run record file, checked. */
function runRecord(value: unknown, file: string): RunRecord {
  const item = record(value, file);
  const { tool, status } = item;
  if (tool !== null && typeof tool !== 'string') throw new Error(`tool of ${file} is no string or null`);
  if (status !== null && typeof status !== 'number') throw new Error(`status of ${file} is no number or null`);
  return {
    program: string(item.program, `program of ${file}`), tool, cwd: string(item.cwd, `cwd of ${file}`),
    args: strings(item.args, `args of ${file}`), started: string(item.started, `started of ${file}`), status,
  };
}

/**
 * The files of `directory` and of its subdirectories as paths relative to it, sorted; none when it does not exist. CI
 * downloads the evidence of each job into a directory of its own, so two files of the same name from two jobs are both
 * read.
 */
async function filesBelow(directory: string): Promise<string[]> {
  try { return (await readdir(directory, { recursive: true })).sort(); } catch (error) { if (errorCode(error) === 'ENOENT') return []; throw error; }
}

/** The evidence records of every `.jsonl` file of `directory` and its subdirectories, and the number of those files. */
export async function readEvidence(
  directory: string,
): Promise<{ evidence: EvidenceRecord[], files: number }> {
  const evidence: EvidenceRecord[] = [];
  const files = (await filesBelow(directory)).filter(name => name.endsWith('.jsonl'));
  for (const file of files) {
    const text = await readFile(path.join(directory, file), 'utf8');
    for (const line of text.split('\n').filter(Boolean)) evidence.push(evidenceRecord(parseJson(line), file));
  }
  return { evidence, files: files.length };
}

/** The run records of every `runs/` directory of `directory` and its subdirectories. */
export async function readRuns(directory: string): Promise<RunRecord[]> {
  const files = (await filesBelow(directory)).filter(name => name.endsWith('.json') && path.basename(path.dirname(name)) === 'runs');
  return Promise.all(files.map(async file => runRecord(parseJson(await readFile(path.join(directory, file), 'utf8')), file)));
}

async function main(): Promise<void> {
  const directory = process.env.CRUDUI_CONFORMANCE_EVIDENCE;
  if (!directory) throw new Error('CRUDUI_CONFORMANCE_EVIDENCE names the evidence directory');
  const standard = readFeatureManifest(ROOT);
  const features = standard.features.map(({ id, support, fixtures }) => ({ id, support, fixtures }));
  const registry = standard.fixtures;
  const cases: Record<string, string[] | undefined> = {};
  for (const fixture of registry) {
    cases[fixture.path] = await fixtureCases(fixture);
  }
  const families = (await readdir(path.join(ROOT, 'tests/fixtures'), { withFileTypes: true }))
    .filter(entry => entry.isDirectory()).map(entry => `tests/fixtures/${entry.name}`).sort();
  const { evidence, files } = await readEvidence(path.resolve(directory));
  const runs = await readRuns(path.resolve(directory));
  const problems = checkConformance({ features, registry, cases, families, evidence });
  const lines = createProgress({ write: text => process.stdout.write(text) });
  const out = (text: string): unknown => lines.line(text);
  lines.start('conformance: evidence against contracts/features.json', { group: true });
  out(`conformance: ${evidence.length} evidence records from ${files} files, ${runs.length} suite runs`);
  for (const item of problems.undeclaredFixtures) out(`✖ ${item.feature} names ${item.fixture}, which is not a registered case fixture`);
  for (const family of problems.unregisteredFamilies) out(`✖ ${family} has no registered fixture`);
  for (const fixture of problems.unprovenFixtures) out(`✖ ${fixture} is proven by no feature`);
  for (const group of summarize(problems, { suites: evidenceSuites, runs })) {
    const parts: string[] = [];
    if (group.missing.length) parts.push(`${group.missing.length} missing (${group.missing.slice(0, 3).join(', ')}${group.missing.length > 3 ? ', …' : ''})`);
    if (group.failed.length) parts.push(`${group.failed.length} failed (${group.failed.slice(0, 3).join(', ')}${group.failed.length > 3 ? ', …' : ''})`);
    const suites = group.suites.map(suite => `suite ${suite.name} ${suite.state}`).join('; ');
    out(`✖ ${group.id}: ${parts.join(', ')}${suites ? ` — ${suites}` : ''}`);
  }
  const undeclared = new Map<string, number>();
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
