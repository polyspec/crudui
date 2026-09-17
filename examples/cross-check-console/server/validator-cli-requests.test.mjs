/**
 * Validator command-line request contract across the JavaScript, PHP, native PHP extension, Go and
 * Rust adapters.
 *
 * Every case in tests/fixtures/validator-cli/cases.json is written to each adapter's stdin as raw
 * text. The exit status and the complete stdout JSON object must equal the case's `expected` value for
 * every adapter, so request rules, their order and their messages cannot diverge.
 */

import { describe, test, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from './engine.mjs';
import { provesConformance } from '../../../tests/conformance/evidence.mjs';

const cases = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/validator-cli/cases.json'), 'utf8'));

// The native PHP module the Makefile builds; PHP_EXTENSION names another build, as in `make test-native`.
const extension = process.env.PHP_EXTENSION ?? path.join(ROOT, 'packages/php-ext/modules/crudui.so');

// Each adapter with the conformance runtime it proves. The php-native adapter runs the same PHP
// command-line program with the extension loaded, whose internal classes replace the PHP ones.
const adapters = {
  js: ['javascript', process.execPath, ['--import', 'tsx', 'bin/validate.mjs'], path.join(ROOT, 'packages/validator-ts')],
  php: ['php', 'php', ['bin/validate.php'], path.join(ROOT, 'packages/validator-php')],
  'php-native': ['php-native', 'php', ['-d', `extension=${extension}`, 'bin/validate.php'], path.join(ROOT, 'packages/validator-php')],
  go: ['go', path.join(ROOT, 'packages/validator-go/validate'), [], path.join(ROOT, 'packages/validator-go')],
  rust: ['rust', path.join(ROOT, 'packages/validator-rust/target/release/validate'), [], path.join(ROOT, 'packages/validator-rust')],
};

/** Whether each validator class the command-line program uses is internal (native) under PHP arguments. */
function validatorClassesInternal(args) {
  const classes = ['CRUDUI\\Validator', 'CRUDUI\\Validator\\Compose\\ComposeLoadError', 'CRUDUI\\Validator\\Validate\\FormInputError'];
  const source = `echo json_encode(array_map(fn ($c) => class_exists($c, false) && (new ReflectionClass($c))->isInternal(), ${JSON.stringify(classes)}));`;
  const run = spawnSync('php', [...args, '-r', source], { encoding: 'utf8', timeout: 10000 });
  expect(run.error).toBeUndefined();
  expect(run.stderr).toBe('');
  expect(run.status, run.stdout).toBe(0);
  return JSON.parse(run.stdout);
}

describe('validator CLI requests — PHP adapters load the intended implementation', () => {
  test('the php adapter uses PHP classes and php-native uses the extension', () => {
    expect(validatorClassesInternal([])).toStrictEqual([false, false, false]);
    expect(fs.statSync(extension).isFile(), `${extension} must be a built native PHP module`).toBe(true);
    expect(validatorClassesInternal(['-d', `extension=${extension}`])).toStrictEqual([true, true, true]);
  });
});

describe('validator CLI requests — every adapter answers each shared case exactly', () => {
  for (const c of cases) {
    test(c.name, async () => {
      // Every adapter runs and records its own result; the first failure is reported afterwards.
      const failures = [];
      for (const [lang, [runtime, command, args, cwd]] of Object.entries(adapters)) {
        try {
          await provesConformance(
            { features: ['validatorCli'], fixture: 'tests/fixtures/validator-cli/cases.json', runtime, case: c.name },
            () => {
              const run = spawnSync(command, args, { cwd, input: c.input, encoding: 'utf8', timeout: 10000 });
              expect(run.error, `${lang} did not start`).toBeUndefined();
              expect({ exit: run.status, output: JSON.parse(run.stdout) }, lang).toStrictEqual(c.expected);
            }
          );
        } catch (error) {
          failures.push(error);
        }
      }
      if (failures.length === 1) throw failures[0];
      if (failures.length > 1) throw new AggregateError(failures, failures.map(error => error.message).join('\n'));
    }, 60000);
  }
});
