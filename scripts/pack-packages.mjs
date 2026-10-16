import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPackages, packageDirectories, workspace } from './build-packages.mjs';

/** One explicit list controls both the release and isolated installation checks. */
export function packPackages(output) {
  buildPackages();
  mkdirSync(output, { recursive: true });
  const packed = packageDirectories.map(directory => {
    const path = join(workspace, directory);
    const manifest = JSON.parse(readFileSync(join(path, 'package.json'), 'utf8'));
    if (manifest.private || manifest.publishConfig?.registry !== 'https://registry.npmjs.org' || manifest.publishConfig?.access !== 'public') throw new Error(`Package is not configured for public npm: ${manifest.name}`);
    const result = spawnSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['pack', '--pack-destination', output],
      { cwd: path, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`${manifest.name}: ${result.stdout}${result.stderr}`);
    const file = join(output, `${manifest.name.replace(/^@/, '').replace('/', '-')}-${manifest.version}.tgz`);
    return { name: manifest.name, version: manifest.version, directory, file };
  });
  const release = packed.map(({ name, version, directory, file }) => ({ name, version, directory,
    file: file.split(/[\\/]/).pop(), sha256: createHash('sha256').update(readFileSync(file)).digest('hex') }));
  writeFileSync(join(output, 'release.json'), JSON.stringify(release, null, 2) + '\n');
  return packed;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  for (const item of packPackages(resolve(process.argv[2] ?? join(workspace, 'dist/packages')))) console.log(item.file);
}
