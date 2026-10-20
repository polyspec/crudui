/**
 * The registration of the form-state units. Each unit has its own test file, which calls one of these functions with its
 * family and the generator core; every case of the family is a top-level test named by the case, so the parity check reads
 * each case of the unit by its name. The assertions are those of harness.mts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { type Core, functionCase, observeFunction, observeSession, readCases, sessionCase } from './harness.mts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function familyCases(family: string) {
  return readCases(fs.readFileSync(path.join(ROOT, `tests/fixtures/${family}/cases.json`), 'utf8'));
}

/** Registers the session cases of a family; history is true for a family that records history and actions. */
export function registerSessionCases(family: string, history: boolean, core: Core): void {
  for (const entry of familyCases(family).map(sessionCase)) {
    it(entry.name, () => {
      expect(observeSession(core, entry, history)).toStrictEqual(entry.expected);
    });
  }
}

/** Registers the function cases of a family. */
export function registerFunctionCases(family: string, core: Core): void {
  for (const entry of familyCases(family).map(functionCase)) {
    it(entry.name, () => {
      expect(observeFunction(core, entry)).toStrictEqual(entry.expected);
    });
  }
}
