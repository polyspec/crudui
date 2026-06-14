/**
 * form-render conformance — Vue 3 SSR vs the shared 3-framework parity fixture.
 *
 * The shared fixture tests/fixtures/form-render/cases.json holds ONE
 * `expected_html` per case (the React CRUDUI reference's normalized output). This
 * test runs the Vue CRUDUI generator through genuine Vue 3 SSR
 * (@vue/server-renderer renderToString via createStaticVNode), normalizes with
 * the SAME shared normalizer (normalize.mjs), and asserts equality. The
 * 3-framework gate: Vue must reproduce `expected_html` after normalization.
 *
 * It also enforces the core invariant (SPEC §5/§2/G5): an unresolved $ref is a
 * LOAD ERROR (ComposeLoadError) — render FAILS, never valid:true. Do NOT weaken
 * assertions or fixtures; fix the Vue generator if it disagrees.
 *
 * The CRUDUI generator is loaded from TypeScript source via the package's createRequire
 * realm + tsx (Vitest transforms TS); the validator is the linked @form-spec/validator.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test, expect } from 'vitest';

// Shared 3-framework fixture + normalizer (the SAME files React/Svelte load).
import { normalizeHtml } from '../../../tests/fixtures/form-render/normalize.mjs';
// Vue CRUDUI generator (TypeScript source; Vitest transforms it).
import { renderFormSSR } from '../src/ssr.ts';
import { ComposeLoadError } from '../src/index.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(HERE, '../../../tests/fixtures/form-render/cases.json');
const cases = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));

async function renderSSR(c) {
  return renderFormSSR(c.spec, { ...(c.options ?? {}), data: c.data });
}

describe('current render — Vue 3 SSR reproduces the normalized expected_html', () => {
  for (const c of cases.filter((x) => !x.expectError)) {
    test(c.name, async () => {
      const actual = normalizeHtml(await renderSSR(c));
      expect(actual).toStrictEqual(c.expected_html);
    });
  }
});

describe('current render — Vue SSR is idempotent (stable across re-render)', () => {
  for (const c of cases.filter((x) => !x.expectError)) {
    test(`${c.name} — re-render is stable`, async () => {
      const a = normalizeHtml(await renderSSR(c));
      const b = normalizeHtml(await renderSSR(c));
      expect(a).toStrictEqual(b);
    });
  }
});

describe('current render — unresolved $ref is a LOAD ERROR, never silent', () => {
  for (const c of cases.filter((x) => x.expectError)) {
    test(c.name, async () => {
      let thrown;
      try {
        await renderSSR(c);
      } catch (e) {
        thrown = e;
      }
      expect(thrown, `${c.name} must throw a load error`).toBeInstanceOf(ComposeLoadError);
      expect(thrown.code).toStrictEqual(c.expectError.code);
    });
  }
});
