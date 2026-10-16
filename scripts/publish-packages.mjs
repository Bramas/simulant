// Publish exactly the previously packed and inspected archives, in dependency order.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { packageDirectories, workspace } from './build-packages.mjs';

if (process.argv.length !== 3 || !['--dry-run', '--publish'].includes(process.argv[2])) {
  console.error('Usage: node scripts/publish-packages.mjs --dry-run | --publish\nRun pnpm packages:pack first.');
  process.exit(1);
}
const output = join(workspace, 'dist/packages');
const release = JSON.parse(readFileSync(join(output, 'release.json'), 'utf8'));
if (JSON.stringify(release.map(p => p.directory)) !== JSON.stringify(packageDirectories)) throw new Error('The release package list does not match the explicit publish list.');
// Validate the whole release before publishing the first package.
for (const item of release) {
  const manifest = JSON.parse(readFileSync(join(workspace, item.directory, 'package.json'), 'utf8'));
  if (item.name !== manifest.name || item.version !== manifest.version || manifest.private || basename(item.file) !== item.file) throw new Error(`Release metadata differs for ${item.name}; pack again.`);
  if (createHash('sha256').update(readFileSync(join(output, item.file))).digest('hex') !== item.sha256) throw new Error(`Archive changed: ${item.file}; pack again.`);
}
for (const item of release) {
  const args = ['publish', join(output, item.file), '--registry=https://registry.npmjs.org', '--access=public', '--ignore-scripts'];
  if (process.argv[2] === '--dry-run') args.push('--dry-run');
  else if (process.env.GITHUB_ACTIONS) args.push('--provenance');
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
