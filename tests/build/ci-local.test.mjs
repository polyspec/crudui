import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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
          if (!preparation.some((pattern) => pattern.test(command))) commands.push(command);
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
  for (const file of ['ci.yml', 'dependency-review.yml', 'push-gate.yml']) {
    violations.push(...stepsOutsideMake(parse(await read(`.github/workflows/${file}`))).map(line => `${file} ${line}`));
  }
  assert.deepEqual(violations, []);
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
