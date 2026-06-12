/**
 * parity.test.mjs — Vue SSR output vs Limepie PHP golden-html fixtures.
 *
 * Reuses the read-only golden fixtures and tests/parity/normalize.js (the
 * same normalization generator-react's harness uses). Do NOT weaken fixtures
 * or normalization to force GREEN — fix the Vue generator.
 *
 * Artifacts per fixture (inspect after a run):
 *   out/<name>.vue.html        raw Vue SSR capture (form content)
 *   out/<name>.golden.norm.txt normalized golden
 *   out/<name>.vue.norm.txt    normalized Vue
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { renderSpec } from './capture-vue.mjs';
import { analyzeForm, compareAnalyses, formatReport } from '../../../tests/parity/normalize.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const GOLDEN_DIR = path.join(ROOT, 'tests/fixtures/golden-html');
const OUT_DIR = path.join(HERE, 'out');

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

describe('Vue SSR <-> Limepie PHP golden parity', () => {
  for (const c of CASES) {
    it(`parity: ${c.name}`, async () => {
      const goldenPath = path.join(GOLDEN_DIR, `${c.name}.html`);
      const specPath = path.join(ROOT, c.spec);
      const goldenHtml = fs.readFileSync(goldenPath, 'utf8');

      const rendered = await renderSpec(specPath, {}, { language: 'ko' });

      const golden = analyzeForm(goldenHtml);
      const vue = analyzeForm(rendered.html);
      const report = compareAnalyses(golden, vue);

      fs.writeFileSync(path.join(OUT_DIR, `${c.name}.vue.html`), rendered.html);
      fs.writeFileSync(path.join(OUT_DIR, `${c.name}.golden.norm.txt`), golden.canonical);
      fs.writeFileSync(path.join(OUT_DIR, `${c.name}.vue.norm.txt`), vue.canonical);

      console.log(formatReport(c.name, report));
      if (rendered.consoleMessages.length > 0) {
        console.log(`  ssr console: ${rendered.consoleMessages.join(' | ')}`);
      }

      expect(
        report.equal,
        `${c.name}: fields ${report.matchedFields}/${report.totalFields} match, ` +
          `chrome ${report.chrome} — see out/${c.name}.*.norm.txt and report above`
      ).toBe(true);
    });
  }
});
