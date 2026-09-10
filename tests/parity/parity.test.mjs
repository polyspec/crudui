/**
 * parity.test.mjs — React SSR output vs Limepie PHP reference-html fixtures.
 *
 * Every fixture requires equal React and PHP output. When a comparison fails,
 * update the generator without weakening the fixture or normalization.
 *
 * Artifacts per fixture (inspect after a run):
 *   out/<name>.react.html        raw React SSR capture (form content)
 *   out/<name>.reference.norm.txt   normalized reference
 *   out/<name>.react.norm.txt    normalized React
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { renderSpec } from './capture-react.mjs';
import { analyzeForm, compareAnalyses, formatReport } from './normalize.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const REFERENCE_DIR = path.join(ROOT, 'tests/fixtures/reference-html');
const OUT_DIR = path.join(HERE, 'out');

/**
 * Reference fixtures are empty-data renders: Generator::write($spec, []).
 * OptionMultiplexable.html does not exist (host-dependent fragment — see
 * tools/limepie-baseline/README.md); its coverage is inside ProductNft.
 */
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

describe('React SSR <-> Limepie PHP reference parity', () => {
  for (const c of CASES) {
    it(`parity: ${c.name}`, () => {
      const referencePath = path.join(REFERENCE_DIR, `${c.name}.html`);
      const specPath = path.join(ROOT, c.spec);
      const referenceHtml = fs.readFileSync(referencePath, 'utf8');

      let rendered;
      try {
        rendered = renderSpec(specPath, {}, { language: 'ko' });
      } catch (err) {
        const msgs = (err.consoleMessages ?? []).join('\n');
        throw new Error(
          `SSR CRASH (generator-react, Phase C): ${err.message}\n${msgs}`,
          { cause: err }
        );
      }

      const reference = analyzeForm(referenceHtml);
      const react = analyzeForm(rendered.html);
      const report = compareAnalyses(reference, react);

      fs.writeFileSync(path.join(OUT_DIR, `${c.name}.react.html`), rendered.html);
      fs.writeFileSync(path.join(OUT_DIR, `${c.name}.reference.norm.txt`), reference.canonical);
      fs.writeFileSync(path.join(OUT_DIR, `${c.name}.react.norm.txt`), react.canonical);

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
