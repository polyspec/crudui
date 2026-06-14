/**
 * Conformance test bridge
 *
 * Runs every fixture from tests/cases/*.json (repository root) through the
 * Validator via vitest. The fixtures are the single source of truth - this
 * file must not weaken or reinterpret their expectations.
 *
 * Mirrors the semantics of tests/runner/run-js.ts:
 * - simple field specs are wrapped in a group with a 'value' property
 * - the '__undefined__' input marker maps to undefined
 * - expected.valid, expected.error (rule name) and expected.field (path)
 *   are compared
 */

import { describe, test, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Validator } from '../legacy/Validator';
import type { Spec } from '../legacy/types';

interface FixtureCase {
  input: unknown;
  expected: {
    valid: boolean;
    error?: string;
    field?: string;
  };
}

interface FixtureTest {
  id: string;
  description: string;
  spec: Record<string, unknown>;
  cases: FixtureCase[];
}

interface FixtureSuite {
  testSuite: string;
  version: string;
  description: string;
  tests: FixtureTest[];
}

const dirname = path.dirname(fileURLToPath(import.meta.url));
const casesDir = path.resolve(dirname, '../../../../tests/cases');

/**
 * Convert spec from fixture format to Validator format.
 * Simple field specs are wrapped in a group with a 'value' property.
 */
function convertSpec(spec: Record<string, unknown>): Spec {
  if (spec.type === 'group' && spec.properties) {
    return spec as unknown as Spec;
  }

  return {
    type: 'group',
    properties: {
      value: spec,
    },
  } as unknown as Spec;
}

/**
 * Convert fixture input data to match the spec structure
 */
function convertInput(
  spec: Record<string, unknown>,
  input: unknown
): Record<string, unknown> {
  if (spec.type === 'group' && spec.properties) {
    return input as Record<string, unknown>;
  }

  if (input === '__undefined__') {
    return { value: undefined };
  }

  return { value: input };
}

const suiteFiles = fs
  .readdirSync(casesDir)
  .filter((f) => f.endsWith('.json'))
  .sort();

expect(suiteFiles.length).toBeGreaterThan(0);

for (const file of suiteFiles) {
  const suite: FixtureSuite = JSON.parse(
    fs.readFileSync(path.join(casesDir, file), 'utf-8')
  );

  describe(`${suite.testSuite} (${file})`, () => {
    for (const fixtureTest of suite.tests) {
      const rows = fixtureTest.cases.map((testCase, caseIndex) => ({
        caseIndex: caseIndex + 1,
        testCase,
      }));

      test.each(rows)(
        `${fixtureTest.id} case $caseIndex`,
        ({ testCase }) => {
          const spec = convertSpec(fixtureTest.spec);
          const input = convertInput(fixtureTest.spec, testCase.input);

          const validator = new Validator(spec);
          const result = validator.validate(input);

          expect(result.valid).toBe(testCase.expected.valid);

          if (!testCase.expected.valid) {
            const firstError = result.errors[0];
            expect(firstError).toBeDefined();

            if (testCase.expected.error !== undefined) {
              expect(firstError!.rule).toBe(testCase.expected.error);
            }
            if (testCase.expected.field !== undefined) {
              expect(firstError!.path).toBe(testCase.expected.field);
            }
          }
        }
      );
    }
  });
}
