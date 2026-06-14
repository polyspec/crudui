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
import { renderFormV2, ComposeLoadError } from '../src/v2/index.ts';
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

describe('v2 render — eval is never used (no v1 condition meta keys leak)', () => {
  for (const c of cases.filter((x) => x.expected_html)) {
    test(`${c.name} — no forbidden meta-key markup`, () => {
      const html = normalizeHtml(render(c));
      expect(html).not.toContain('display_switch');
      expect(html).not.toContain('display_target');
      expect(html).not.toMatch(/__1[0-9a-f]{12}__/); // no unmasked token
    });
  }
});
