import eslint from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import nodeTestRules from './scripts/lint/node-test-rules.mjs';
import { ignoredPaths } from './scripts/tracked-files.mjs';

const root = import.meta.dirname;

// Every JavaScript, TypeScript, Vue and Svelte source the repository tracks is
// linted with one rule set; tests/build/lint-coverage.test.mjs fails when a
// tracked source is left out. Only the paths that Git ignores are ignored,
// and the per-file settings below describe where code runs, not exceptions.
const sourceFiles = ['**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts,vue,svelte}'];
const svelteFiles = ['**/*.svelte', '**/*.svelte.js', '**/*.svelte.ts'];

// Code that runs only in a browser page.
const browserFiles = [
  ...svelteFiles,
  'examples/cross-check-console/client/**',
  'examples/form-structure/**',
  'examples/form-comparison/benchmark-console/**',
  'examples/form-comparison/public/main.mjs',
  'examples/form-comparison/src/pages/stage.mjs',
  'examples/form-comparison/src/save-form.mjs',
  'examples/form-comparison/src/form-validation.mjs',
  'examples/form-comparison/src/frame.mjs',
  'packages/generator-svelte/test/form-session.client.mjs',
  'packages/generator-svelte/test/view-session.client.mjs',
];

// Node programs and tests that also hand functions to a browser page
// (page.evaluate) or render into a DOM environment (jsdom).
const nodeAndBrowserFiles = [
  'examples/form-comparison/check-typing.mjs',
  'examples/form-comparison/src/save-form.test.mjs',
  'examples/form-comparison/src/browser-job.browser.mjs',
  'examples/form-comparison/src/main-page-readiness.mjs',
  'examples/form-comparison/src/pipeline-flow.mjs',
  'packages/generator-vue/test/form-session.test.mjs',
  'packages/generator-vue/test/view-session.test.mjs',
  'scripts/check-ci-browser.mjs',
  'scripts/check-packages.mjs',
  'tests/form-inspector/browser.test.mjs',
  'tests/form-styles.test.mjs',
  'tests/tailwind-styles.test.mjs',
  'tests/viewport.test.mjs',
  'tests/widget-script-runs.test.mjs',
  'tests/widget-scripts.test.mjs',
];

export default tseslint.config(
  {
    // Every path that Git ignores, as Git reports it for this checkout: installed and generated output, locks, run
    // records and the tools of the checkout. A file there is no source, so a stray copy under var/ never reaches lint.
    ignores: ignoredPaths(root).map(entry => (entry.endsWith('/') ? `${entry}**` : entry)),
  },
  { files: sourceFiles },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  // The Svelte rules only understand Svelte components and Svelte modules.
  ...svelte.configs['flat/recommended'].map((config) => (
    config.files || !config.rules ? config : { ...config, files: svelteFiles }
  )),
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Every node:test test is registered before the module's first wait (docs/operations/testing.md).
    files: sourceFiles,
    plugins: { crudui: nodeTestRules },
    rules: { 'crudui/no-await-after-test-registration': 'error' },
  },
  {
    files: sourceFiles,
    ignores: browserFiles,
    languageOptions: { globals: globals.node },
  },
  {
    files: [...browserFiles, ...nodeAndBrowserFiles],
    languageOptions: { globals: globals.browser },
  },
  {
    files: svelteFiles,
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['.svelte'],
      },
    },
  },
  {
    // The comparison build replaces these names with the frame's rendering
    // path and framework (the `define` option in examples/form-comparison/build.mjs).
    files: ['examples/form-comparison/src/frame.mjs'],
    languageOptions: {
      globals: { __FORM_PATH__: 'readonly', __FRAMEWORK__: 'readonly' },
    },
  },
  {
    // The root package is CommonJS, so its plain .js files are CommonJS
    // scripts that load modules with require().
    files: ['*.js', 'tools/**/*.js', '**/*.cjs'],
    languageOptions: { sourceType: 'commonjs' },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    // A CommonJS TypeScript project imports packages with `import x = require()`.
    files: ['**/*.cts'],
    rules: { '@typescript-eslint/no-require-imports': ['error', { allowAsImport: true }] },
  },
  {
    // Benchmarks are programs whose output is their console report.
    files: ['packages/*/benchmarks/**/*.ts', 'tools/bench/**'],
    rules: { 'no-console': 'off' },
  },
);
