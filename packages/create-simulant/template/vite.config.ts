import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import { simulant } from '@bramas/simulant-vite-plugin';

// The published UI ships Solid JSX; compile it together with the project's UI.
const plugins = () => [solid({ exclude: [] }), simulant()];

export default defineConfig({
  root: 'web',
  base: './',
  plugins: plugins(),
  worker: { format: 'es', plugins },
  build: { outDir: '../dist', emptyOutDir: true },
});
