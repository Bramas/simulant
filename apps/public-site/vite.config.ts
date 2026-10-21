import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

const page = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  base: './',
  plugins: [solid()],
  build: {
    outDir: '../../dist',
    emptyOutDir: false,
    rollupOptions: {
      input: {
        home: page('index.html'),
        guide: page('guide/index.html'),
        library: page('library/index.html'),
        builder: page('builder/index.html'),
      },
    },
  },
});
