import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';

import { parse } from 'yaml';

const read = (file) => readFile(new URL(`../../${file}`, import.meta.url), 'utf8');

// Steps that prepare a runner rather than check the repository.
const preparation = [
  /^make (?:install-[\w-]+(?: |$))+(?:[A-Z]+="[^"]*")?$/,
  /^make check-ci-browser$/,
  /^make toolchain-check TOOLS=(?:"[^"]*"|\S+)$/,
  /^sudo apt-get install -y --no-install-recommends nginx$/,
  /^php-fpm -v$/,
  /^nginx -v$/,
];

/** The checking commands of the workflow, in job and step order. */
export function workflowCommands(workflow) {
  const commands = [];
  for (const job of Object.values(workflow.jobs)) {
    for (const step of job.steps ?? []) {
      if (typeof step.run !== 'string') continue;
      for (const line of step.run.split('\n').map((text) => text.trim()).filter(Boolean)) {
        for (const command of line.split(' && ')) {
          // make ci-targets runs each target of TARGETS as make -k <target> (scripts/ci-targets.mjs).
          const targets = /^make ci-targets TARGETS="([^"]+)"$/.exec(command);
          if (targets) commands.push(...targets[1].split(' ').map((target) => `make ${target}`));
          else if (!preparation.some((pattern) => pattern.test(command))) commands.push(command);
        }
      }
    }
  }
  return commands;
}

/** The commands `make ci` runs, split the same way. */
export function makeCommands(makefile) {
  const block = makefile.match(/^CI_COMMANDS = \\\n((?:\t'.*'(?: \\)?\n)+)/m);
  assert.ok(block, 'the Makefile declares CI_COMMANDS');
  return block[1].trim().split('\n')
    .map((line) => line.trim().replace(/ \\$/, '').replace(/^'|'$/g, ''))
    .flatMap((line) => line.split(' && '));
}

test('make ci runs every checking command of the CI workflow, in the same order', async () => {
  const workflow = workflowCommands(parse(await read('.github/workflows/ci.yml')));
  const local = makeCommands(await read('Makefile'));
  assert.ok(workflow.length > 10, 'the workflow has checking commands');
  assert.deepEqual(local, workflow);
});

