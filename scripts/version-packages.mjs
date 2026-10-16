// Prepare one shared release version; Git and publication remain separate review steps.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packageDirectories, workspace } from './build-packages.mjs';

const usage = 'Usage: pnpm release:version patch|minor|major|X.Y.Z [--dry-run]';
const groups = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

function parts(version) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) throw new Error(`Expected a stable X.Y.Z version, got ${version}`);
  const numbers = version.split('.').map(Number);
  if (numbers.some(n => !Number.isSafeInteger(n))) throw new Error(`Version is too large: ${version}`);
  return numbers;
}

export function nextVersion(current, requested) {
  const before = parts(current);
  const index = ['major', 'minor', 'patch'].indexOf(requested);
  const after = index < 0 ? parts(requested) : before.map((n, i) => i < index ? n : i === index ? n + 1 : 0);
  const version = after.join('.');
  parts(version);
  const different = after.findIndex((n, i) => n !== before[i]);
  if (different < 0 || after[different] < before[different]) throw new Error(`New version ${version} must be greater than ${current}`);
  return version;
}

export function planVersion(root, requested) {
  const changes = packageDirectories.map(directory => {
    const file = join(root, directory, 'package.json');
    const before = readFileSync(file, 'utf8');
    const manifest = JSON.parse(before);
    if (manifest.private || manifest.publishConfig?.registry !== 'https://registry.npmjs.org' || manifest.publishConfig?.access !== 'public') {
      throw new Error(`Package is not configured for public npm: ${manifest.name}`);
    }
    return { file, before, manifest };
  });
  const current = changes[0].manifest.version;
  if (changes.some(c => c.manifest.version !== current)) throw new Error('Release packages must all have the same version before preparing a release');
  const version = nextVersion(current, requested);
  const names = new Set(changes.map(c => c.manifest.name));
  for (const c of changes) c.manifest.version = version;
  const template = join(root, 'packages/create-simulant/template/package.json');
  const before = readFileSync(template, 'utf8');
  changes.push({ file: template, before, manifest: JSON.parse(before) });
  for (const { manifest } of changes) {
    for (const group of groups) {
      for (const [name, specifier] of Object.entries(manifest[group] ?? {})) {
        if (!names.has(name) || specifier.startsWith('workspace:')) continue;
        const prefix = specifier.startsWith('^') || specifier.startsWith('~') ? specifier[0] : '';
        if (specifier !== `${prefix}${current}`) throw new Error(`Unexpected release dependency ${name}: ${specifier}`);
        manifest[group][name] = `${prefix}${version}`;
      }
    }
  }
  return { current, version, changes: changes.map(({ file, before, manifest }) => ({ file, before, after: JSON.stringify(manifest, null, 2) + '\n' })) };
}

function updateLockfile(root) {
  const result = spawnSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['install', '--lockfile-only', '--ignore-scripts'], { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Lockfile update failed (${result.status ?? result.signal})`);
}

export function prepareVersion(root, requested, { dryRun = false, updateLock = updateLockfile } = {}) {
  const plan = planVersion(root, requested);
  if (dryRun) return plan;
  const lockfile = join(root, 'pnpm-lock.yaml');
  const lockBefore = readFileSync(lockfile, 'utf8');
  try {
    for (const c of plan.changes) writeFileSync(c.file, c.after);
    updateLock(root);
  } catch (error) {
    for (const c of plan.changes) writeFileSync(c.file, c.before);
    writeFileSync(lockfile, lockBefore);
    throw error;
  }
  return plan;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
      console.log(usage);
    } else {
      if (args.length < 1 || args.length > 2 || (args.length === 2 && args[1] !== '--dry-run')) throw new Error(usage);
      const dryRun = args[1] === '--dry-run';
      const plan = prepareVersion(workspace, args[0], { dryRun });
      console.log(`${dryRun ? 'Would prepare' : 'Prepared'} ${plan.current} → ${plan.version}`);
      for (const c of plan.changes) console.log(c.file.slice(workspace.length));
      console.log(`${dryRun ? 'Would update' : 'Updated'} pnpm-lock.yaml`);
      console.log(`Review the diff and validate the release before committing. Release tag: simulator-v${plan.version}`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
