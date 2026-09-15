/**
 * Verify React's server rendering, the detail reference, against the shared detail fixture.
 *
 * tests/fixtures/detail-render/cases.json holds one `expected_html` per detail scenario, generated
 * from this renderer and normalized with the shared normalizer. Vue, Svelte and the HTML renderer
 * run the same file; the native generators compare the raw bytes. Do not weaken this test or edit
 * the fixture by hand: regenerate the fixture when the contract changes.
 */

import { describe, expect, test } from 'vitest';
import { renderDetail } from '../index';
// @ts-expect-error shared JavaScript fixture normalizer
import { normalizeHtml } from '../../../../tests/fixtures/form-render/normalize.mjs';
// @ts-expect-error shared JavaScript preload link helper
import { withoutPreloadLinks } from '../../../../tests/fixtures/preload-links.mjs';
import cases from '../../../../tests/fixtures/detail-render/cases.json';

interface DetailFixture {
  name: string;
  spec: Record<string, unknown>;
  record?: Record<string, unknown>;
  options?: Record<string, unknown>;
  expected_html?: string;
  expectError?: { code: string; message: string };
}

const fixtures = cases as unknown as DetailFixture[];

describe('detail render — React reproduces the normalized expected_html', () => {
  for (const item of fixtures.filter((fixture) => !fixture.expectError)) {
    test(item.name, () => {
      expect(normalizeHtml(withoutPreloadLinks(renderDetail(item.spec, item.record ?? {}, item.options)))).toBe(item.expected_html);
    });
  }
});

describe('detail render — React rejects invalid input with the shared message', () => {
  for (const item of fixtures.filter((fixture) => fixture.expectError)) {
    test(item.name, () => {
      expect(() => renderDetail(item.spec, item.record ?? {}, item.options)).toThrow(item.expectError!.message);
    });
  }
});

describe('detail render — read-only output contains no control', () => {
  for (const item of fixtures.filter((fixture) => !fixture.expectError)) {
    test(item.name, () => {
      expect(renderDetail(item.spec, item.record ?? {}, item.options)).not.toMatch(/<(?:input|select|textarea|form)\b/);
    });
  }
});
