import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { parse } from 'yaml';

const read = (file) => readFile(new URL(`../../${file}`, import.meta.url), 'utf8');

// Steps that prepare a runner rather than check the repository.
const preparation = [
  /^npm i -g npm@latest/,
  /^npm ci\b/,
  /^composer --working-dir=\S+ install\b/,
  /^sh scripts\/install-phpdocumentor\.sh$/,
  /^node scripts\/check-ci-browser\.mjs$/,
  /^npx playwright install --with-deps webkit$/,
  /^sudo apt-get install -y --no-install-recommends php8\.5-fpm nginx$/,
  /^sudo ln -sf \/usr\/sbin\/php-fpm8\.5 \/usr\/local\/bin\/php-fpm$/,
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

test('a workflow command missing from make ci is reported', () => {
  const workflow = workflowCommands({
    jobs: {
      a: { steps: [{ run: 'npm ci --strict-allow-scripts' }, { run: 'npm run lint' }] },
      b: { steps: [{ run: 'npm run test:x && npm run test:y' }] },
    },
  });
  assert.deepEqual(workflow, ['npm run lint', 'npm run test:x', 'npm run test:y']);
  const local = makeCommands("CI_COMMANDS = \\\n\t'npm run lint' \\\n\t'npm run test:x'\n");
  assert.notDeepEqual(local, workflow);
});
