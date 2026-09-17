/**
 * Legacy validator conformance
 *
 * Runs every entry of tests/fixtures/legacy-validate/cases.json (repository
 * root) through the explicit legacy Validator via vitest. The fixture is the
 * single source of truth - this file must not weaken or reinterpret its
 * expectations.
 *
 * The other runtimes' legacy conformance tests use the same semantics:
 * - simple field specs are wrapped in a group with a 'value' property
 * - the '__undefined__' input marker maps to undefined
 * - expected.valid, expected.error (rule name) and expected.field (path)
 *   are compared
 *
 * One test runs every case of an entry and records one validateLegacy
 * evidence line for the entry, passed only when all of its cases pass.
 */

import { describe, test, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Validator } from '../legacy/Validator';
import type { Spec } from '../types';
import { provesConformance } from '../../../../tests/conformance/evidence.mjs';

interface FixtureCase {
  input: unknown;
  expected: {
    valid: boolean;
    error?: string;
    field?: string;
  };
}

interface FixtureEntry {
  name: string;
  suite: string;
  note: string;
  spec: Record<string, unknown>;
  cases: FixtureCase[];
}

const FIXTURE = 'tests/fixtures/legacy-validate/cases.json';
const dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.resolve(dirname, '../../../..', FIXTURE);

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

const entries: FixtureEntry[] = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));

expect(entries.length).toBeGreaterThan(0);

const suites = new Map<string, FixtureEntry[]>();
for (const entry of entries) {
  suites.set(entry.suite, [...(suites.get(entry.suite) ?? []), entry]);
}

for (const [suite, suiteEntries] of suites) {
  describe(suite, () => {
    for (const entry of suiteEntries) {
      test(entry.name, () =>
        provesConformance(
          { features: ['validateLegacy'], fixture: FIXTURE, runtime: 'javascript', case: entry.name },
          () => {
            entry.cases.forEach((testCase, index) => {
              const label = `${entry.name} case ${index + 1}`;
              const spec = convertSpec(entry.spec);
              const input = convertInput(entry.spec, testCase.input);

              const validator = new Validator(spec);
              const result = validator.validate(input);

              expect(result.valid, `${label}: valid`).toBe(testCase.expected.valid);

              if (!testCase.expected.valid) {
                const firstError = result.errors[0];
                expect(firstError, `${label}: first error`).toBeDefined();

                if (testCase.expected.error !== undefined) {
                  expect(firstError!.rule, `${label}: error rule`).toBe(testCase.expected.error);
                }
                if (testCase.expected.field !== undefined) {
                  expect(firstError!.path, `${label}: error field`).toBe(testCase.expected.field);
                }
              }
            });
          }
        )
      );
    }
  });
}
