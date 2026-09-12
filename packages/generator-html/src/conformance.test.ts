import { describe, expect, test } from 'vitest';
import { compileForm, createForm, type CompileFormOptions, type CreateFormOptions } from '@crudui/generator-core';
import { renderForm } from './index';
// @ts-expect-error shared JavaScript fixture normalizer
import { normalizeHtml } from '../../../tests/fixtures/form-render/normalize.mjs';
import cases from '../../../tests/fixtures/form-render/cases.json';

interface FixtureCase {
  name: string;
  spec: Record<string, unknown>;
  data?: Record<string, unknown>;
  options?: Record<string, unknown>;
  expected_html?: string;
  expectError?: { code: string };
}

const fixtures = cases as unknown as FixtureCase[];

function renderFixture(item: FixtureCase): string {
  const compileOptions = (item.options ?? {}) as CompileFormOptions;
  const template = compileForm(item.spec, compileOptions);
  const formOptions = (item.options ?? {}) as CreateFormOptions;
  return renderForm(createForm(template, item.data ?? {}, formOptions));
}

describe('framework-independent HTML renderer conformance', () => {
  // The array-shaped cases exercise the internal layout adapter path. Public
  // FormInstance data is keyed, so those cases remain covered by framework
  // renderFields tests and are excluded from this public-instance suite.
  const publicCases = fixtures.filter((fixture) =>
    !fixture.expectError && !['multiple-leaf-two-rows', 'multiple-leaf-empty-placeholder', 'multiple-settings-bucket'].includes(fixture.name));
  for (const item of publicCases) {
    test(item.name, () => {
      expect(normalizeHtml(renderFixture(item))).toBe(item.expected_html);
    });
  }
});
