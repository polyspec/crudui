// The Svelte rules of the components of this package. The TypeScript and JavaScript of the repository are linted by
// make lint-ts of kit (oxlint); oxlint has no Svelte rules, so ESLint with eslint-plugin-svelte checks the .svelte files
// here, and typescript-eslint parses their TypeScript scripts with the TypeScript 6 of this tools project, which no package that
// npm hoists to the root of the workspaces reaches.
import svelte from 'eslint-plugin-svelte';
import tseslint from 'typescript-eslint';

const svelteFiles = ['**/*.svelte'];

export default [
  ...svelte.configs['flat/recommended'].map(config => ({ ...config, files: svelteFiles })),
  {
    files: svelteFiles,
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['.svelte'],
      },
    },
  },
];
