/**
 * The Vite configuration of a project page (projects/<slug>/web, or
 * projects/private/<slug>/web):
 *
 *   export default projectViteConfig('black-hole-search');
 *
 * Workspace packages resolve to their sources (as in tsconfig.base.json), so
 * pages build without installed workspace links. `.sim` imports go through
 * the Simulant plugin, in pages and in workers. The build goes to
 * dist/<slug> (dist/private/<slug> for private pages), with relative URLs
 * (see scripts/build-public-site.mjs).
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type UserConfig } from 'vite';
import solid from 'vite-plugin-solid';
import { simulant } from '../packages/vite-plugin/src/index';

const repo = fileURLToPath(new URL('..', import.meta.url));

const packages: Record<string, string> = {
  core: 'packages/core/src',
  ui: 'packages/simulator-ui/src',
  lang: 'packages/lang/src',
  engine: 'packages/engine/src',
  'vite-plugin': 'packages/vite-plugin/src',
};

export function projectViteConfig(slug: string): UserConfig {
  const project = [resolve(repo, 'projects', slug), resolve(repo, 'projects/private', slug)].find(dir => existsSync(resolve(dir, 'web')));
  if (!project) throw new Error(`no project page projects/${slug}/web or projects/private/${slug}/web`);
  const plugins = () => [solid(), simulant({ types: resolve(project, '.simulant/types') })];
  return defineConfig({
    root: resolve(project, 'web'),
    base: './',
    plugins: plugins(),
    worker: { format: 'es', plugins },
    resolve: {
      alias: Object.entries(packages).map(([name, dir]) => ({
        find: new RegExp(`^@bramas/simulant-${name}/(.*)$`),
        replacement: resolve(repo, dir, '$1'),
      })),
    },
    server: { fs: { allow: [repo] } },
    // Private pages stay out of the public site's folders.
    build: { outDir: resolve(repo, project.includes('projects/private') ? 'dist/private' : 'dist', slug), emptyOutDir: true },
  });
}
