/**
 * Detail rendering across React, Svelte and Vue through the gateway's `renderAllDetail`.
 *
 * `renderAllDetail(detailSpec, record, options)` is the function POST /api/render-detail calls.
 * Every case in tests/fixtures/detail-render/cases.json (the file the three framework conformance
 * suites load) runs through it. A case without `expectError` must agree across the three
 * frameworks, and React's normalized output (preload links stripped) must equal `expected_html`.
 * A case with `expectError` must fail in all three with the declared code and message.
 */

import { describe, test, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderAllDetail } from './render-runner.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const DETAIL_FIXTURE = path.resolve(ROOT, 'tests/fixtures/detail-render/cases.json');

const allCases = JSON.parse(fs.readFileSync(DETAIL_FIXTURE, 'utf8'));
const okCases = allCases.filter((c) => !c.expectError);
const errorCases = allCases.filter((c) => c.expectError);

describe('renderAllDetail — every detail-render fixture case', () => {
  test('the fixture has both rendering and error cases', () => {
    expect(okCases.length).toBeGreaterThan(0);
    expect(errorCases.length).toBeGreaterThan(0);
    expect(okCases.every((c) => typeof c.expected_html === 'string')).toBe(true);
  });

  for (const c of okCases) {
    test(`${c.name} — React/Svelte/Vue agree and React equals expected_html`, async () => {
      const out = await renderAllDetail(c.spec, c.record ?? {}, c.options ?? {});
      expect(out.results.filter((r) => !r.ok).map((r) => `${r.fw}:${r.error && r.error.code}:${r.error && r.error.message}`)).toEqual([]);
      expect(out.parity, JSON.stringify(out.mismatch)).toBe(true);
      const react = out.results.find((r) => r.fw === 'react');
      expect(react.normalized).toStrictEqual(c.expected_html);
    }, 120000);
  }

  for (const c of errorCases) {
    test(`${c.name} — ${c.expectError.code} in all three`, async () => {
      const out = await renderAllDetail(c.spec, c.record ?? {}, c.options ?? {});
      expect(out.results.every((r) => !r.ok)).toBe(true);
      expect(out.results.map((r) => r.error && r.error.code)).toEqual([c.expectError.code, c.expectError.code, c.expectError.code]);
      expect(out.results.map((r) => r.error.message)).toEqual([c.expectError.message, c.expectError.message, c.expectError.message]);
      expect(out.parity, JSON.stringify(out.mismatch)).toBe(true);
    }, 120000);
  }
});
