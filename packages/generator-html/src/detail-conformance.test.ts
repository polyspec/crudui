import { describe, expect, test } from 'vitest';
import { renderDetail } from './index';
// @ts-expect-error shared JavaScript fixture normalizer
import { normalizeHtml } from '../../../tests/fixtures/form-render/normalize.mjs';
// @ts-expect-error shared JavaScript preload link helper
import { withoutPreloadLinks } from '../../../tests/fixtures/preload-links.mjs';
import cases from '../../../tests/fixtures/detail-render/cases.json';
import { provesConformance } from '../../../tests/conformance/evidence.mjs';

interface DetailFixture {
  name: string;
  spec: Record<string, unknown>;
  record?: Record<string, unknown>;
  options?: Record<string, unknown>;
  expected_html?: string;
  expectError?: { code: string; message: string };
}

const fixtures = cases as unknown as DetailFixture[];

/** Run one fixture case and record renderDetail evidence for the HTML renderer. */
function proves(name: string, body: () => void): Promise<void> {
  return provesConformance(
    { features: ['renderDetail'], fixture: 'tests/fixtures/detail-render/cases.json', runtime: 'javascript-html', case: name },
    body
  );
}

describe('framework-independent detail renderer conformance', () => {
  for (const item of fixtures.filter((fixture) => !fixture.expectError)) {
    test(item.name, () => proves(item.name, () => {
      expect(normalizeHtml(withoutPreloadLinks(renderDetail(item.spec, item.record ?? {}, item.options)))).toBe(item.expected_html);
    }));
  }
  for (const item of fixtures.filter((fixture) => fixture.expectError)) {
    test(item.name, () => proves(item.name, () => {
      expect(() => renderDetail(item.spec, item.record ?? {}, item.options)).toThrow(item.expectError!.message);
    }));
  }
});
