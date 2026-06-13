/**
 * vitest config for the Svelte CAPTURE subprocess only.
 *
 * Svelte SSR requires compiling .svelte sources through the
 * @sveltejs/vite-plugin-svelte transform. The package's prebuilt dist is a
 * CLIENT bundle (vite lib build) and crashes under svelte/server render, so
 * the only working SSR path is the source component compiled by the plugin —
 * exactly what packages/generator-svelte/test/capture-svelte.mjs imports.
 *
 * This config exists in tests/cross-framework/ so the cross-framework suite
 * never modifies the generator-svelte package. It only drives the existing,
 * read-only capture-svelte.mjs.
 */
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  test: {
    include: ['svelte-capture.mjs'],
    environment: 'node',
    server: {
      deps: {
        inline: [/svelte/],
      },
    },
  },
});
