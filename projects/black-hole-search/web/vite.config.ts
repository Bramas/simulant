import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';

const fromRoot = (path: string) => fileURLToPath(new URL(`../../../${path}`, import.meta.url));

export default defineConfig({
  base: './',
  plugins: [solidPlugin()],
  resolve: {
    alias: {
      '@bramas/simulant-core': fromRoot('packages/core/src'),
      '@bramas/simulant-ui': fromRoot('packages/simulator-ui/src'),
      '@bramas/simulant-project-black-hole-search': fromRoot('projects/black-hole-search'),
    },
  },
  server: {
    port: 3000,
  },
  build: {
    outDir: '../../../dist/black-hole-search',
    emptyOutDir: true,
    target: 'es2022',
  },
});
