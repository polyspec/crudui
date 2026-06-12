import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  test: {
    include: ['test/**/*.test.mjs'],
    // The Svelte SSR component graph must compile, so run in a node env with
    // the svelte plugin transform applied to .svelte imports.
    environment: 'node',
    server: {
      deps: {
        // parse5 / normalize.js are plain ESM from the shared parity harness.
        inline: [/svelte/],
      },
    },
  },
});
