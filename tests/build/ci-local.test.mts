import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { parse } from 'yaml';

import { checkedShape, shapeOf } from '../../scripts/json-schema.mts';

const isRecord = shapeOf<Record<string, unknown>>({ type: 'object' });
const STRINGS = shapeOf<string[]>({ type: 'array', items: { type: 'string' } });
const strings = (value: unknown, what: string): string[] => checkedShape(STRINGS, value, what);
import { checked, parseJson, type JTDSchemaType } from '../json.mts';
import { makeDryRun } from './make-dry-run.mts';

const read = (file: string): Promise<string> => readFile(new URL(`../../${file}`, import.meta.url), 'utf8');
const ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** The inputs of a workflow step (`with:`) that these tests read. */
interface StepInputs { path?: string; name?: string; key?: string; cache?: string; pattern?: string; 'if-no-files-found'?: string }
/** A step of a GitHub Actions job. */
interface Step { name?: string; run?: string; uses?: string; if?: string; with?: StepInputs }
/** A job of a GitHub Actions workflow; needs is a job id or a list of them. */
interface Job {
  name?: string; if?: string; needs?: unknown; 'runs-on'?: string; steps?: Step[]; strategy?: { matrix?: { php?: string[] } };
  environment?: { name?: string };
}
/** A GitHub Actions workflow as `yaml` parses it; on and concurrency are compared as they are parsed. */
interface Workflow { on?: unknown; concurrency?: unknown; jobs: Record<string, Job> }

const stepSchema: JTDSchemaType<Step> = {
  optionalProperties: {
    name: { type: 'string' }, run: { type: 'string' }, uses: { type: 'string' }, if: { type: 'string' },
    with: {
      optionalProperties: {
        path: { type: 'string' }, name: { type: 'string' }, key: { type: 'string' }, cache: { type: 'string' }, pattern: { type: 'string' },
        'if-no-files-found': { type: 'string' },
      },
      additionalProperties: true,
    },
  },
  additionalProperties: true,
};
const workflowSchema: JTDSchemaType<Workflow> = {
  properties: {
    jobs: {
      values: {
        optionalProperties: {
          name: { type: 'string' }, if: { type: 'string' }, needs: {}, 'runs-on': { type: 'string' }, steps: { elements: stepSchema },
          strategy: { optionalProperties: { matrix: { optionalProperties: { php: { elements: { type: 'string' } } }, additionalProperties: true } }, additionalProperties: true },
          environment: { optionalProperties: { name: { type: 'string' } }, additionalProperties: true },
        },
        additionalProperties: true,
      },
    },
  },
  optionalProperties: { on: {}, concurrency: {} },
  additionalProperties: true,
};

/** The workflow `.github/workflows/<name>`, checked against the fields that these tests read. */
const workflowFile = async (name: string): Promise<Workflow> =>
  checked(parse(await read(`.github/workflows/${name}`)), workflowSchema, `.github/workflows/${name}`);

/** The job `id` of `workflow`. */
function jobOf(workflow: Workflow, id: string): Job {
  const job = workflow.jobs[id];
  assert.ok(job, `the workflow has the job ${id}`);
  return job;
}

