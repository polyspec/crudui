/**
 * Validator command-line request contract across the JavaScript, PHP, Go and Rust adapters.
 *
 * Every case in tests/fixtures/validator-cli/cases.json is written to each adapter's stdin as raw
 * text. The exit status and the complete stdout JSON object must equal the case's `expected` value in
 * all four languages, so request rules, their order and their messages cannot diverge.
 */

import { describe, test, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from './engine.mjs';

const cases = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/validator-cli/cases.json'), 'utf8'));

const adapters = {
  js: [process.execPath, ['--import', 'tsx', 'bin/validate.mjs'], path.join(ROOT, 'packages/validator-ts')],
  php: ['php', ['bin/validate.php'], path.join(ROOT, 'packages/validator-php')],
  go: [path.join(ROOT, 'packages/validator-go/validate'), [], path.join(ROOT, 'packages/validator-go')],
  rust: [path.join(ROOT, 'packages/validator-rust/target/release/validate'), [], path.join(ROOT, 'packages/validator-rust')],
};

describe('validator CLI requests — every adapter answers each shared case exactly', () => {
  for (const c of cases) {
    test(c.name, () => {
      for (const [lang, [command, args, cwd]] of Object.entries(adapters)) {
        const run = spawnSync(command, args, { cwd, input: c.input, encoding: 'utf8', timeout: 10000 });
        expect(run.error, `${lang} did not start`).toBeUndefined();
        expect({ exit: run.status, output: JSON.parse(run.stdout) }, lang).toStrictEqual(c.expected);
      }
    }, 60000);
  }
});
