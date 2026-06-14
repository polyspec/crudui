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
import { renderFormV2, ComposeLoadError, UnsupportedFieldTypeError } from '../v2/index';
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

// Error lanes: an unresolved $ref (ComposeLoadError) and an un-ported field type
// (UnsupportedFieldTypeError) BOTH surface as a thrown error carrying a stable
// `code` — render FAILS, never valid:true / never silent ''. The lane is keyed on
// the declared code so every un-ported type stays RED until ported.
const ERROR_CLASS_BY_CODE: Record<string, new (...args: never[]) => Error & { code: string }> = {
  REF_FILE_NOT_FOUND: ComposeLoadError as never,
  UNSUPPORTED_FIELD_TYPE: UnsupportedFieldTypeError as never,
};

describe('v2 render — a load/registry gap is a surfaced ERROR, never silent', () => {
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
      expect(thrown, `${c.name} must throw a surfaced error`).toBeInstanceOf(expectedClass);
      expect((thrown as { code: string }).code).toStrictEqual(c.expectError!.code);
    });
  }
});

// v1 condition meta keys. The expr engine resolves design.show/class/style to
// concrete markup; if any of these names reaches the RAW output, the eval/v1
// condition path leaked. `if`/`when` are matched only as JSON-key-shaped tokens
// ("if"/"when") so label/text prose never false-positives.
const FORBIDDEN_LITERAL = ['display_switch', 'display_target', 'show_if'];
const FORBIDDEN_KEYSHAPE = [/"if"/, /"when"/];
// R4 magic-token guard. v2 emits NO `__<hex>__` token (row identity is the
// explicit position index / hidden data key; element ids are path-derived). Any
// `__<hex>__` residue in raw output is a magic-token regression — there is no
// longer a normalizer mask to hide it.
const ANY_UNDERSCORE_TOKEN = /__[0-9a-f]+__/;

describe('v2 render — eval is never used (no v1 condition meta keys leak)', () => {
  // Operates on the RAW render output (pre-normalization) — the bytes the
  // generator actually emits, where a forbidden meta key or a magic token would
  // still be visible (there is no normalizer mask to hide one).
  for (const c of cases.filter((x) => x.expected_html)) {
    test(`${c.name} — no forbidden meta-key markup`, () => {
      const raw = render(c);

      // 1: no v1 condition meta key reaches the markup (eval/v1 path never ran).
      for (const lit of FORBIDDEN_LITERAL) {
        expect(raw, `${c.name}: ${lit} leaked into raw output`).not.toContain(lit);
      }
      for (const re of FORBIDDEN_KEYSHAPE) {
        expect(raw, `${c.name}: ${re} leaked into raw output`).not.toMatch(re);
      }

      // 2: R4 — NO magic `__<hex>__` token is emitted at all. Row identity is the
      // explicit position index / hidden data key; element ids are path-derived.
      expect(raw, `${c.name}: magic __<hex>__ token leaked into raw output`).not.toMatch(
        ANY_UNDERSCORE_TOKEN
      );
    });
  }

  // 3: G4 data identity — a real row id (e.g. people.p1) is preserved verbatim
  // as data-uniqid in the RAW output, never replaced by a synthesized position
  // token (no __13hex__ position-id leakage; README coverage line).
  test('multiple-group-rows — real data row id survives unmasked (G4)', () => {
    const c = cases.find((x) => x.name === 'multiple-group-rows');
    expect(c, 'fixture must contain multiple-group-rows').toBeTruthy();
    const raw = render(c!);
    expect(raw).toContain('data-uniqid="p1"');
  });
});
