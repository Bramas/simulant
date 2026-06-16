import { mkdir, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { publicProjects } from '../apps/public-site/src/public-projects.mjs';

const run = (command, args) => {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
  }
};

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });

for (const project of publicProjects) {
  run('pnpm', ['--filter', project.packageName, 'build:web']);
}

await writeFile('dist/public-projects.json', `${JSON.stringify(publicProjects, null, 2)}\n`);
run('pnpm', ['--filter', '@bramas/simulant-public-site', 'build']);
await writeFile('dist/.nojekyll', '');
