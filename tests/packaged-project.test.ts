/** Install the actual release archives outside the workspace; no source aliases or links. */
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { packPackages } from '../scripts/pack-packages.mjs';
import { workspace } from '../scripts/build-packages.mjs';

const execute = promisify(execFile);
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

test('packed initializer creates an independent installable project, CLI, website and Lean model', { skip: !process.env.SIMULANT_PACKAGES }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'simulant-release-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const archives = process.env.SIMULANT_PACKAGES_DIR && resolve(process.env.SIMULANT_PACKAGES_DIR);
  const packed: ReturnType<typeof packPackages> = archives
    ? (JSON.parse(await readFile(join(archives, 'release.json'), 'utf8')) as ReturnType<typeof packPackages>).map(item => ({ ...item, file: join(archives, item.file) }))
    : packPackages(join(directory, 'archives'));
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_PATH: '', NODE_OPTIONS: '', NO_COLOR: '1' };
  delete env.NODE_TEST_CONTEXT;
  const run = async (command: string, args: string[], cwd = directory) => {
    try { return await execute(command, args, { cwd, env, maxBuffer: 8 * 1024 * 1024 }); }
    catch (error) {
      const e = error as Error & { stdout?: string; stderr?: string };
      throw new Error(`${command} ${args.join(' ')}\n${e.stdout ?? ''}${e.stderr ?? ''}`, { cause: error });
    }
  };
  for (const item of packed) {
    const inventory = (await run('tar', ['-tzf', item.file])).stdout;
    assert.match(inventory, /^package\/README\.md$/m, `${item.name} must ship its README`);
    assert.doesNotMatch(inventory, /(?:^|\/)(?:node_modules|test|tests|private|\.lake)\//m, item.name);
    if (item.name === '@bramas/simulant-lean-gen') assert.doesNotMatch(inventory, /\/examples\.(?:ts|js)$/m);
    const manifest = JSON.parse((await run('tar', ['-xOzf', item.file, 'package/package.json'])).stdout);
    assert.equal(manifest.publishConfig.registry, 'https://registry.npmjs.org');
    assert.equal(manifest.publishConfig.access, 'public');
    assert.doesNotMatch(JSON.stringify(manifest.dependencies ?? {}), /workspace:/);
  }
  const initializer = packed.find(p => p.name === '@bramas/create-simulant')!;
  await run('tar', ['-xzf', initializer.file]);
  const creator = join(directory, 'package/bin/create-simulant.mjs');
  await run(process.execPath, [creator, 'my-research']);
  const project = join(directory, 'my-research');
  await assert.rejects(run(process.execPath, [creator, 'my-research']), /directory is not empty/);
  const manifestPath = join(project, 'package.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.equal(manifest.name, 'my-research');
  assert.equal(manifest.dependencies['@bramas/simulant-ui'], initializer.version);
  // Replace only release locations: npm installs the exact archives before first publication.
  for (const item of packed) {
    if (item.name === initializer.name) continue;
    const dependencies = manifest.dependencies[item.name] ? manifest.dependencies : manifest.devDependencies;
    dependencies[item.name] = `file:${item.file}`;
  }
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  await run(npm, ['install', '--no-audit', '--no-fund', ...(process.env.SIMULANT_PACKAGES_OFFLINE ? ['--offline'] : [])], project);
  assert.ok(!(await realpath(join(project, 'node_modules/@bramas/simulant-cli'))).startsWith(workspace));
  const cli = (args: string[]) => run(npm, ['exec', '--no', '--', 'simulant', ...args], project);
  assert.equal((await cli(['list-projects'])).stdout.trim(), 'cautious-pair');
  assert.match((await cli(['check-all', '-p', 'cautious-pair'])).stdout, /ALL CONFIGURATIONS PASSED/);
  await cli(['lean']);
  const model = await readFile(join(project, 'lean/Generated/CautiousPair/Model.lean'), 'utf8');
  assert.match(model, /namespace Generated\.CautiousPair/);
  const lakefile = await readFile(join(project, 'lean/lakefile.toml'), 'utf8');
  assert.doesNotMatch(lakefile, new RegExp(workspace.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  if (process.env.SIMULANT_LEAN) assert.match((await cli(['lean', '--build'])).stdout, /lake build succeeded/);
  await run(npm, ['run', 'typecheck'], project);
  assert.match((await run(npm, ['run', 'build'], project)).stdout, /built in/);
  assert.match(await readFile(join(project, 'dist/index.html'), 'utf8'), /Simulant/);

  const server = spawn(process.execPath, [join(project, 'node_modules/vite/bin/vite.js'), '--config', 'vite.config.ts', '--host', '127.0.0.1', '--port', '0'], { cwd: project, env });
  const stopServer = async () => {
    if (server.exitCode !== null || server.signalCode !== null) return;
    const exited = new Promise<void>(resolve => server.once('exit', () => resolve()));
    server.kill();
    // A dev server may keep watcher handles during graceful shutdown; never leave CI waiting.
    const force = setTimeout(() => server.kill('SIGKILL'), 3000);
    try { await exited; } finally { clearTimeout(force); }
  };
  t.after(stopServer);
  let output = '';
  const ready = new Promise<number>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Dev server did not start: ${output}`)), 15000);
    server.on('error', reject);
    server.on('exit', code => { clearTimeout(timeout); reject(new Error(`Dev server exited (${code}): ${output}`)); });
    const consume = (chunk: Buffer) => {
      output += chunk;
      const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (match) { clearTimeout(timeout); resolve(Number(match[1])); }
    };
    server.stdout.on('data', consume);
    server.stderr.on('data', consume);
  });
  const port = await ready;
  assert.equal((await fetch(`http://127.0.0.1:${port}/`)).status, 200);
  const app = await fetch(`http://127.0.0.1:${port}/src/App.tsx`);
  assert.equal(app.status, 200);
  const source = await app.text();
  // Solid's package export prevents the optimizer from compiling the UI as React JSX.
  const uiImport = source.match(/from "([^"\n]*simulant-ui[^"\n]*SimulatorApp\.jsx[^"\n]*)"/);
  assert.ok(uiImport, source);
  const ui = await fetch(new URL(uiImport[1], `http://127.0.0.1:${port}/`));
  assert.equal(ui.status, 200);
  assert.doesNotMatch(await ui.text(), /React\.createElement/);
  await stopServer();
});
