import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  server: {
    port: 5177,
    strictPort: true,
    // Allow serving files from .gsd/ (hidden dot-dir)
    fs: {
      allow: ['.', resolve('.gsd')],
    },
  },
  build: {
    outDir: 'dist',
  },
});
