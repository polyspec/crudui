/**
 * Render acceptance of the list and detail structure validity cases (docs/spec/display-formats.md).
 * `buildList` and `buildDetail` build a case only when the meta-schema accepts it and the
 * validator loads it; a validator load failure is also the render failure.
 */

import { describe, expect, test } from 'vitest';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDetail, buildList, ComposeLoadError, FormInputError } from './index';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

interface ValidityCase {
  name: string;
  spec: Record<string, unknown>;
  files?: Record<string, Record<string, unknown>>;
  expect: 'ok' | 'fail';
  /** 'pass', or the code and composition trace of the engine failure. */
  engine: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** A case of a validity fixture, checked member by member. */
function validityCase(value: unknown): ValidityCase {
  assert(isRecord(value), 'a case is an object');
  const { name, spec, files, expect: expected } = value;
  assert(typeof name === 'string', 'a case has a name');
  assert(isRecord(spec), `${name}: spec is an object`);
  assert(expected === 'ok' || expected === 'fail', `${name}: expect is ok or fail`);
  if (files === undefined) return { name, spec, expect: expected, engine: value.engine };
  assert(isRecord(files), `${name}: files is an object`);
  const checked: Record<string, Record<string, unknown>> = {};
  for (const [file, content] of Object.entries(files)) {
    assert(isRecord(content), `${name}: files.${file} is an object`);
    checked[file] = content;
  }
  return { name, spec, files: checked, expect: expected, engine: value.engine };
}

type Outcome = 'pass' | { code: string; at: string };

function outcome(run: () => unknown): Outcome {
  try {
    run();
    return 'pass';
  } catch (error) {
    if (error instanceof ComposeLoadError) return { code: error.code, at: error.trace.join('.') };
    if (error instanceof FormInputError) return { code: error.code, at: '' };
    throw error;
  }
}

const families: Array<[string, (c: ValidityCase) => unknown]> = [
  ['list-validity', c => buildList(c.spec, [], { files: c.files ?? {} })],
  ['detail-validity', c => buildDetail(c.spec, {}, { files: c.files ?? {} })],
];

for (const [family, render] of families) {
  const decoded: unknown = JSON.parse(fs.readFileSync(path.join(ROOT, `tests/fixtures/${family}/cases.json`), 'utf8'));
  assert(Array.isArray(decoded), `the ${family} cases are a list`);
  const cases = decoded.map(validityCase);
  describe(`${family} — render`, () => {
    for (const c of cases) test(c.name, () => {
      const result = outcome(() => render(c));
      if (c.engine !== 'pass') expect(result).toStrictEqual(c.engine);
      else if (c.expect === 'ok') expect(result).toBe('pass');
      else expect(result).toStrictEqual({ code: 'INVALID_FORM_INPUT', at: '' });
    });
  });
}
