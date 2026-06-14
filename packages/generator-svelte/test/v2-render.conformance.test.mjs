/**
 * v2-render conformance — Svelte SSR vs the shared 3-framework parity gate.
 *
 * The shared fixture tests/fixtures/v2-render/cases.json declares its
 * `expected_html` to be the React v2 reference generator's OWN normalized output.
 * This test runs the SVELTE v2 generator (renderFormV2 → svelte/server render())
 * against the SAME fixture the React/Vue v2 generators load, normalized through
 * the SAME shared normalizer (normalize.mjs). The 3-framework gate: every
 * generator must reproduce `expected_html` after normalization.
 *
 * It also enforces the core invariant (SPEC §5/§2/G5): an unresolved $ref is a
 * LOAD ERROR (ComposeLoadError) — render FAILS, never valid:true. Do not weaken
 * assertions; if Svelte disagrees with the fixture, the Svelte generator is
 * wrong (the fixture is the React reference truth), never the reverse.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test, expect } from 'vitest';
import { renderFormV2, renderFormV2String, ComposeLoadError } from '../src/v2/index.ts';
import { normalizeHtml } from '../../../tests/fixtures/v2-render/normalize.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(HERE, '../../../tests/fixtures/v2-render/cases.json');
const cases = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));

function render(c) {
  return renderFormV2(c.spec, { ...(c.options ?? {}), data: c.data });
}

describe('v2 render — Svelte reproduces the normalized expected_html', () => {
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
      let thrown;
      try {
        render(c);
      } catch (e) {
        thrown = e;
      }
      expect(thrown, `${c.name} must throw a load error`).toBeInstanceOf(ComposeLoadError);
      expect(thrown.code).toStrictEqual(c.expectError.code);
    });
  }
});

// v1 condition meta keys. The expr engine resolves design.show/class/style to
// concrete markup; if any of these names reaches the RAW output, the eval/v1
// condition path leaked. `if`/`when` are matched only as JSON-key-shaped tokens
// ("if"/"when") so label/text prose never false-positives.
const FORBIDDEN_LITERAL = ['display_switch', 'display_target', 'show_if'];
const FORBIDDEN_KEYSHAPE = [/"if"/, /"when"/];
// The normalizer's exact uniqid mask range (N1). Every generated token in raw
// output MUST fall inside this range; a token of any other length/charset would
// survive normalization and break parity — that is the leak this catches.
const UNIQID_MASK_RANGE = /__[0-9a-f]{11,16}__/g;
const ANY_UNDERSCORE_TOKEN = /__[0-9a-f]+__/;

describe('v2 render — eval is never used (no v1 condition meta keys leak)', () => {
  // Operates on the RAW render output (pre-normalization). The earlier version
  // inspected the already-normalized string, where the uniqid is masked to
  // __UNIQID__ and any leak is already erased — it asserted nothing. This runs
  // the real generator and checks the bytes it actually emits.
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
    expect(render(c)).toContain('data-uniqid="p1"');
  });
});

// renderFormV2String is a public export (the SSR-scaffolding-free string path).
// Drive it through the SAME fixture so it is not a dead, untested API: its
// normalized output must equal both renderFormV2's and the fixture's.
describe('v2 render — renderFormV2String (public string API) matches the fixture', () => {
  function renderString(c) {
    return renderFormV2String(c.spec, { ...(c.options ?? {}), data: c.data });
  }
  for (const c of cases.filter((x) => x.expected_html)) {
    test(`${c.name} — string API reproduces expected_html`, () => {
      expect(normalizeHtml(renderString(c))).toStrictEqual(c.expected_html);
      // identical to the SSR path after normalization (documented contract).
      expect(normalizeHtml(renderString(c))).toStrictEqual(normalizeHtml(render(c)));
    });
  }
});
