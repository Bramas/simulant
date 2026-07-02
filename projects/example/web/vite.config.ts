import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';

const fromRoot = (path: string) => fileURLToPath(new URL(`../../../${path}`, import.meta.url));

export default defineConfig({
  plugins: [solidPlugin()],
  resolve: {
    alias: {
      '@bramas/simulant-core': fromRoot('packages/core/src'),
      '@bramas/simulant-ui': fromRoot('packages/simulator-ui/src'),
    },
  },
  server: { port: 3000 },
  build: { outDir: '../../../dist/example', emptyOutDir: true, target: 'es2022' },
});
