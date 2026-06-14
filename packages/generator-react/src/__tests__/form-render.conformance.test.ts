/**
 * form-render conformance — React reference verification.
 *
 * The shared fixture tests/fixtures/form-render/cases.json declares its
 * `expected_html` to be the React CRUDUI reference generator's OWN normalized output.
 * This test re-verifies that claim by running the real generator (renderForm)
 * against the same fixture the Vue/Svelte CRUDUI generators load, normalized through
 * the SAME shared normalizer (normalize.mjs). The 3-framework gate: every
 * generator must reproduce `expected_html` after normalization.
 *
 * It also enforces the core invariant (SPEC §5/§2/G5): an unresolved $ref is a
 * LOAD ERROR (ComposeLoadError) — render FAILS, never valid:true. Do not weaken
 * assertions; if React disagrees with the fixture, the fixture is not the React
 * output and the contract is broken.
 */

import { describe, test, expect } from 'vitest';
import { renderForm, ComposeLoadError } from '../index';
// @ts-expect-error — shared JS normalizer (cross-framework).
import { normalizeHtml } from '../../../../tests/fixtures/form-render/normalize.mjs';
// The shared fixture, imported as JSON (resolveJsonModule) — the SAME file the
// Vue/Svelte CRUDUI generators load. No node:fs dependency (DOM test env).
import fixtureCases from '../../../../tests/fixtures/form-render/cases.json';

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
  return renderForm(c.spec, { ...(c.options ?? {}), data: c.data });
}

describe('current render — React reproduces the normalized expected_html', () => {
  for (const c of cases.filter((x) => !x.expectError)) {
    test(c.name, () => {
      const actual = normalizeHtml(render(c));
      expect(actual).toStrictEqual(c.expected_html);
    });
  }
});

describe('current render — render is idempotent (stable across re-render)', () => {
  for (const c of cases.filter((x) => !x.expectError)) {
    test(`${c.name} — re-render is stable`, () => {
      expect(normalizeHtml(render(c))).toStrictEqual(normalizeHtml(render(c)));
    });
  }
});

describe('current render — unresolved $ref is a LOAD ERROR, never silent', () => {
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

// legacy condition meta keys. The expr engine resolves design.show/class/style to
// concrete markup; if any of these names reaches the RAW output, the eval/legacy
// condition path leaked. `if`/`when` are matched only as JSON-key-shaped tokens
// ("if"/"when") so label/text prose never false-positives.
const FORBIDDEN_LITERAL = ['display_switch', 'display_target', 'show_if'];
const FORBIDDEN_KEYSHAPE = [/"if"/, /"when"/];
// The normalizer's exact uniqid mask range (N1). Every generated token in raw
// output MUST fall inside this range; a token of any other length/charset would
// survive normalization and break parity — that is the leak this catches.
const UNIQID_MASK_RANGE = /__[0-9a-f]{11,16}__/g;
const ANY_UNDERSCORE_TOKEN = /__[0-9a-f]+__/;

describe('current render — eval is never used (no legacy condition meta keys leak)', () => {
  // Operates on the RAW render output (pre-normalization). The earlier version
  // inspected the already-normalized fixture string (c.expected_html), where the
  // uniqid is masked to __UNIQID__ and any leak is already erased — it asserted
  // nothing. This runs the real generator and checks the bytes it actually emits.
  for (const c of cases.filter((x) => x.expected_html)) {
    test(`${c.name} — no forbidden meta-key markup`, () => {
      const raw = render(c);

      // 1: no legacy condition meta key reaches the markup (eval/legacy path never ran).
      for (const lit of FORBIDDEN_LITERAL) {
        expect(raw, `${c.name}: ${lit} leaked into raw output`).not.toContain(lit);
      }
      for (const re of FORBIDDEN_KEYSHAPE) {
        expect(raw, `${c.name}: ${re} leaked into raw output`).not.toMatch(re);
      }

      // 2: every generated uniqid token is inside the normalizer mask range;
      // after masking those, no underscore-token residue survives (a residue is
      // an out-of-range token that would leak past normalization).
      const masked = raw.replace(UNIQID_MASK_RANGE, '__UNIQID__');
      expect(masked, `${c.name}: out-of-range uniqid token leaked`).not.toMatch(
        ANY_UNDERSCORE_TOKEN
      );
    });
  }

  // 3: G4 data identity — a real row id (e.g. people.p1) is preserved verbatim
  // as data-uniqid in the RAW output, never replaced by a generated position
  // token (no __13hex__ position-id leakage; README coverage line).
  test('multiple-group-rows — real data row id survives unmasked (G4)', () => {
    const c = cases.find((x) => x.name === 'multiple-group-rows');
    expect(c, 'fixture must contain multiple-group-rows').toBeTruthy();
    const raw = render(c!);
    expect(raw).toContain('data-uniqid="p1"');
  });
});