/** The value of `key` of the parsed object `value`; undefined for a value that is no object. */
function field(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

// Steps that prepare a runner rather than check the repository.
const preparation = [
  /^make(?: (?:crudui-)?install-[\w-]+)+(?: [A-Z]+="[^"]*")?$/,
  /^make check-ci-browser$/,
  /^make toolchain-check TOOLS=(?:"[^"]*"|\S+)$/,
  /^sudo apt-get install -y --no-install-recommends nginx$/,
  /^php-fpm -v$/,
  /^nginx -v$/,
];

/** The checking commands of the workflow, in job and step order. */
export function workflowCommands(workflow: Workflow): string[] {
  const commands: string[] = [];
  for (const [id, job] of Object.entries(workflow.jobs)) {
    // The completion job reads the results of the other jobs and checks no part of the tree.
    if (id === 'ci-passed') continue;
    for (const step of job.steps ?? []) {
      if (typeof step.run !== 'string') continue;
      for (const line of step.run.split('\n').map((text) => text.trim()).filter(Boolean)) {
        for (const command of line.split(' && ')) {
          // make ci-targets runs each target of TARGETS as make -k <target> (ci-targets of @polyspec/kit).
          const targets = /^make ci-targets TARGETS="([^"]+)"$/.exec(command);
          if (targets?.[1] !== undefined) commands.push(...targets[1].split(' ').map((target) => `make ${target}`));
          else if (!preparation.some((pattern) => pattern.test(command))) commands.push(command);
        }
      }
    }
  }
  return commands;
}

/** The commands of CI_TARGETS: a make target for each word. */
export function makeCommands(makefile: string): string[] {
  const block = makefile.match(/^CI_TARGETS = \\\n((?:\t[\w-]+(?: \\)?\n)+)/m);
  assert.ok(block?.[1] !== undefined, 'the Makefile declares CI_TARGETS');
  return block[1].trim().split('\n').map((line) => `make ${line.trim().replace(/ \\$/, '')}`);
}

// A release requires the check ci-passed of the tagged commit: the last job of the CI workflow needs every other job, runs
// after a failed, cancelled or skipped one, and fails unless each of them succeeded.
test('the last CI job ci-passed needs every other job and runs always', async () => {
  const workflow = await workflowFile('ci.yml');
  const ids = Object.keys(workflow.jobs);
  assert.equal(ids.at(-1), 'ci-passed', 'ci-passed is the last job of .github/workflows/ci.yml');
  const job = jobOf(workflow, 'ci-passed');
  assert.equal(job.name, undefined, 'the check carries the job id ci-passed');
  assert.equal(job.if, '${{ always() }}');
  assert.deepEqual(job.needs, ids.slice(0, -1));
  assert.equal(job['runs-on'], 'ubuntu-24.04');
  assert.deepEqual((job.steps ?? []).filter((step) => step.run !== undefined && !/^make (?:toolchain-check|install-tools|install-packages)\b/.test(step.run)).map((step) => step.run),
    ["make ci-passed RESULTS='${{ toJSON(needs) }}'"]);
});

// The native suites run in three jobs: the C engine of the PHP extension and the generators of the JavaScript, HTML, Go
// and Rust targets, and the PHP API on the PHP of .php-version, each once; make crudui-test-native runs the three parts.
const NATIVE_JOBS: Record<string, { targets: string; tools: string[]; php?: string[] }> = {
  'php-engine': { targets: 'crudui-test-php-engine', tools: ['actions/checkout', 'actions/setup-node'] },
  'native-generators': { targets: 'crudui-test-native-generators crudui-test-bench', tools: ['actions/checkout', 'actions/setup-node', 'shivammathur/setup-php', 'Swatinem/rust-cache'] },
  'php-api': { targets: 'crudui-test-php-api', tools: ['actions/checkout', 'actions/setup-node', 'shivammathur/setup-php'] },
};

