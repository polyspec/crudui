/**
 * Request and response contract of the console's validator processes (../validators/README.md).
 *
 * Five processes answer every request: the JavaScript, PHP, Go and Rust programs, and the PHP
 * program with the native extension loaded. Each process receives the raw request text on stdin;
 * its exit status and its complete stdout JSON object must equal the expected response:
 *   - every case in ../validators/requests.json (request rules, their order and messages);
 *   - every form case in tests/fixtures/validate/cases.json (exit 0 with exactly
 *     `{ valid, errors }`, or exit 2 with exactly `{ error, code, at }`);
 *   - every list and detail case in tests/fixtures/{list,detail}-validity/cases.json with
 *     non-object `data`, which those modes ignore.
 */

import { describe, test, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from './engine.mjs';
import { PHP_PROGRAM, VALIDATORS, validatorProcesses } from './validate-runner.mjs';

const read = file => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));

// The native PHP module the Makefile builds; PHP_EXTENSION names another build, as in `make test-native`.
const extension = process.env.PHP_EXTENSION ?? path.join(ROOT, 'packages/php-ext/modules/crudui.so');
const extensionArgs = ['-d', `extension=${extension}`];

// The php-native process runs the same PHP program with the extension loaded, whose internal
// classes replace the PHP ones.
const processes = {
  ...validatorProcesses,
  'php-native': { command: 'php', args: [...extensionArgs, PHP_PROGRAM] },
};

/** Run every process on one raw request and report every process whose response differs. */
function expectResponses(input, expected) {
  const failures = [];
  for (const [name, { command, args }] of Object.entries(processes)) {
    const run = spawnSync(command, args, { cwd: VALIDATORS, input, encoding: 'utf8', timeout: 10000 });
    if (run.error) {
      failures.push(`${name} did not start: ${run.error.message}`);
      continue;
    }
    let output;
    try {
      output = JSON.parse(run.stdout);
    } catch {
      failures.push(`${name} wrote no JSON (exit ${run.status}): ${run.stdout}${run.stderr}`);
      continue;
    }
    const actual = { exit: run.status, output };
    const wanted = typeof expected === 'function' ? expected(actual) : expected;
    try {
      expect(actual).toStrictEqual(wanted);
    } catch (error) {
      failures.push(`${name}: ${error.message}`);
    }
  }
  expect(failures).toStrictEqual([]);
}

/** Whether each validator class the PHP program uses is internal (native) under PHP arguments. */
function validatorClassesInternal(args) {
  const classes = ['CRUDUI\\Validator', 'CRUDUI\\Validator\\Compose\\ComposeLoadError', 'CRUDUI\\Validator\\Validate\\FormInputError'];
  const source = `echo json_encode(array_map(fn ($c) => class_exists($c, false) && (new ReflectionClass($c))->isInternal(), ${JSON.stringify(classes)}));`;
  const run = spawnSync('php', [...args, '-r', source], { encoding: 'utf8', timeout: 10000 });
  expect(run.error).toBeUndefined();
  expect(run.stderr).toBe('');
  expect(run.status, run.stdout).toBe(0);
  return JSON.parse(run.stdout);
}

describe('validator processes — the PHP processes load the intended implementation', () => {
  test('php uses PHP classes and php-native uses the extension', () => {
    expect(validatorClassesInternal([])).toStrictEqual([false, false, false]);
    expect(fs.statSync(extension).isFile(), `${extension} must be a built native PHP module`).toBe(true);
    expect(validatorClassesInternal(extensionArgs)).toStrictEqual([true, true, true]);
  });
});

describe('validator processes — request cases', () => {
  for (const c of read('examples/cross-check-console/validators/requests.json')) {
    test(c.name, () => expectResponses(c.input, c.expected), 60000);
  }
});

describe('validator processes — form validation cases', () => {
  for (const c of read('tests/fixtures/validate/cases.json')) {
    test(c.name, () => {
      const request = { spec: c.spec, data: c.data, files: c.files ?? {}, basepath: c.basepath ?? '' };
      const expected = c.expectFailure
        ? { exit: 2, output: { error: c.expectFailure.message, code: c.expectFailure.code, at: c.expectFailure.at } }
        : { exit: 0, output: { valid: c.expected.valid, errors: c.expected.errors } };
      expectResponses(JSON.stringify(request), expected);
    }, 60000);
  }
});

for (const mode of ['list', 'detail']) {
  describe(`validator processes — ${mode} structure cases`, () => {
    for (const c of read(`tests/fixtures/${mode}-validity/cases.json`).filter(c => c.engine)) {
      test(c.name, () => {
        const request = { mode, spec: c.spec, files: c.files ?? {}, data: [1] };
        expectResponses(JSON.stringify(request), actual => c.engine === 'pass'
          ? { exit: 0, output: { valid: true, errors: [] } }
          // The message is each engine's own text; the code and location are shared.
          : {
            exit: 2,
            output: {
              error: typeof actual.output.error === 'string' && actual.output.error !== '' ? actual.output.error : '<a message>',
              code: c.engine.code,
              at: c.engine.at,
            },
          });
      }, 60000);
    }
  });
}
