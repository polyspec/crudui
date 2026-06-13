/**
 * vitest config for the cross-framework COORDINATOR suite only
 * (cross-framework.test.mjs). It imports no framework — it reads the captured
 * artifacts under out/<fw>/ and re-analyzes them — so no svelte plugin or
 * framework realm setup is needed here. The Svelte capture leg has its own
 * config (vitest.svelte.config.mjs).
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['cross-framework.test.mjs'],
    environment: 'node',
  },
});
