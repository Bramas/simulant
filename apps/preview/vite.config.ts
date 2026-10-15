/**
 * Preview of a `.sim` file:  SIMULANT_ENTRY=path/to/file.sim pnpm --filter @bramas/simulant-preview dev
 * (default: the standard library's examples). Saving the file or one of its imports refreshes the page.
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { simulant } from '../../packages/vite-plugin/src/index';

const root = fileURLToPath(new URL('.', import.meta.url));
const entry = resolve(process.env.SIMULANT_ENTRY ?? resolve(root, '../../packages/stdlib/sim/examples.sim'));

export default defineConfig({
  root,
  plugins: [simulant()],
  resolve: {
    alias: [
      { find: 'simulant-entry', replacement: entry },
      { find: /^@bramas\/simulant-(lang|engine)\/(.*)$/, replacement: resolve(root, '../../packages/$1/src/$2.ts') },
    ],
  },
  server: { fs: { allow: [resolve(root, '../..'), resolve(entry, '..')] } },
});
