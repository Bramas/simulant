/**
 * Writes the snapshot types of every experiment of the projects' `.sim`
 * files to `<project>/.simulant/types/` (as the development server does), so
 * that drawing code typechecks before the server first ran:
 *
 *   pnpm sim-types
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileSim, writeSnapshotTypes } from '../packages/vite-plugin/src/index';

const repo = fileURLToPath(new URL('..', import.meta.url));

function* simFiles(dir: string): Generator<string> {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* simFiles(p);
    else if (name.endsWith('.sim')) yield p;
  }
}

const projects = ['projects', 'projects/private'].flatMap(root => {
  const dir = join(repo, root);
  return existsSync(dir) ? readdirSync(dir).map(n => join(dir, n)).filter(p => statSync(p).isDirectory() && existsSync(join(p, 'package.json'))) : [];
});
let failures = 0;
for (const project of projects) {
  for (const file of [...simFiles(join(project, 'src')), ...simFiles(join(project, 'sim'))]) {
    const { module } = compileSim(file);
    for (const d of module.diagnostics) {
      console.error(`${d.file ?? file}:${d.line ?? 0}:${d.column ?? 0}: ${d.message}`);
      failures++;
    }
    writeSnapshotTypes(module, join(project, '.simulant/types'));
  }
}
process.exit(failures ? 1 : 0);