/** The steps that run a checking command without `if: ${{ !cancelled() }}`, as `job: step`. */
export function stepsStoppedByFailure(workflow) {
  const violations = [];
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
export function stepsOutsideMake(workflow) {
  const violations = [];
  for (const [id, job] of Object.entries(workflow.jobs)) {
    for (const step of job.steps ?? []) {
      if (typeof step.run !== 'string') continue;
      for (const command of step.run.split(/\n|&&|\|\||;|\|/).map(text => text.trim()).filter(Boolean)) {
        const words = command.split(/\s+/).filter(word => !/^[A-Z_][A-Z0-9_]*=/.test(word));
        while (['sudo', 'env', 'xvfb-run', 'time'].includes(words[0])) words.shift();
        if (THROUGH_MAKE.has(words[0])) violations.push(`${job.name ?? id}: ${step.name ?? step.run}: ${command}`);
      }
    }
  }
  return violations;
}

test('a workflow step starts every tool through a make target', async () => {
  assert.deepEqual(stepsOutsideMake({ jobs: { a: { steps: [
    { name: 'install', run: 'node scripts/install-npm.mjs\necho "$PWD" >> "$GITHUB_PATH"' },
    { name: 'test', run: 'FOO=1 xvfb-run npm test && make lint' },
    { name: 'ok', run: 'make toolchain-check TOOLS="node npm"' },
    { name: 'nginx', run: 'sudo apt-get install -y nginx\nphp-fpm -v && nginx -v' },
  ] } } }), ['a: install: node scripts/install-npm.mjs', 'a: test: FOO=1 xvfb-run npm test']);
  const violations = [];
  for (const file of ['ci.yml', 'dependency-review.yml', 'pages.yml', 'push-gate.yml']) {
    violations.push(...stepsOutsideMake(parse(await read(`.github/workflows/${file}`))).map(line => `${file} ${line}`));
  }
  assert.deepEqual(violations, []);
});

/**
 * The jobs of a workflow that run a check outside make ci-targets, or run checks without uploading their report under
 * `if: ${{ !cancelled() }}` with `if-no-files-found: error`, as `job: problem`.
 */
export function jobsWithoutReport(workflow) {
  const violations = [];
  for (const [id, job] of Object.entries(workflow.jobs)) {
    const steps = job.steps ?? [];
    const runners = steps.filter((step) => /^make ci-targets TARGETS="[^"]+"$/.test(String(step.run ?? '').trim()));
    for (const step of steps) {
      if (typeof step.run !== 'string' || runners.includes(step)) continue;
      if (workflowCommands({ jobs: { [id]: { steps: [step] } } }).length) violations.push(`${id}: ${step.name ?? step.run} runs a check outside make ci-targets`);
    }
    if (runners.length === 0) continue;
    const index = steps.indexOf(runners.at(-1));
    const upload = steps.slice(index + 1).find((step) => String(step.uses ?? '').startsWith('actions/upload-artifact@') && step.with?.path === 'var/report/ci-targets');
    if (!upload) violations.push(`${id}: uploads no report of var/report/ci-targets after its checks`);
    else {
      if (String(upload.if ?? '').replace(/\s+/g, ' ').trim() !== '${{ !cancelled() }}') violations.push(`${id}: the report upload does not run after a failure`);
      if (upload.with['if-no-files-found'] !== 'error') violations.push(`${id}: the report upload does not fail without a report`);
    }
  }
  return violations;
}

test('every job runs its checks through make ci-targets and uploads their report', async () => {
  assert.deepEqual(jobsWithoutReport({ jobs: {
    a: { steps: [{ run: 'make install-npm' }, { run: 'make lint', if: '${{ !cancelled() }}' }] },
    b: { steps: [{ run: 'make ci-targets TARGETS="lint"', if: '${{ !cancelled() }}' }] },
    c: { steps: [{ run: 'make ci-targets TARGETS="lint"' }, { uses: 'actions/upload-artifact@x', if: 'always()', with: { path: 'var/report/ci-targets' } }] },
    d: { steps: [{ run: 'make ci-targets TARGETS="lint"' }, { uses: 'actions/upload-artifact@x', if: '${{ !cancelled() }}', with: { path: 'var/report/ci-targets', 'if-no-files-found': 'error' } }] },
  } }), [
    'a: make lint runs a check outside make ci-targets',
    'b: uploads no report of var/report/ci-targets after its checks',
    'c: the report upload does not run after a failure',
    'c: the report upload does not fail without a report',
  ]);
  const violations = [];
  for (const file of ['ci.yml', 'dependency-review.yml', 'pages.yml', 'push-gate.yml']) {
    const workflow = parse(await read(`.github/workflows/${file}`));
    violations.push(...jobsWithoutReport(workflow).map((line) => `${file} ${line}`));
    // The report artifact of each job, and of each matrix entry, has a name of its own.
    const names = Object.values(workflow.jobs).flatMap((job) => (job.steps ?? [])
      .filter((step) => step.with?.path === 'var/report/ci-targets').map((step) => step.with.name));
    assert.equal(new Set(names).size, names.length, `${file}: report names ${names.join(', ')}`);
  }
  assert.deepEqual(violations, []);
});

// The runners are few: a new push to a pull request stops the CI run of its previous push. A merge group has a ref of its
// own and its run is never stopped, and the push check runs on every pushed commit and keeps its runs.
test('a new push stops the CI run of the previous push of its pull request, and no other run is stopped', async () => {
  assert.deepEqual(parse(await read('.github/workflows/ci.yml')).concurrency, {
    group: '${{ github.workflow }}-${{ github.ref }}', 'cancel-in-progress': "${{ github.event_name == 'pull_request' }}",
  });
  assert.equal(parse(await read('.github/workflows/push-gate.yml')).concurrency, undefined);
  assert.deepEqual(parse(await read('.github/workflows/pages.yml')).concurrency, { group: 'github-pages', 'cancel-in-progress': false });
});

// main receives a commit only from the merge queue (.github/repository.json): CI runs on pull requests, merge groups and
// manual runs, the push check also on every pushed branch except the branches of the queue, which it checks as merge
// groups, the documentation web is built and deployed from main and on a manual run, and the dependency review runs on
// its schedule and on a manual run. No other workflow exists, and each declares exactly these lines.
const TRIGGERS = {
  'ci.yml': 'on:\n  pull_request:\n  merge_group:\n  workflow_dispatch:\n',
  'push-gate.yml': "on:\n  push:\n    branches-ignore: ['gh-readonly-queue/**']\n  pull_request:\n  merge_group:\n",
  'pages.yml': 'on:\n  push:\n    branches: [main]\n  workflow_dispatch:\n',
  'dependency-review.yml': "on:\n  schedule:\n    - cron: '17 3 * * *'\n  workflow_dispatch:\n",
};

test('each workflow declares exactly its triggers', async () => {
  const names = (await readdir(new URL('../../.github/workflows/', import.meta.url))).filter(name => /\.ya?ml$/.test(name)).sort();
  assert.deepEqual(names, Object.keys(TRIGGERS).sort());
  for (const [name, block] of Object.entries(TRIGGERS)) {
    const declared = /^on:\n(?: .*\n)+/m.exec(await read(`.github/workflows/${name}`))?.[0] ?? '';
    assert.equal(declared, block, `.github/workflows/${name}`);
  }
});

test('CI runs on pull requests and merge groups, and Pages deploys main', async () => {
  assert.deepEqual(parse(await read('.github/workflows/ci.yml')).on, { pull_request: null, merge_group: null, workflow_dispatch: null });
  assert.deepEqual(parse(await read('.github/workflows/push-gate.yml')).on, {
    push: { 'branches-ignore': ['gh-readonly-queue/**'] }, pull_request: null, merge_group: null,
  });
  const pages = parse(await read('.github/workflows/pages.yml'));
  assert.deepEqual(pages.on, { push: { branches: ['main'] }, workflow_dispatch: null });
  assert.equal(pages.jobs.deploy.environment.name, 'github-pages');
  assert.equal(pages.jobs.deploy.needs, 'docs-web');
  assert.doesNotMatch(await read('.github/workflows/ci.yml'), /refs\/heads\/main|deploy-pages|upload-pages-artifact/);
});

test('every checking step of the CI workflow runs after an earlier failure', async () => {
  const violations = stepsStoppedByFailure(parse(await read('.github/workflows/ci.yml')));
  assert.deepEqual(violations, []);
});

test('a checking step that a failure skips is reported by job and step', () => {
  const violations = stepsStoppedByFailure({
    jobs: {
      a: {
        name: 'build',
        steps: [
          { uses: 'actions/checkout@v6' },
          { name: 'Install', run: 'make install-node-modules' },
          { name: 'Test', run: 'make test-x' },
          { name: 'Lint', run: 'make lint', if: '${{ !cancelled() }}' },
          { run: 'make typecheck', if: 'success()' },
        ],
      },
    },
  });
  assert.deepEqual(violations, ['build: Test', 'build: make typecheck']);
});

test('a workflow command missing from make ci is reported', () => {
  const workflow = workflowCommands({
    jobs: {
      a: { steps: [{ run: 'make install-node-modules install-composer' }, { run: 'make lint' }] },
      b: { steps: [{ run: 'make test-x && make test-y' }] },
    },
  });
  assert.deepEqual(workflow, ['make lint', 'make test-x', 'make test-y']);
  const local = makeCommands("CI_COMMANDS = \\\n\t'make lint' \\\n\t'make test-x'\n");
  assert.notDeepEqual(local, workflow);
});