test('the native suites run in three jobs, each once, and make crudui-test-native runs all three', async () => {
  const workflow = await workflowFile('ci.yml');
  for (const [id, expected] of Object.entries(NATIVE_JOBS)) {
    const job = jobOf(workflow, id);
    const steps = job.steps ?? [];
    assert.deepEqual(steps.map((step) => step.run).filter((run) => /^make ci-targets\b/.test(run ?? '')), [`make ci-targets TARGETS="${expected.targets}"`], id);
    const tools = steps.map((step) => String(step.uses ?? '').split('@')[0])
      .filter((uses) => uses && !['actions/upload-artifact', 'actions/cache'].includes(uses));
    assert.deepEqual(tools, expected.tools, id);
    assert.deepEqual(job.strategy?.matrix?.php, expected.php, id);
  }
  const run = makeDryRun(ROOT, 'crudui-test-native');
  assert.equal(run.status, 0, run.stderr);
  const commands = run.stdout.split('\n');
  for (const command of [
    /^\/\S+\/var\/tools\/bin\/node tests\/conformance\/run-suite\.mts node -- packages\/php-ext\/tests\/engine\/engine\.test\.mjs packages\/php-ext\/tests\/comparison\/comparison\.test\.mjs$/,
    /^\/\S+\/var\/tools\/bin\/node tests\/native-generators\/run\.mts --target javascript,html,go,rust,python --report "[^"]+report\.json" \|\| status=1; \\$/,
    /^\/\S+\/var\/tools\/bin\/node tests\/native-generators\/run\.mts --extension "[^"]+crudui\.so" --target php,php-native --report "[^"]+report-php\.json" \|\| status=1; \\$/,
  ]) assert.equal(commands.filter((line) => command.test(line.trim())).length, 1, `${command}\n${run.stdout}`);
});

// Each job preserves its conformance evidence under a name of its own, and the conformance job downloads each artifact
// into a directory of its own, so no evidence file of one job replaces a file of another.
test('every evidence artifact has a name of its own and the conformance job reads each from its own directory', async () => {
  const workflow = await workflowFile('ci.yml');
  const uploads = Object.entries(workflow.jobs).flatMap(([id, job]) => (job.steps ?? [])
    .filter((step) => step.with?.path === 'conformance-evidence/')
    .flatMap((step) => (job.strategy?.matrix?.php ?? [undefined])
      .map((php) => ({ id, name: php === undefined ? step.with?.name : step.with?.name?.replaceAll('${{ matrix.php }}', php) }))));
  const names = uploads.map((upload) => upload.name);
  assert.equal(new Set(names).size, names.length, names.join(', '));
  assert.ok(names.every((name) => name !== undefined && /^conformance-evidence-[\w.-]+$/.test(name)), names.join(', '));
  const conformance = jobOf(workflow, 'conformance');
  const needs = strings(conformance.needs, 'needs of the conformance job');
  assert.deepEqual([...needs].sort(), [...new Set(uploads.map((upload) => upload.id))].sort());
  const download = (conformance.steps ?? []).find((step) => String(step.uses ?? '').startsWith('actions/download-artifact@'));
  assert.deepEqual(download?.with, { pattern: 'conformance-evidence-*', path: 'conformance-evidence' });
});

// The cache of setup-node saved the npm directory of the job that finished first under the key of package-lock.json,
// also of a job that installs no npm package, so every later job restored an empty directory. A job that installs the
// npm packages restores and saves ~/.npm with actions/cache under the key of package-lock.json before it installs npm;
// a job that installs none caches nothing.
const NPM_CACHE = { path: '~/.npm', key: "npm-${{ runner.os }}-${{ runner.arch }}-${{ hashFiles('package-lock.json') }}" };

/** The jobs of a workflow whose npm cache differs from that rule, as `job: problem`. */
export function npmCacheViolations(workflow: Workflow): string[] {
  const violations: string[] = [];
  for (const [id, job] of Object.entries(workflow.jobs)) {
    const steps = job.steps ?? [];
    const uses = (prefix: string): Step[] => steps.filter((step) => String(step.uses ?? '').startsWith(prefix));
    for (const step of uses('actions/setup-node@')) if (step.with?.cache !== undefined) violations.push(`${id}: setup-node caches ${step.with.cache}`);
    const caches = uses('actions/cache@').filter((step) => step.with?.path === NPM_CACHE.path);
    const installs = steps.some((step) => /^make (?:[\w-]+ )*install-packages\b/.test(String(step.run ?? '')));
    if (!installs) {
      if (caches.length) violations.push(`${id}: caches ~/.npm without installing the npm packages`);
      continue;
    }
    const [cache] = caches;
    if (caches.length !== 1 || cache === undefined) { violations.push(`${id}: installs the npm packages without one cache of ~/.npm`); continue; }
    if (cache.with?.key !== NPM_CACHE.key) violations.push(`${id}: the npm cache key is ${cache.with?.key}`);
    const npm = steps.findIndex((step) => /^make (?:[\w-]+ )*install-tools\b/.test(String(step.run ?? '')) || /^make (?:[\w-]+ )*install-packages\b/.test(String(step.run ?? '')));
    if (steps.indexOf(cache) > npm) violations.push(`${id}: the npm cache is restored after npm installs`);
  }
  return violations;
}

