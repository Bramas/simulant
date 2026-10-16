import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { test } from 'node:test';

const creator = fileURLToPath(new URL('../packages/create-simulant/bin/create-simulant.mjs', import.meta.url));
const run = (args: string[], cwd?: string) => promisify(execFile)(process.execPath, [creator, ...args], { cwd });

test('the initializer creates an empty project with pinned simulator versions and refuses overwrites', async t => {
  const root = await mkdtemp(join(tmpdir(), 'create-simulant-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = join(root, 'My Research');
  const created = await run([directory]);
  assert.match(created.stdout, /npm install/);
  const files = await readdir(directory);
  assert.ok(files.includes('.gitignore') && !files.includes('gitignore'));
  const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
  const version = JSON.parse(await readFile(new URL('../packages/create-simulant/package.json', import.meta.url), 'utf8')).version;
  assert.equal(manifest.name, 'my-research');
  for (const [name, value] of Object.entries({ ...manifest.dependencies, ...manifest.devDependencies })) {
    if (name.startsWith('@bramas/')) assert.equal(value, version);
  }
  await writeFile(join(directory, 'research.txt'), 'keep this work');
  await assert.rejects(run([directory]), /directory is not empty/);
  assert.equal(await readFile(join(directory, 'research.txt'), 'utf8'), 'keep this work');
});

test('the initializer has help and rejects missing names and unknown options', async () => {
  assert.match((await run(['--help'])).stdout, /Usage: npm create @bramas\/simulant/);
  await assert.rejects(run([]), /Give one project directory/);
  await assert.rejects(run(['--force']), /Give one project directory/);
});
