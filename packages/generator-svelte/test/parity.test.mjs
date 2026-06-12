/**
 * parity.test.mjs — Svelte SSR output vs Limepie PHP golden-html fixtures.
 *
 * The goldens (tests/fixtures/golden-html) and the normalization
 * (tests/parity/normalize.js) are READ-ONLY single truth — the Svelte
 * generator is fixed to match them, never the reverse.
 *
 * Artifacts per fixture (inspect after a run):
 *   out/<name>.svelte.html        raw Svelte SSR capture (form content)
 *   out/<name>.golden.norm.txt    normalized golden
 *   out/<name>.svelte.norm.txt    normalized Svelte
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { renderSpec } from './capture-svelte.mjs';
import { analyzeForm, compareAnalyses, formatReport } from '../../../tests/parity/normalize.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const GOLDEN_DIR = path.join(ROOT, 'tests/fixtures/golden-html');
const OUT_DIR = path.join(HERE, '..', 'out');

const CASES = [
  { name: 'contact', spec: 'examples/shared-specs/contact.yml' },
  { name: 'multiple-test', spec: 'examples/shared-specs/multiple-test.yml' },
  { name: 'order-form', spec: 'examples/shared-specs/order-form.yml' },
  { name: 'product-form', spec: 'examples/shared-specs/product-form.yml' },
  { name: 'registration', spec: 'examples/shared-specs/registration.yml' },
  { name: 'user-registration', spec: 'examples/shared-specs/user-registration.yml' },
  { name: 'ProductNft', spec: 'tests/fixtures/specs/ProductNft.yml' },
];

fs.mkdirSync(OUT_DIR, { recursive: true });

describe('Svelte SSR <-> Limepie PHP golden parity', () => {
  for (const c of CASES) {
    it(`parity: ${c.name}`, () => {
      const goldenPath = path.join(GOLDEN_DIR, `${c.name}.html`);
      const specPath = path.join(ROOT, c.spec);
      const goldenHtml = fs.readFileSync(goldenPath, 'utf8');

      const rendered = renderSpec(specPath, {}, { language: 'ko' });

      const golden = analyzeForm(goldenHtml);
      const svelte = analyzeForm(rendered.html);
      const report = compareAnalyses(golden, svelte);

      fs.writeFileSync(path.join(OUT_DIR, `${c.name}.svelte.html`), rendered.html);
      fs.writeFileSync(path.join(OUT_DIR, `${c.name}.golden.norm.txt`), golden.canonical);
      fs.writeFileSync(path.join(OUT_DIR, `${c.name}.svelte.norm.txt`), svelte.canonical);

      console.log(formatReport(c.name, report));

      expect(
        report.equal,
        `${c.name}: fields ${report.matchedFields}/${report.totalFields} match, ` +
          `chrome ${report.chrome} — see out/${c.name}.*.norm.txt and report above`
      ).toBe(true);
    });
  }
});