test('a job that installs the npm packages caches ~/.npm by package-lock.json, and setup-node caches nothing', async () => {
  const cache = { uses: 'actions/cache@x', with: NPM_CACHE };
  assert.deepEqual(npmCacheViolations({ jobs: {
    a: { steps: [{ uses: 'actions/setup-node@x', with: { cache: 'npm' } }, { run: 'make install-tools' }] },
    b: { steps: [{ run: 'make install-tools' }, { run: 'make install-packages crudui-install-composer' }] },
    c: { steps: [{ run: 'make install-tools' }, cache, { run: 'make install-packages' }] },
    d: { steps: [cache, { run: 'make crudui-install-composer' }] },
    e: { steps: [{ uses: 'actions/cache@x', with: { ...NPM_CACHE, key: 'npm' } }, { run: 'make install-packages' }] },
    f: { steps: [cache, { run: 'make install-tools' }, { run: 'make install-packages' }] },
  } }), [
    'a: setup-node caches npm',
    'b: installs the npm packages without one cache of ~/.npm',
    'c: the npm cache is restored after npm installs',
    'd: caches ~/.npm without installing the npm packages',
    'e: the npm cache key is npm',
  ]);
  const violations: string[] = [];
  // release.yml is the copy of kit, which follows the rules of kit.
  for (const file of ['ci.yml', 'dependency-review.yml', 'pages.yml', 'push-gate.yml']) {
    violations.push(...npmCacheViolations(await workflowFile(file)).map((line) => `${file} ${line}`));
  }
  assert.deepEqual(violations, []);
});

test('CI_TARGETS lists every checking command of the CI workflow, in the same order', async () => {
  const workflow = workflowCommands(await workflowFile('ci.yml'));
  const local = makeCommands(await read('Makefile'));
  assert.ok(workflow.length > 10, 'the workflow has checking commands');
  assert.deepEqual(local, workflow);
});

// A recipe of the Makefile starts a tool of kit as $(KIT)/<tool>.mjs; the installed package has to ship it, or the target
// fails with a missing module instead of its own error.
test('every tool of kit that the Makefile starts is in the installed @polyspec/kit', async () => {
  const makefile = await read('Makefile');
  const tools = [...new Set([...makefile.matchAll(/\$\(KIT\)\/([\w-]+\.mjs)/g)].map((match) => match[1] ?? ''))].sort();
  assert.ok(tools.length > 0, 'the Makefile starts tools of kit');
  const dist = new URL('../../node_modules/@polyspec/kit/dist/', import.meta.url);
  assert.deepEqual(tools.filter((tool) => !existsSync(new URL(tool, dist))), []);
});

// CI runs every lint target of kit, so a finding fails CI. make lint runs crudui-lint: lint-ts, the lint-ts.mjs of kit, with
// the ESLint of the Svelte components.
const LINT_TARGETS = ['lint-python', 'lint-php', 'lint-rust', 'lint-go', 'lint-ts'];

test('a CI job runs every lint target of kit', async () => {
  const makefile = await read('Makefile');
  const workflow = workflowCommands(await workflowFile('ci.yml'));
  assert.match(makefile, /^crudui-lint:.*\n(?:\t.*\n)*?\t\$\(NODE\) \$\(KIT\)\/lint-ts\.mjs/m, 'make lint runs lint-ts.mjs');
  const run = (target: string): boolean => workflow.includes(`make ${target}`) || (target === 'lint-ts' && workflow.includes('make lint'));
  assert.deepEqual(LINT_TARGETS.filter((target) => !run(target)), []);
});

