/**
 * v2-render conformance — React reference verification.
 *
 * The shared fixture tests/fixtures/v2-render/cases.json declares its
 * `expected_html` to be the React v2 reference generator's OWN normalized output.
 * This test re-verifies that claim by running the real generator (renderFormV2)
 * against the same fixture the Vue/Svelte v2 generators load, normalized through
 * the SAME shared normalizer (normalize.mjs). The 3-framework gate: every
 * generator must reproduce `expected_html` after normalization.
 *
 * It also enforces the core invariant (SPEC §5/§2/G5): an unresolved $ref is a
 * LOAD ERROR (ComposeLoadError) — render FAILS, never valid:true. Do not weaken
 * assertions; if React disagrees with the fixture, the fixture is not the React
 * output and the contract is broken.
 */

import { describe, test, expect } from 'vitest';
import { renderFormV2, ComposeLoadError } from '../v2/index';
// @ts-expect-error — shared JS normalizer (cross-framework).
import { normalizeHtml } from '../../../../tests/fixtures/v2-render/normalize.mjs';
// The shared fixture, imported as JSON (resolveJsonModule) — the SAME file the
// Vue/Svelte v2 generators load. No node:fs dependency (DOM test env).
import fixtureCases from '../../../../tests/fixtures/v2-render/cases.json';

interface FixtureCase {
  name: string;
  note: string;
  spec: Record<string, unknown>;
  data?: Record<string, unknown>;
  options?: Record<string, unknown>;
  expected_html?: string;
  expectError?: { code: string };
}

const cases = fixtureCases as unknown as FixtureCase[];

function render(c: FixtureCase): string {
  return renderFormV2(c.spec, { ...(c.options ?? {}), data: c.data });
}

describe('v2 render — React reproduces the normalized expected_html', () => {
  for (const c of cases.filter((x) => !x.expectError)) {
    test(c.name, () => {
      const actual = normalizeHtml(render(c));
      expect(actual).toStrictEqual(c.expected_html);
    });
  }
});

describe('v2 render — render is idempotent (stable across re-render)', () => {
  for (const c of cases.filter((x) => !x.expectError)) {
    test(`${c.name} — re-render is stable`, () => {
      expect(normalizeHtml(render(c))).toStrictEqual(normalizeHtml(render(c)));
    });
  }
});

describe('v2 render — unresolved $ref is a LOAD ERROR, never silent', () => {
  for (const c of cases.filter((x) => x.expectError)) {
    test(c.name, () => {
      let thrown: unknown;
      try {
        render(c);
      } catch (e) {
        thrown = e;
      }
      expect(thrown, `${c.name} must throw a load error`).toBeInstanceOf(
        ComposeLoadError
      );
      expect((thrown as ComposeLoadError).code).toStrictEqual(c.expectError!.code);
    });
  }
});

describe('v2 render — eval is never used (no v1 condition meta keys leak)', () => {
  // The design.show/class/style path goes through the shared expr engine; no
  // v1 condition meta key (display_switch/display_target) ever appears in
  // output, and the masked uniqid token is the only generated id.
  for (const c of cases.filter((x) => x.expected_html)) {
    test(`${c.name} — no forbidden meta-key markup`, () => {
      const html = c.expected_html!;
      expect(html).not.toContain('display_switch');
      expect(html).not.toContain('display_target');
      expect(html).not.toMatch(/__1[0-9a-f]{12}__/); // no unmasked token
    });
  }
});
