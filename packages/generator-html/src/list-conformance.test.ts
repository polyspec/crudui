import { describe, expect, test } from 'vitest';
import { renderList } from './index';
// @ts-expect-error shared JavaScript fixture normalizer
import { normalizeHtml } from '../../../tests/fixtures/form-render/normalize.mjs';
// @ts-expect-error shared JavaScript preload link helper
import { withoutPreloadLinks } from '../../../tests/fixtures/preload-links.mjs';
import cases from '../../../tests/fixtures/list-render/cases.json';
import { provesConformance } from '../../../tests/conformance/evidence.mjs';

interface ListFixture {
  name: string;
  spec: Record<string, unknown>;
  rows?: Array<Record<string, unknown>>;
  options?: Record<string, unknown>;
  expected_html?: string;
  expectError?: { code: string; message?: string };
}

/** Run one fixture case and record renderList evidence for the HTML renderer. */
function proves(name: string, body: () => void): Promise<void> {
  return provesConformance(
    { features: ['renderList'], fixture: 'tests/fixtures/list-render/cases.json', runtime: 'javascript-html', case: name },
    body
  );
}

describe('framework-independent list renderer conformance', () => {
  for (const item of cases as unknown as ListFixture[]) {
    if (item.expectError) continue;
    test(item.name, () => proves(item.name, () => {
      expect(normalizeHtml(withoutPreloadLinks(renderList(item.spec, item.rows ?? [], item.options)))).toBe(item.expected_html);
    }));
  }
  for (const item of cases as unknown as ListFixture[]) {
    if (!item.expectError) continue;
    test(item.name, () => proves(item.name, () => {
      let thrown: unknown;
      try {
        renderList(item.spec, item.rows ?? [], item.options);
      } catch (error) {
        thrown = error;
      }
      expect(thrown, `${item.name} must throw`).toBeInstanceOf(Error);
      expect((thrown as { code?: unknown }).code).toBe(item.expectError!.code);
      if (item.expectError!.message) expect((thrown as Error).message).toContain(item.expectError!.message);
    }));
  }
});