/** The steps that run a checking command without `if: ${{ !cancelled() }}`, as `job: step`. */
export function stepsStoppedByFailure(workflow: Workflow): string[] {
  const violations: string[] = [];
  for (const [id, job] of Object.entries(workflow.jobs)) {
    for (const step of job.steps ?? []) {
      if (typeof step.run !== 'string') continue;
      if (workflowCommands({ jobs: { [id]: { steps: [step] } } }).length === 0) continue;
      if (String(step.if ?? '').replace(/\s+/g, ' ').trim() !== '${{ !cancelled() }}') {
        violations.push(`${job.name ?? id}: ${step.name ?? step.run}`);
      }
    }
  }
  return violations;
}

// The programs that a workflow step starts only through a make target, whose recipes start them with the offline
// settings, $(NPM) and the toolchains of the checkout (docs/operations/testing.md).
const THROUGH_MAKE = new Set(['node', 'npm', 'npx', 'cargo', 'go', 'php', 'composer', 'rustup', 'python3', 'sh']);

/** The commands of the steps of a workflow that start a program of THROUGH_MAKE without make, as `job: step: command`. */
export function stepsOutsideMake(workflow: Workflow): string[] {
  const violations: string[] = [];
  for (const [id, job] of Object.entries(workflow.jobs)) {
    for (const step of job.steps ?? []) {
      if (typeof step.run !== 'string') continue;
      for (const command of step.run.split(/\n|&&|\|\||;|\|/).map(text => text.trim()).filter(Boolean)) {
        const words = command.split(/\s+/).filter(word => !/^[A-Z_][A-Z0-9_]*=/.test(word));
        while (['sudo', 'env', 'xvfb-run', 'time'].includes(words[0] ?? '')) words.shift();
        if (THROUGH_MAKE.has(words[0] ?? '')) violations.push(`${job.name ?? id}: ${step.name ?? step.run}: ${command}`);
      }
    }
  }
  return violations;
}

test('a workflow step starts every tool through a make target', async () => {
  assert.deepEqual(stepsOutsideMake({ jobs: { a: { steps: [
    { name: 'install', run: 'node scripts/kit/install-tools.mjs\necho "$PWD" >> "$GITHUB_PATH"' },
    { name: 'test', run: 'FOO=1 xvfb-run npm test && make lint' },
    { name: 'ok', run: 'make toolchain-check TOOLS="node npm"' },
    { name: 'nginx', run: 'sudo apt-get install -y nginx\nphp-fpm -v && nginx -v' },
  ] } } }), ['a: install: node scripts/kit/install-tools.mjs', 'a: test: FOO=1 xvfb-run npm test']);
  const violations: string[] = [];
  // release.yml is the copy of kit, which follows the rules of kit.
  for (const file of ['ci.yml', 'dependency-review.yml', 'pages.yml', 'push-gate.yml']) {
    violations.push(...stepsOutsideMake(await workflowFile(file)).map(line => `${file} ${line}`));
  }
  assert.deepEqual(violations, []);
});

/**
 * The jobs of a workflow that run a check outside make ci-targets, or run checks without uploading their report under
 * `if: ${{ !cancelled() }}` with `if-no-files-found: error`, as `job: problem`.
 */
