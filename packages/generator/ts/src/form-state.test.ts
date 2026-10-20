import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { functionCase, observeFunction, observeSession, readCases, sessionCase } from '../../../../tests/fixtures/form-state/harness.mts';
import * as core from './index';

const ROOT = path.resolve(__dirname, '../../../..');

const cases = (family: string) => readCases(fs.readFileSync(path.join(ROOT, `tests/fixtures/${family}/cases.json`), 'utf8'));

// The form-view cases are top-level tests named by the case: the parity check of the unit form-view reads them by name.
for (const entry of cases('form-view').map(sessionCase)) {
  it(entry.name, () => {
    expect(observeSession(core, entry, false)).toStrictEqual(entry.expected);
  });
}

// The families of the other units that share this file (form-history, form-actions, view-functions) stay nested under their
// describe, so the form-view binding reports no case of them as outside its suite; their own units report them.
for (const family of ['form-history', 'form-actions']) {
  describe(family, () => {
    for (const entry of cases(family).map(sessionCase)) {
      it(entry.name, () => {
        expect(observeSession(core, entry, true)).toStrictEqual(entry.expected);
      });
    }
  });
}

describe('view-functions', () => {
  for (const entry of cases('view-functions').map(functionCase)) {
    it(entry.name, () => {
      expect(observeFunction(core, entry)).toStrictEqual(entry.expected);
    });
  }
});
