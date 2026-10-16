import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { promisify } from 'node:util';
import { packageDirectories } from '../scripts/build-packages.mjs';
import { nextVersion, prepareVersion } from '../scripts/version-packages.mjs';

async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'simulant-version-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const write = (path: string, value: unknown) => {
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
  };
  for (const [i, directory] of packageDirectories.entries()) {
    write(`${directory}/package.json`, {
      name: `@bramas/release-${i}`, version: '1.2.3',
      publishConfig: { registry: 'https://registry.npmjs.org', access: 'public' },
      dependencies: { '@bramas/release-0': 'workspace:*' },
    });
  }
  write('packages/create-simulant/template/package.json', {
    name: 'project', version: '0.0.0', private: true,
    dependencies: { '@bramas/release-0': '1.2.3', 'solid-js': '1.9.3' },
    devDependencies: { '@bramas/release-1': '^1.2.3' },
  });
  write('package.json', { private: true, version: '0.0.0' });
  write('projects/private/example/package.json', { version: '9.8.7' });
  writeFileSync(join(root, 'pnpm-lock.yaml'), 'original lockfile\n');
  const read = (path: string) => JSON.parse(readFileSync(join(root, path), 'utf8'));
  return { root, write, read };
}

test('release increments reset lower version components and reject invalid or non-increasing versions', () => {
  assert.equal(nextVersion('1.2.3', 'patch'), '1.2.4');
  assert.equal(nextVersion('1.2.3', 'minor'), '1.3.0');
  assert.equal(nextVersion('1.2.3', 'major'), '2.0.0');
  assert.equal(nextVersion('1.2.3', '2.4.6'), '2.4.6');
  for (const version of ['1.2.3', '1.2.2', '0.9.9', '1.02.4', 'v1.2.4', '1.2.4-beta.1', 'patchy', '9007199254740992.0.0']) {
    assert.throws(() => nextVersion('1.2.3', version));
  }
});

test('dry-run plans every public package and template without updating files or the lockfile', async t => {
  const { root, read } = await fixture(t);
  const plan = prepareVersion(root, 'patch', { dryRun: true, updateLock: () => assert.fail('dry-run updated lockfile') });
  assert.equal(plan.version, '1.2.4');
  assert.equal(plan.changes.length, packageDirectories.length + 1);
  for (const c of plan.changes) assert.equal(readFileSync(c.file, 'utf8'), c.before);
  assert.equal(read('packages/stdlib/package.json').version, '1.2.3');
  assert.equal(readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8'), 'original lockfile\n');
});

test('a release updates shared versions and pinned dependencies while preserving workspace links and private projects', async t => {
  const { root, read } = await fixture(t);
  let calls = 0;
  prepareVersion(root, 'minor', { updateLock: (directory: string) => {
    calls++;
    assert.equal(directory, root);
    for (const p of packageDirectories) assert.equal(read(`${p}/package.json`).version, '1.3.0');
    writeFileSync(join(root, 'pnpm-lock.yaml'), 'new lockfile\n');
  } });
  assert.equal(calls, 1);
  for (const p of packageDirectories) assert.equal(read(`${p}/package.json`).dependencies['@bramas/release-0'], 'workspace:*');
  const template = read('packages/create-simulant/template/package.json');
  assert.equal(template.version, '0.0.0');
  assert.deepEqual(template.dependencies, { '@bramas/release-0': '1.3.0', 'solid-js': '1.9.3' });
  assert.deepEqual(template.devDependencies, { '@bramas/release-1': '^1.3.0' });
  assert.equal(read('package.json').version, '0.0.0');
  assert.equal(read('projects/private/example/package.json').version, '9.8.7');
  assert.equal(readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8'), 'new lockfile\n');
});

test('failed lockfile updates restore all manifests and the previous lockfile', async t => {
  const { root } = await fixture(t);
  const before = prepareVersion(root, 'patch', { dryRun: true });
  assert.throws(() => prepareVersion(root, 'patch', { updateLock: () => {
    writeFileSync(join(root, 'pnpm-lock.yaml'), 'partial lockfile');
    throw new Error('pnpm failed');
  } }), /pnpm failed/);
  for (const c of before.changes) assert.equal(readFileSync(c.file, 'utf8'), c.before);
  assert.equal(readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8'), 'original lockfile\n');
});

test('inconsistent package versions are rejected before writing any files', async t => {
  const { root, read, write } = await fixture(t);
  const file = `${packageDirectories.at(-1)}/package.json`;
  write(file, { ...read(file), version: '1.2.2' });
  assert.throws(() => prepareVersion(root, 'patch'), /same version/);
  assert.equal(read(`${packageDirectories[0]}/package.json`).version, '1.2.3');
});

test('the release command provides help, previews the real package set and rejects invalid arguments', async () => {
  const command = new URL('../scripts/version-packages.mjs', import.meta.url).pathname;
  const run = (args: string[]) => promisify(execFile)(process.execPath, [command, ...args]);
  assert.match((await run(['--help'])).stdout, /Usage: pnpm release:version/);
  const preview = await run(['patch', '--dry-run']);
  assert.match(preview.stdout, /Would prepare/);
  assert.match(preview.stdout, /lean\/package.json/);
  assert.match(preview.stdout, /Release tag: simulator-v/);
  await assert.rejects(run([]), /Usage:/);
  await assert.rejects(run(['patch', '--publish']), /Usage:/);
});