export function jobsWithoutReport(workflow: Workflow): string[] {
  const violations: string[] = [];
  for (const [id, job] of Object.entries(workflow.jobs)) {
    const steps = job.steps ?? [];
    const runners = steps.filter((step) => /^make ci-targets TARGETS="[^"]+"$/.test(String(step.run ?? '').trim()));
    for (const step of steps) {
      if (typeof step.run !== 'string' || runners.includes(step)) continue;
      if (workflowCommands({ jobs: { [id]: { steps: [step] } } }).length) violations.push(`${id}: ${step.name ?? step.run} runs a check outside make ci-targets`);
    }
    const last = runners.at(-1);
    if (last === undefined) continue;
    const index = steps.indexOf(last);
    const upload = steps.slice(index + 1).find((step) => String(step.uses ?? '').startsWith('actions/upload-artifact@') && step.with?.path === 'var/report/ci-targets');
    if (!upload) violations.push(`${id}: uploads no report of var/report/ci-targets after its checks`);
    else {
      if (String(upload.if ?? '').replace(/\s+/g, ' ').trim() !== '${{ !cancelled() }}') violations.push(`${id}: the report upload does not run after a failure`);
      if (upload.with?.['if-no-files-found'] !== 'error') violations.push(`${id}: the report upload does not fail without a report`);
    }
  }
  return violations;
}

test('every job runs its checks through make ci-targets and uploads their report', async () => {
  assert.deepEqual(jobsWithoutReport({ jobs: {
    a: { steps: [{ run: 'make install-tools' }, { run: 'make lint', if: '${{ !cancelled() }}' }] },
    b: { steps: [{ run: 'make ci-targets TARGETS="lint"', if: '${{ !cancelled() }}' }] },
    c: { steps: [{ run: 'make ci-targets TARGETS="lint"' }, { uses: 'actions/upload-artifact@x', if: 'always()', with: { path: 'var/report/ci-targets' } }] },
    d: { steps: [{ run: 'make ci-targets TARGETS="lint"' }, { uses: 'actions/upload-artifact@x', if: '${{ !cancelled() }}', with: { path: 'var/report/ci-targets', 'if-no-files-found': 'error' } }] },
  } }), [
    'a: make lint runs a check outside make ci-targets',
    'b: uploads no report of var/report/ci-targets after its checks',
    'c: the report upload does not run after a failure',
    'c: the report upload does not fail without a report',
  ]);
  const violations: string[] = [];
  for (const file of ['ci.yml', 'dependency-review.yml', 'pages.yml', 'push-gate.yml']) {
    const workflow = await workflowFile(file);
    violations.push(...jobsWithoutReport(workflow).map((line) => `${file} ${line}`));
    // The report artifact of each job, and of each matrix entry, has a name of its own.
    const names = Object.values(workflow.jobs).flatMap((job) => (job.steps ?? [])
      .filter((step) => step.with?.path === 'var/report/ci-targets').map((step) => step.with?.name));
    assert.equal(new Set(names).size, names.length, `${file}: report names ${names.join(', ')}`);
  }
  assert.deepEqual(violations, []);
});

// The runners are few: a new push to a pull request stops the CI run of its previous push. A merge group has a ref of its
// own and its run is never stopped, and the push check runs on every pushed commit and keeps its runs.
test('no run of a commit of main is stopped by a later push', async () => {
  assert.deepEqual((await workflowFile('ci.yml')).concurrency, {
    group: '${{ github.workflow }}-${{ github.ref }}', 'cancel-in-progress': false,
  });
  assert.equal((await workflowFile('push-gate.yml')).concurrency, undefined);
  assert.deepEqual((await workflowFile('pages.yml')).concurrency, { group: 'github-pages', 'cancel-in-progress': false });
});

