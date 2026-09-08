import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'serve-specs',
      configureServer(server) {
        server.middlewares.use('/specs', (req, res, next) => {
          const filePath = path.resolve(__dirname, '../shared-specs', req.url?.slice(1) || '');
          if (fs.existsSync(filePath)) {
            res.setHeader('Content-Type', 'text/yaml');
            fs.createReadStream(filePath).pipe(res);
          } else {
            next();
          }
        });
      },
    },
  ],
  server: {
    port: 3000,
    open: true,
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
});
