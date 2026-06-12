import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'node:path';

export default defineConfig({
  plugins: [svelte()],
  build: {
    lib: {
      entry: { 'legacy/index': path.resolve(__dirname, 'src/legacy/index.ts') },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      external: ['svelte', 'svelte/server', 'svelte/internal', 'yaml', '@form-spec/validator'],
    },
  },
});