// main receives a push of the maintainer while the version is 0.x: CI runs on a push to main and on a manual run, the
// push check on every pushed branch, the documentation web is built and deployed from main and on a manual run, the
// dependency review runs on its schedule and on a manual run, the gates of kit (the copy gates.yml) run on pull requests,
// on main and on a manual run, and the release (the copy release.yml) runs on a pushed tag vX.Y.Z or
// <directory>/vX.Y.Z at any depth, or on a manual run that names the tag: in a tag filter * does not match /, so **/v* covers packages/<directory>/vX.Y.Z. No
// other workflow exists, and each declares exactly these lines.
const TRIGGERS = {
  'ci.yml': 'on:\n  push:\n    branches: [main]\n  workflow_dispatch:\n',
  'gates.yml': 'on:\n  pull_request:\n  push:\n    branches: [main]\n  workflow_dispatch:\n',
  'push-gate.yml': "on:\n  push:\n    branches: ['**']\n",
  'pages.yml': 'on:\n  push:\n    branches: [main]\n  workflow_dispatch:\n',
  'dependency-review.yml': "on:\n  schedule:\n    - cron: '17 3 * * *'\n  workflow_dispatch:\n",
  'release.yml': "on:\n  push:\n    tags: ['v*', '**/v*']\n  workflow_dispatch:\n    inputs:\n      tag:\n        description: The tag of the release, such as v0.0.1\n        required: true\n        type: string\n",
};

test('each workflow declares exactly its triggers', async () => {
  const names = (await readdir(new URL('../../.github/workflows/', import.meta.url))).filter(name => /\.ya?ml$/.test(name)).sort();
  assert.deepEqual(names, Object.keys(TRIGGERS).sort());
  for (const [name, block] of Object.entries(TRIGGERS)) {
    const declared = /^on:\n(?: .*\n)+/m.exec(await read(`.github/workflows/${name}`))?.[0] ?? '';
    assert.equal(declared, block, `.github/workflows/${name}`);
  }
});

