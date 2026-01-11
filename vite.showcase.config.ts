import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { aliases } from './aliases';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname, 'src/ui/showcase'),
  resolve: {
    alias: aliases,
  },
  server: {
    port: 5174, // Different port from main app
  },
  build: {
    outDir: path.resolve(__dirname, 'dist-showcase'),
  },
});
