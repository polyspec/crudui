/**
 * svelte-capture.mjs — Svelte SSR capture leg of the cross-framework gate.
 *
 * Runs ONLY under vitest with vitest.svelte.config.mjs (the svelte plugin
 * compiles the .svelte SSR component graph that capture-svelte.mjs imports).
 * It renders all 7 cross-framework specs and writes one normalized canonical
 * file per spec to out/svelte/<name>.norm.txt plus the raw form content to
 * out/svelte/<name>.html.
 *
 * The coordinator (cross-framework.test.mjs) reads those norm files and never
 * imports svelte itself — keeping the three framework realms in separate
 * processes so React/Vue/Svelte module graphs can never collide.
 *
 * capture-svelte.mjs and normalize.js are imported read-only from their
 * existing locations; this file writes nothing outside tests/cross-framework.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { it } from 'vitest';
import { renderSpec } from '../../packages/generator-svelte/test/capture-svelte.mjs';
import { analyzeForm } from '../parity/normalize.js';
import { CASES, outDirFor } from './specs.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');

const OUT = outDirFor('svelte');
fs.mkdirSync(OUT, { recursive: true });

// One vitest case per spec so a single-spec SSR crash does not hide the rest.
for (const c of CASES) {
  it(`svelte capture: ${c.name}`, () => {
    const specPath = path.join(ROOT, c.spec);
    const { html } = renderSpec(specPath, {}, { language: 'ko' });
    const { canonical } = analyzeForm(html);
    fs.writeFileSync(path.join(OUT, `${c.name}.html`), html);
    fs.writeFileSync(path.join(OUT, `${c.name}.norm.txt`), canonical);
  });
}
