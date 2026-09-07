/**
 * Shared CRUDUI RENDER engine loader (in-process). RENDER ONLY.
 *
 * Validation is NOT in-process anymore — all four languages (JS included) run as
 * stdin-JSON CLI subprocesses (validate-runner.mjs), so the gateway imports NO
 * validator and has zero privileged path. This engine loads ONLY the three CRUDUI
 * render adapters + the shared HTML normalizer.
 *
 * Why render stays in-process while validate does not: the Svelte CRUDUI adapter
 * imports `.svelte` files, which only the Vite svelte plugin compiles — there is
 * no standalone CLI that can serialize a compiled Svelte component without a
 * bundler. So the gateway boots ONE long-lived Vite dev server in SSR-middleware
 * mode and `ssrLoadModule`s the exact same CRUDUI render entries the AI conformance
 * gate imports. Crucially, all THREE frameworks load the same way (import) — the
 * render side is symmetric too, so no framework is favored:
 *
 *   - generator-react  src/index.ts → renderForm     (sync)
 *   - generator-svelte src/index.ts → renderForm     (sync)
 *   - generator-vue    src/ssr.ts   → renderFormSSR  (async)
 *   - tests/fixtures/form-render/normalize.mjs → normalizeHtml (shared parity key)
 *
 * The LIST sister loads alongside (additive; the form entries above are untouched,
 * SPEC §9). The same THREE module graphs already SSR-load expose a list entry, so
 * loading them costs no extra ssrLoadModule:
 *
 *   - generator-react  src/index.ts   → renderList    (sync)
 *   - generator-svelte src/index.ts   → renderList    (sync)
 *   - generator-vue    src/listSsr.ts → renderListSSR (async)
 *
 * Reusing ssrLoadModule means the bytes the console renders are byte-identical to
 * the bytes the conformance tests assert (same module graph, same functions).
 *
 * Vite resolution: the svelte CRUDUI adapter needs @sveltejs/vite-plugin-svelte +
 * Vite 6/8, which live in packages/generator-svelte/node_modules (the root has an
 * older Vite 5). We load that Vite + plugin by absolute path so the svelte plugin
 * version matches its peer Vite.
 */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '../../..');
const SVELTE_PKG = path.join(ROOT, 'packages/generator-svelte');

let enginePromise = null;

/**
 * Boot the Vite SSR environment and load every CRUDUI render entry once. Idempotent:
 * the first call boots, later calls return the same resolved engine.
 *
 * @returns {Promise<{
 *   renderReact: Function,
 *   renderSvelte: Function,
 *   renderVue: Function,
 *   renderListReact: Function,
 *   renderListSvelte: Function,
 *   renderListVue: Function,
 *   normalizeHtml: Function,
 *   errorClasses: { react: object, svelte: object, vue: object },
 *   close: Function,
 * }>}
 */
export function getEngine() {
  if (!enginePromise) {
    enginePromise = bootEngine();
  }
  return enginePromise;
}

async function bootEngine() {
  // React's SSR dev build prints `Invalid DOM property \`class\`...` warnings to
  // stderr (the CRUDUI React adapter emits raw HTML attribute names by design — its
  // output is byte-matched to the fixture, not idiomatic JSX). Silence only that
  // one console.error line so the gateway log stays readable.
  const origError = console.error;
  console.error = (...args) => {
    const first = args[0];
    if (typeof first === 'string' && first.includes('Invalid DOM property')) return;
    origError.apply(console, args);
  };

  const { createServer } = await import(
    pathToFileURL(path.join(SVELTE_PKG, 'node_modules/vite/dist/node/index.js')).href
  );
  const { svelte } = await import(
    pathToFileURL(
      path.join(SVELTE_PKG, 'node_modules/@sveltejs/vite-plugin-svelte/src/index.js')
    ).href
  );

  const vite = await createServer({
    root: ROOT,
    configFile: false,
    appType: 'custom',
    logLevel: 'error',
    server: { middlewareMode: true, hmr: false },
    plugins: [svelte()],
  });

  const [reactMod, svelteMod, vueMod, vueListMod, normMod] = await Promise.all([
    vite.ssrLoadModule(path.resolve(ROOT, 'packages/generator-react/src/index.ts')),
    vite.ssrLoadModule(path.resolve(ROOT, 'packages/generator-svelte/src/index.ts')),
    vite.ssrLoadModule(path.resolve(ROOT, 'packages/generator-vue/src/ssr.ts')),
    vite.ssrLoadModule(path.resolve(ROOT, 'packages/generator-vue/src/listSsr.ts')),
    vite.ssrLoadModule(path.resolve(ROOT, 'tests/fixtures/form-render/normalize.mjs')),
  ]);

  return {
    compileForm: reactMod.compileForm,
    renderReact: reactMod.renderForm,
    renderSvelte: svelteMod.renderForm,
    renderVue: vueMod.renderFormSSR,
    // list sister (read) — the SAME react/svelte index modules expose renderList;
    // Vue's list SSR lives in its own listSsr entry. Symmetric to the form trio.
    renderListReact: reactMod.renderList,
    renderListSvelte: svelteMod.renderList,
    renderListVue: vueListMod.renderListSSR,
    normalizeHtml: normMod.normalizeHtml,
    // Error classes for surfacing render failures with a stable `code` (the same
    // ERROR_CLASS_BY_CODE keys the conformance tests use).
    errorClasses: {
      react: {
        ComposeLoadError: reactMod.ComposeLoadError,
        UnsupportedFieldTypeError: reactMod.UnsupportedFieldTypeError,
      },
      svelte: {
        ComposeLoadError: svelteMod.ComposeLoadError,
        UnsupportedFieldTypeError: svelteMod.UnsupportedFieldTypeError,
      },
      vue: {
        ComposeLoadError: vueMod.ComposeLoadError,
        UnsupportedFieldTypeError: vueMod.UnsupportedFieldTypeError,
      },
    },
    close: () => vite.close(),
  };
}
