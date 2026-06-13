/**
 * node-capture.mjs — React / Vue SSR capture legs of the cross-framework gate.
 *
 * Run as:  node node-capture.mjs react
 *          node node-capture.mjs vue
 *
 * React and Vue both load their framework + generator dist from their OWN
 * package realm via the createRequire anchors inside their capture-*.mjs, so a
 * plain node process renders them correctly. Each framework runs in its OWN
 * process (one invocation per framework) so the two module graphs never share
 * a realm — same isolation guarantee the Svelte leg gets from its subprocess.
 *
 * Svelte is NOT handled here: its SSR requires the svelte plugin compile step,
 * so it runs under vitest (svelte-capture.mjs + vitest.svelte.config.mjs).
 *
 * Writes one normalized canonical file per spec to out/<fw>/<name>.norm.txt
 * and the raw form content to out/<fw>/<name>.html. capture-*.mjs and
 * normalize.js are imported read-only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeForm } from '../parity/normalize.js';
import { CASES, outDirFor } from './specs.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');

const CAPTURE = {
  react: '../parity/capture-react.mjs',
  vue: '../../packages/generator-vue/test/capture-vue.mjs',
};

async function main() {
  const fw = process.argv[2];
  if (!CAPTURE[fw]) {
    console.error(`usage: node node-capture.mjs <react|vue>  (got: ${fw})`);
    process.exit(2);
  }

  const { renderSpec } = await import(CAPTURE[fw]);
  const out = outDirFor(fw);
  fs.mkdirSync(out, { recursive: true });

  for (const c of CASES) {
    const specPath = path.join(ROOT, c.spec);
    // React renderSpec is sync, Vue's is async — await handles both.
    const { html } = await renderSpec(specPath, {}, { language: 'ko' });
    const { canonical } = analyzeForm(html);
    fs.writeFileSync(path.join(out, `${c.name}.html`), html);
    fs.writeFileSync(path.join(out, `${c.name}.norm.txt`), canonical);
  }
  console.error(`[${fw}] captured ${CASES.length} specs -> ${out}`);
}

main().catch((err) => {
  console.error(`[capture ${process.argv[2]}] FAILED:`, err && err.stack ? err.stack : err);
  if (err && err.consoleMessages) {
    console.error('  ssr console:', err.consoleMessages.join(' | '));
  }
  process.exit(1);
});
