/**
 * CRUDUI list-render conformance — React reference verification (SPEC §9).
 *
 * The read sister of form-render.conformance.test.ts. The shared fixture
 * tests/fixtures/list-render/cases.json declares its `expected_html` to be the
 * React CRUDUI LIST reference generator's OWN normalized output. This test re-verifies
 * that claim by running the real generator (renderList) against the SAME fixture
 * the Vue/Svelte list generators load, normalized through the SAME shared
 * normalizer (tests/fixtures/form-render/normalize.mjs). Every framework
 * generator must reproduce `expected_html` after normalization.
 *
 * DB-agnostic (SPEC §9): rows are INJECTED; sort/pagination are declared only.
 * read-only: a cell is a DISPLAY value — these tests assert no input control ever
 * reaches the output. An unresolved $ref is a LOAD ERROR (ComposeLoadError),
 * never a silent table. Do not weaken assertions; if React disagrees with the
 * fixture, the contract is broken (the fixture is the React output).
 */

import { describe, test, expect } from 'vitest';
import { renderList, ComposeLoadError } from '../index';
// @ts-expect-error — shared JS normalizer (cross-framework).
import { normalizeHtml } from '../../../../tests/fixtures/form-render/normalize.mjs';
// The shared fixture, imported as JSON — the SAME file Vue/Svelte load.
import fixtureCases from '../../../../tests/fixtures/list-render/cases.json';
// @ts-expect-error — shared JS preload link helper.
import { withoutPreloadLinks } from '../../../../tests/fixtures/preload-links.mjs';

interface ListFixtureCase {
  name: string;
  note: string;
  spec: Record<string, unknown>;
  rows: Array<Record<string, unknown>>;
  options?: Record<string, unknown>;
  expected_html?: string;
  expectError?: { code: string };
}

const cases = fixtureCases as unknown as ListFixtureCase[];

function render(c: ListFixtureCase): string {
  return withoutPreloadLinks(renderList(c.spec, c.rows ?? [], c.options ?? {}));
}

describe('list render — React reproduces the normalized expected_html', () => {
  for (const c of cases.filter((x) => !x.expectError)) {
    test(c.name, () => {
      expect(normalizeHtml(render(c))).toStrictEqual(c.expected_html);
    });
  }
});

describe('list render — render is idempotent (stable across re-render)', () => {
  for (const c of cases.filter((x) => !x.expectError)) {
    test(`${c.name} — re-render is stable`, () => {
      expect(normalizeHtml(render(c))).toStrictEqual(normalizeHtml(render(c)));
    });
  }
});

describe('list render — read-only invariant (no input control EVER reaches output)', () => {
  for (const c of cases.filter((x) => x.expected_html)) {
    test(`${c.name} — no input/select/textarea/form`, () => {
      const raw = render(c);
      expect(raw).not.toMatch(/<input\b/);
      expect(raw).not.toMatch(/<select\b/);
      expect(raw).not.toMatch(/<textarea\b/);
      expect(raw).not.toMatch(/<form\b/);
    });
  }
});

const ERROR_CLASS_BY_CODE: Record<string, unknown> = { REF_FILE_NOT_FOUND: ComposeLoadError };

describe('list render — a load gap is a surfaced ERROR, never a silent table', () => {
  for (const c of cases.filter((x) => x.expectError)) {
    test(c.name, () => {
      let thrown: unknown;
      try {
        render(c);
      } catch (e) {
        thrown = e;
      }
      const expectedClass = ERROR_CLASS_BY_CODE[c.expectError!.code];
      expect(expectedClass, `${c.name}: unknown error code ${c.expectError!.code}`).toBeTruthy();
      expect(thrown, `${c.name} must throw a surfaced error`).toBeInstanceOf(
        expectedClass as new (...args: never[]) => Error
      );
    });
  }
});
