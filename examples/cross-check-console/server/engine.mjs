/**
 * Load the React, Vue and Svelte render entries in one Vite SSR environment.
 * The Svelte workspace supplies Vite and its matching compiler plugin.
 * Validation runs separately through the four language CLI processes.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '../../..');
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

  const { createServer } = await import('vite');
  const { svelte } = await import('@sveltejs/vite-plugin-svelte');

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
    vite.ssrLoadModule(path.resolve(ROOT, 'packages/generator-vue/src/index.ts')),
    vite.ssrLoadModule(path.resolve(ROOT, 'packages/generator-vue/src/listSsr.ts')),
    vite.ssrLoadModule(path.resolve(ROOT, 'tests/fixtures/form-render/normalize.mjs')),
  ]);

  return {
    compileForm: reactMod.compileForm,
    createForm: reactMod.createForm,
    renderReact: reactMod.renderForm,
    renderSvelte: svelteMod.renderForm,
    renderVue: vueMod.renderForm,
    // React and Svelte export list rendering from their package entries.
    // Vue exports list rendering from its list SSR entry.
    renderListReact: reactMod.renderList,
    renderListSvelte: svelteMod.renderList,
    renderListVue: vueListMod.renderList,
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
