import { describe, expect, test } from 'vitest';
import {
  bindButtons, bindForm, compileForm, createForm, formMessages,
  type CompileFormOptions, type CreateFormOptions,
} from '@crudui/generator-core';
import { renderForm, renderFormView } from './index';
// @ts-expect-error shared JavaScript fixture normalizer
import { normalizeHtml } from '../../../tests/fixtures/form-render/normalize.mjs';
import cases from '../../../tests/fixtures/form-render/cases.json';
import { provesConformance } from '../../../tests/conformance/evidence.mjs';

interface FixtureCase {
  name: string;
  spec: Record<string, unknown>;
  data?: Record<string, unknown>;
  options?: Record<string, unknown>;
  expected_html?: string;
  expectError?: { code: string };
}

const fixtures = cases as unknown as FixtureCase[];

/** Run one fixture case and record renderForm evidence for the HTML renderer. */
function proves(name: string, body: () => void): Promise<void> {
  return provesConformance(
    { features: ['renderForm'], fixture: 'tests/fixtures/form-render/cases.json', runtime: 'javascript-html', case: name },
    body
  );
}

function renderFixture(item: FixtureCase): string {
  const compileOptions = (item.options ?? {}) as CompileFormOptions;
  const template = compileForm(item.spec, compileOptions);
  const formOptions = (item.options ?? {}) as CreateFormOptions;
  return renderForm(createForm(template, item.data ?? {}, formOptions));
}

/** Render a fixture as an application that owns its data does: bindForm, bindButtons and renderFormView. */
function renderFixtureView(item: FixtureCase): string {
  const template = compileForm(item.spec, (item.options ?? {}) as CompileFormOptions);
  const options = (item.options ?? {}) as NonNullable<Parameters<typeof bindForm>[2]> & { language?: string };
  const data = item.data ?? {};
  return renderFormView(bindForm(template, data, options), bindButtons(template, data, options), formMessages(options.language ?? 'ko'));
}

describe('stateless HTML form view conformance', () => {
  // bindForm gives missing repeated data its fixed row key, so every renderable case applies.
  for (const item of fixtures.filter((fixture) => !fixture.expectError)) {
    test(item.name, () => proves(item.name, () => {
      expect(normalizeHtml(renderFixtureView(item))).toBe(item.expected_html);
    }));
  }
});

describe('framework-independent HTML renderer conformance', () => {
  // A form instance gives missing repeated data a random row key, so the
  // missing-data case's fixed bindForm key cannot match this public-instance path.
  const publicCases = fixtures.filter((fixture) =>
    !fixture.expectError && fixture.name !== 'multiple-leaf-empty-placeholder');
  for (const item of publicCases) {
    test(item.name, () => proves(item.name, () => {
      expect(normalizeHtml(renderFixture(item))).toBe(item.expected_html);
    }));
  }
});

describe('HTML form rendering: a load or registry failure is a surfaced error', () => {
  for (const item of fixtures.filter((fixture) => fixture.expectError)) {
    test(item.name, () => proves(item.name, () => {
      let thrown: unknown;
      try {
        renderFixture(item);
      } catch (error) {
        thrown = error;
      }
      expect(thrown, `${item.name} must throw`).toBeInstanceOf(Error);
      expect((thrown as { code?: unknown }).code).toBe(item.expectError!.code);
    }));
  }
});
