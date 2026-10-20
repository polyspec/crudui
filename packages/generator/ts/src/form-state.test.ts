import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { functionCase, observeFunction, observeSession, readCases, sessionCase } from '../../../../tests/fixtures/form-state/harness.mts';
import * as core from './index';

const ROOT = path.resolve(__dirname, '../../../..');

const cases = (family: string) => readCases(fs.readFileSync(path.join(ROOT, `tests/fixtures/${family}/cases.json`), 'utf8'));

for (const family of ['form-view', 'form-history', 'form-actions']) {
  const history = family !== 'form-view';
  describe(family, () => {
    for (const entry of cases(family).map(sessionCase)) {
      it(entry.name, () => {
        expect(observeSession(core, entry, history)).toStrictEqual(entry.expected);
      });
    }
  });
}

for (const family of ['view-functions', 'history-functions']) {
  describe(family, () => {
    for (const entry of cases(family).map(functionCase)) {
      it(entry.name, () => {
        expect(observeFunction(core, entry)).toStrictEqual(entry.expected);
      });
    }
  });
}
