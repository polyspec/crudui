/**
 * cross-framework.test.mjs compares client-renderer SSR output.
 *
 * Existing parity suites each compare ONE framework's SSR output to the PHP
 * Legacy reference-html (React, Vue, Svelte vs PHP, 7/7 each). If all three
 * equal PHP they equal each other by transitivity — but that is implicit and
 * never asserted. This suite asserts it directly: "does swapping the framework
 * change the HTML a user sees?" It also catches client-only differences that
 * have no PHP fixture to diff against.
 *
 * Capture is isolated per framework, and this file performs the comparison:
 *   The three capture processes run separately (see package.json
 *   "capture" script), each writing out/<fw>/<name>.html and .norm.txt:
 *     - react  : plain node  (own React realm via createRequire)
 *     - vue    : plain node  (own Vue realm via createRequire)
 *     - svelte : vitest + svelte plugin (the .svelte SSR graph must compile;
 *                the prebuilt dist is a client bundle and crashes under
 *                svelte/server, so the source component is the only SSR path)
 *   Per-process capture is mandatory, not defensive: React, Vue, and Svelte
 *   module graphs cannot safely co-load in one process (single-React-realm
 *   rule; svelte plugin transform). This coordinator imports NO framework —
 *   it only reads the captured artifacts and re-analyzes them with the shared
 *   tests/parity/normalize.js engine, so field- and chrome-level diffs surface
 *   (not just whole-document canonical equality).
 *
 * Each spec asserts all THREE pairs (React==Vue, Vue==Svelte, React==Svelte)
 * = 21 cross-framework equalities for the 7 specs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll } from 'vitest';
import { analyzeForm, compareAnalyses, formatReport } from '../parity/normalize.js';
import { CASES, FRAMEWORKS, outDirFor } from './specs.mjs';

function readCapture(framework, name) {
  const file = path.join(outDirFor(framework), `${name}.html`);
  if (!fs.existsSync(file)) {
    throw new Error(
      `missing capture out/${framework}/${name}.html — run the capture legs first ` +
        `(npm run capture, or npm test which chains capture + this suite)`
    );
  }
  return fs.readFileSync(file, 'utf8');
}

beforeAll(() => {
  // Fail loud and early if any leg never ran, rather than silently passing 0.
  const missing = [];
  for (const fw of FRAMEWORKS) {
    for (const c of CASES) {
      const file = path.join(outDirFor(fw), `${c.name}.html`);
      if (!fs.existsSync(file)) missing.push(`${fw}/${c.name}`);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `cross-framework captures missing (${missing.length}): ${missing.join(', ')}\n` +
        `Run the capture legs first: npm run capture`
    );
  }
});

describe('cross-framework SSR parity (React == Vue == Svelte)', () => {
  for (const c of CASES) {
    it(`all frameworks identical: ${c.name}`, () => {
      const analyses = Object.fromEntries(
        FRAMEWORKS.map((fw) => [fw, analyzeForm(readCapture(fw, c.name))])
      );

      // Compare all three framework pairs directly.
      const pairs = [
        ['react', 'vue'],
        ['vue', 'svelte'],
        ['react', 'svelte'],
      ];

      const failures = [];
      for (const [a, b] of pairs) {
        const report = compareAnalyses(analyses[a], analyses[b]);
        if (!report.equal) {
          failures.push(
            `--- ${a.toUpperCase()} vs ${b.toUpperCase()} (${c.name}) ---\n` +
              formatReport(`${a}-vs-${b}:${c.name}`, report)
          );
        }
      }

      expect(
        failures.length,
        failures.length === 0
          ? ''
          : `cross-framework mismatch for ${c.name}:\n${failures.join('\n')}\n` +
              `Captured HTML: out/{react,vue,svelte}/${c.name}.html`
      ).toBe(0);
    });
  }
});
