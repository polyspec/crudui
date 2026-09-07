import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  resolve: { conditions: ['browser'] },
  test: {
    include: ['test/*.client.mjs'],
    environment: 'jsdom',
    server: { deps: { inline: [/svelte/] } },
  },
});
