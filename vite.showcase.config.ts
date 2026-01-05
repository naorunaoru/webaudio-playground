import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname, 'src/ui/showcase'),
  server: {
    port: 5174, // Different port from main app
  },
  build: {
    outDir: path.resolve(__dirname, 'dist-showcase'),
  },
});
