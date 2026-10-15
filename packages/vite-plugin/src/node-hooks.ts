/**
 * Node.js module hooks, registered by `register.ts` (and by the CLI):
 *
 * - `import * as m from './file.sim'` gives the same module as under Vite (see index.ts);
 * - `@bramas/simulant-*` imports that are not installed resolve to this workspace's sources,
 *   as `scripts/project-vite-config.ts` does for pages, so that a project outside the
 *   workspace can use the CLI without installing the packages.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compileSim, moduleSource } from './index';

type Load = (url: string, context: object) => Promise<{ format?: string; source?: unknown; shortCircuit?: boolean }>;
type Resolve = (specifier: string, context: object) => Promise<{ url: string; format?: string; shortCircuit?: boolean }>;

const workspace = new URL('../../../', import.meta.url);
const packages: Record<string, string> = {
  core: 'packages/core/src/', ui: 'packages/simulator-ui/src/', lang: 'packages/lang/src/',
  engine: 'packages/engine/src/', 'vite-plugin': 'packages/vite-plugin/src/',
  'lean-gen': 'packages/lean-gen/src/',
};

export async function resolve(specifier: string, context: object, nextResolve: Resolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    const m = /^@bramas\/simulant-([a-z-]+)(?:\/(.*))?$/.exec(specifier);
    if ((error as NodeJS.ErrnoException).code !== 'ERR_MODULE_NOT_FOUND' || !m || !packages[m[1]]) throw error;
    const base = fileURLToPath(new URL(packages[m[1]] + (m[2] ?? 'index'), workspace));
    const file = ['', '.ts', '.tsx', '/index.ts'].map(ext => base + ext).find(f => existsSync(f) && !f.endsWith('/'));
    if (!file) throw error;
    return { url: pathToFileURL(file).href, shortCircuit: true };
  }
}

export async function load(url: string, context: object, nextLoad: Load) {
  if (!url.startsWith('file:') || !url.replace(/[?#].*$/, '').endsWith('.sim')) return nextLoad(url, context);
  const file = fileURLToPath(url);
  const { module, files } = compileSim(file);
  return { format: 'module', source: moduleSource(module, { file, files }), shortCircuit: true };
}