/** Whether a GitHub tag filter matches a tag: `**` matches any characters, `*` any characters but `/`. */
function tagFilterMatches(filter: string, tag: string): boolean {
  const source = filter.split('**').map((part) => part.split('*').map((text) => text.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')).join('.*');
  return new RegExp(`^${source}$`).test(tag);
}

/** The tags of a release that none of `filters` matches: vX.Y.Z and <directory>/vX.Y.Z of every tracked Go module. */
function unmatchedReleaseTags(filters: string[], goModules: string[]): string[] {
  const tags = ['v1.2.3', ...goModules.map((file) => `${path.posix.dirname(file)}/v1.2.3`)];
  return tags.filter((tag) => !filters.some((filter) => tagFilterMatches(filter, tag)));
}

test('the release trigger matches vX.Y.Z and the tag of every Go module of packages/', async () => {
  const goModules = execFileSync('git', ['ls-files', 'packages/*/go.mod'], { cwd: new URL('../..', import.meta.url), encoding: 'utf8' }).split('\n').filter(Boolean);
  assert.ok(goModules.length > 0);
  const tags = strings(field(field((await workflowFile('release.yml')).on, 'push'), 'tags'), 'the tag filters of release.yml');
  assert.deepEqual(unmatchedReleaseTags(tags, goModules), []);
  // In a tag filter * does not match /, so the filter of one level */v* misses packages/<directory>/vX.Y.Z.
  assert.deepEqual(unmatchedReleaseTags(['v*', '*/v*'], goModules), goModules.map((file) => `${path.posix.dirname(file)}/v1.2.3`));
  assert.ok(tagFilterMatches('**/v*', 'packages/validator/go/v0.1.0') && !tagFilterMatches('v*', 'go/v0.1.0'));
});

test('CI runs on a push to main, the push check on every push, and Pages deploys main', async () => {
  assert.deepEqual((await workflowFile('ci.yml')).on, { push: { branches: ['main'] }, workflow_dispatch: null });
  assert.deepEqual((await workflowFile('push-gate.yml')).on, { push: { branches: ['**'] } });
  const pages = await workflowFile('pages.yml');
  assert.deepEqual(pages.on, { push: { branches: ['main'] }, workflow_dispatch: null });
  const deploy = jobOf(pages, 'deploy');
  assert.equal(deploy.environment?.name, 'github-pages');
  assert.equal(deploy.needs, 'docs-web');
  assert.doesNotMatch(await read('.github/workflows/ci.yml'), /refs\/heads\/main|deploy-pages|upload-pages-artifact/);
});

test('every checking step of the CI workflow runs after an earlier failure', async () => {
  const violations = stepsStoppedByFailure(await workflowFile('ci.yml'));
  assert.deepEqual(violations, []);
});

test('a checking step that a failure skips is reported by job and step', () => {
  const violations = stepsStoppedByFailure({
    jobs: {
      a: {
        name: 'build',
        steps: [
          { uses: 'actions/checkout@v6' },
          { name: 'Install', run: 'make install-packages' },
          { name: 'Test', run: 'make test-x' },
          { name: 'Lint', run: 'make lint', if: '${{ !cancelled() }}' },
          { run: 'make typecheck', if: 'success()' },
        ],
      },
    },
  });
  assert.deepEqual(violations, ['build: Test', 'build: make typecheck']);
});

test('a workflow command missing from CI_TARGETS is reported', () => {
  const workflow = workflowCommands({
    jobs: {
      a: { steps: [{ run: 'make install-packages crudui-install-composer' }, { run: 'make lint' }] },
      b: { steps: [{ run: 'make test-x && make test-y' }] },
    },
  });
  assert.deepEqual(workflow, ['make lint', 'make test-x', 'make test-y']);
  const local = makeCommands('CI_TARGETS = \\\n\tlint \\\n\ttest-x\n');
  assert.notDeepEqual(local, workflow);
});

// A tag push starts every workflow whose push trigger has no branch filter. The release verifies that the checks named in
// config/release.json succeeded for the tagged commit, so a workflow that creates such a check on a tag push leaves a run
// that has not completed, and the release fails against it. Only release.yml starts on a tag; every other workflow that has
// a push trigger starts on branch pushes only.
test('only the release workflow starts on a tag push', async () => {
  const violations: string[] = [];
  for (const name of (await readdir(new URL('../../.github/workflows/', import.meta.url))).filter(file => /\.ya?ml$/.test(file))) {
    const on = (await workflowFile(name)).on;
    if (!isRecord(on) || !Object.hasOwn(on, 'push')) continue;
    // A push without filters parses as null.
    const tags = field(on['push'], 'tags'), branches = field(on['push'], 'branches'), tagsIgnore = field(on['push'], 'tags-ignore');
    if (name === 'release.yml') { if (!Array.isArray(tags) || tags.length === 0 || branches) violations.push(`${name}: must start on tags only`); continue; }
    if (!Array.isArray(branches) || branches.length === 0) violations.push(`${name}: push has no branch filter, so a tag push starts it`);
    if (tags || tagsIgnore) violations.push(`${name}: push names tags`);
  }
  assert.deepEqual(violations, []);
  const { checks } = parseJson<{ checks: string[] }>(await read('config/release.json'), { properties: { checks: { elements: { type: 'string' } } }, additionalProperties: true }, 'config/release.json');
  assert.deepEqual(checks, ['push-gate', 'ci-passed']);
});

// make install-packages runs the svelte tools after its npm ci (INSTALL_PACKAGES_EXTRA, kit K428) and links nothing: make
// install links after install-packages through install-link. The tools of packages/svelte then install without a link of their own.
test('install-packages installs the svelte tools after its npm ci and runs no link', () => {
  const run = makeDryRun(ROOT, 'install-packages');
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /crudui-install-svelte-tools/, 'install-packages runs the svelte tools');
  assert.doesNotMatch(run.stdout, /link\.mjs|--no-print-directory link/, 'install-packages runs no link');
  const svelte = makeDryRun(ROOT, 'crudui-install-svelte-tools');
  assert.equal(svelte.status, 0, svelte.stderr);
  assert.match(svelte.stdout, /npm ci --prefix packages\/svelte\/tools/);
  assert.doesNotMatch(svelte.stdout, /link\.mjs|--no-print-directory link/, 'the svelte tools link nothing themselves');
});
