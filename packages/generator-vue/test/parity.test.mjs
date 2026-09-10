/**
 * parity.test.mjs — Vue SSR output vs Limepie PHP reference-html fixtures.
 *
 * Reuses the read-only reference fixtures and tests/parity/normalize.js (the
 * same normalization generator-react's harness uses). If output differs, keep
 * the fixtures and normalization rules unchanged and fix the Vue generator.
 *
 * Artifacts per fixture (inspect after a run):
 *   out/<name>.vue.html        raw Vue SSR capture (form content)
 *   out/<name>.reference.norm.txt normalized reference
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
const REFERENCE_DIR = path.join(ROOT, 'tests/fixtures/reference-html');
const OUT_DIR = path.join(HERE, 'out');

const CASES = [
  { name: 'contact', spec: 'examples/legacy/shared-specs/contact.yml' },
  { name: 'multiple-test', spec: 'examples/legacy/shared-specs/multiple-test.yml' },
  { name: 'order-form', spec: 'examples/legacy/shared-specs/order-form.yml' },
  { name: 'product-form', spec: 'examples/legacy/shared-specs/product-form.yml' },
  { name: 'registration', spec: 'examples/legacy/shared-specs/registration.yml' },
  { name: 'user-registration', spec: 'examples/legacy/shared-specs/user-registration.yml' },
  { name: 'ProductNft', spec: 'tests/fixtures/specs/ProductNft.yml' },
];

fs.mkdirSync(OUT_DIR, { recursive: true });

describe('Vue SSR <-> Limepie PHP reference parity', () => {
  for (const c of CASES) {
    it(`parity: ${c.name}`, async () => {
      const referencePath = path.join(REFERENCE_DIR, `${c.name}.html`);
      const specPath = path.join(ROOT, c.spec);
      const referenceHtml = fs.readFileSync(referencePath, 'utf8');

      const rendered = await renderSpec(specPath, {}, { language: 'ko' });

      const reference = analyzeForm(referenceHtml);
      const vue = analyzeForm(rendered.html);
      const report = compareAnalyses(reference, vue);

      fs.writeFileSync(path.join(OUT_DIR, `${c.name}.vue.html`), rendered.html);
      fs.writeFileSync(path.join(OUT_DIR, `${c.name}.reference.norm.txt`), reference.canonical);
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
