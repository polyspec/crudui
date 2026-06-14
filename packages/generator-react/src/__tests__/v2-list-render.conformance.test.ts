/**
 * v2 list-render conformance — React reference verification (SPEC-V2 §9).
 *
 * The read sister of v2-render.conformance.test.ts. The shared fixture
 * tests/fixtures/v2-list-render/cases.json declares its `expected_html` to be the
 * React v2 LIST reference generator's OWN normalized output. This test re-verifies
 * that claim by running the real generator (renderListV2) against the SAME fixture
 * the Vue/Svelte list generators load, normalized through the SAME shared
 * normalizer (tests/fixtures/v2-render/normalize.mjs). The 3-framework gate: every
 * generator must reproduce `expected_html` after normalization.
 *
 * DB-agnostic (SPEC §9): rows are INJECTED; sort/pagination are declared only.
 * read-only: a cell is a DISPLAY value — these tests assert no input control ever
 * reaches the output. An unresolved $ref is a LOAD ERROR (ComposeLoadError),
 * never a silent table. Do not weaken assertions; if React disagrees with the
 * fixture, the contract is broken (the fixture is the React output).
 */

import { describe, test, expect } from 'vitest';
import { renderListV2, ComposeLoadError } from '../v2/index';
// @ts-expect-error — shared JS normalizer (cross-framework).
import { normalizeHtml } from '../../../../tests/fixtures/v2-render/normalize.mjs';
// The shared fixture, imported as JSON — the SAME file Vue/Svelte load.
import fixtureCases from '../../../../tests/fixtures/v2-list-render/cases.json';

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

/**
 * Strip React 19's SSR resource-hint hoists (`<link rel="preload" as="image">`
 * emitted for an `<img src>`). A React-renderer artifact, not list markup (Vue/
 * Svelte SSR do not emit them) — the fixture is generated with the SAME strip, so
 * React must apply it to compare against its own normalized output.
 */
function stripReactFloats(html: string): string {
  return html.replace(/<link\b[^>]*\brel="preload"[^>]*>/g, '');
}

function render(c: ListFixtureCase): string {
  return stripReactFloats(renderListV2(c.spec, c.rows ?? [], c.options ?? {}));
}

describe('v2 list render — React reproduces the normalized expected_html', () => {
  for (const c of cases.filter((x) => !x.expectError)) {
    test(c.name, () => {
      expect(normalizeHtml(render(c))).toStrictEqual(c.expected_html);
    });
  }
});

describe('v2 list render — render is idempotent (stable across re-render)', () => {
  for (const c of cases.filter((x) => !x.expectError)) {
    test(`${c.name} — re-render is stable`, () => {
      expect(normalizeHtml(render(c))).toStrictEqual(normalizeHtml(render(c)));
    });
  }
});

describe('v2 list render — read-only invariant (no input control EVER reaches output)', () => {
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

describe('v2 list render — a load gap is a surfaced ERROR, never a silent table', () => {
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
