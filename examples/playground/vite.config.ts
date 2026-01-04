import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@limepie/form-react': path.resolve(__dirname, '../../react/src'),
    },
  },
  optimizeDeps: {
    include: ['yaml'],
  },
});
