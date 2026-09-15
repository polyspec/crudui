import { describe, expect, test } from 'vitest';
import { renderList } from './index';
// @ts-expect-error shared JavaScript fixture normalizer
import { normalizeHtml } from '../../../tests/fixtures/form-render/normalize.mjs';
// @ts-expect-error shared JavaScript list body helper
import { listBody } from '../../../tests/fixtures/list-render/list-body.mjs';
import cases from '../../../tests/fixtures/list-render/cases.json';

interface ListFixture {
  name: string;
  spec: Record<string, unknown>;
  rows?: Array<Record<string, unknown>>;
  options?: Record<string, unknown>;
  expected_html?: string;
  expectError?: { code: string };
}

describe('framework-independent list renderer conformance', () => {
  for (const item of cases as unknown as ListFixture[]) {
    if (item.expectError) continue;
    test(item.name, () => {
      expect(normalizeHtml(listBody(renderList(item.spec, item.rows ?? [], item.options)))).toBe(item.expected_html);
    });
  }
});
