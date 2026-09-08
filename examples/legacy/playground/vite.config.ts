import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@crudui/generator-react/legacy': path.resolve(__dirname, '../../../packages/generator-react/src/legacy'),
    },
  },
  optimizeDeps: {
    include: ['yaml'],
  },
});
