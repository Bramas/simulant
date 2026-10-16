// Publish exactly the previously packed and inspected archives, in dependency order.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packageDirectories, workspace } from './build-packages.mjs';

const registry = 'https://registry.npmjs.org';
const usage = 'Usage: node scripts/publish-packages.mjs --dry-run|--publish [--skip-published]\nRun pnpm packages:pack first.';

async function pendingPackages(release, request, log) {
  const pending = await Promise.all(release.map(async item => {
    const url = `${registry}/${encodeURIComponent(item.name)}/${encodeURIComponent(item.version)}`;
    const response = await request(url, { signal: AbortSignal.timeout(30000) });
    if (response.status === 404) return true;
    if (response.status !== 200) throw new Error(`Cannot check ${item.name}@${item.version}: npm returned HTTP ${response.status}`);
    const published = await response.json();
    if (published.name !== item.name || published.version !== item.version) throw new Error(`Unexpected npm metadata for ${item.name}@${item.version}`);
    return false;
  }));
  return release.filter((item, i) => {
    if (!pending[i]) log(`Skipping ${item.name}@${item.version}: already published`);
    return pending[i];
  });
}

function runNpm(args) {
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`npm publish failed (${result.status ?? result.signal})`);
}

export async function publishPackages(root, mode, { skipPublished = false, request = fetch, run = runNpm, log = console.log } = {}) {
  if (!['--dry-run', '--publish'].includes(mode)) throw new Error(usage);
  const output = join(root, 'dist/packages');
  const release = JSON.parse(readFileSync(join(output, 'release.json'), 'utf8'));
  if (JSON.stringify(release.map(p => p.directory)) !== JSON.stringify(packageDirectories)) throw new Error('The release package list does not match the explicit publish list.');
  // Validate all archives, including already-published packages, before querying npm or publishing.
  for (const item of release) {
    const manifest = JSON.parse(readFileSync(join(root, item.directory, 'package.json'), 'utf8'));
    if (item.name !== manifest.name || item.version !== manifest.version || manifest.private || basename(item.file) !== item.file) throw new Error(`Release metadata differs for ${item.name}; pack again.`);
    if (createHash('sha256').update(readFileSync(join(output, item.file))).digest('hex') !== item.sha256) throw new Error(`Archive changed: ${item.file}; pack again.`);
  }
  const pending = skipPublished ? await pendingPackages(release, request, log) : release;
  for (const item of pending) {
    const args = ['publish', join(output, item.file), `--registry=${registry}`, '--access=public', '--ignore-scripts'];
    if (mode === '--dry-run') args.push('--dry-run');
    else if (process.env.GITHUB_ACTIONS) args.push('--provenance');
    run(args);
  }
  if (!pending.length) log('All release versions are already published.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const [mode, ...flags] = process.argv.slice(2);
    if (flags.length > 1 || flags.some(flag => flag !== '--skip-published')) throw new Error(usage);
    await publishPackages(workspace, mode, { skipPublished: flags.includes('--skip-published') });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
