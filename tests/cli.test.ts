import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const binary = fileURLToPath(new URL('../packages/cli/bin/simulant.mjs', import.meta.url));

async function run(directory: string, args: string[]) {
  // The command is a normal Node process, rather than a child of Node's test harness.
  const environment = { ...process.env };
  delete environment.NODE_TEST_CONTEXT;
  try {
    const output = await execute(process.execPath, [binary, ...args], { cwd: directory, env: environment });
    return { ...output, code: 0 };
  } catch (error) {
    const result = error as Error & { code: number; stdout: string; stderr: string };
    return { code: result.code, stdout: result.stdout, stderr: result.stderr };
  }
}

/** A `.sim` project outside the workspace, with nothing installed: the CLI resolves its own packages. */
async function simFixture(t: { after: (callback: () => Promise<void>) => void }) {
  const directory = await mkdtemp(join(tmpdir(), 'simulant-cli-sim-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, 'src'));
  const main = await readFile(new URL('../projects/starter/src/main.sim', import.meta.url), 'utf8');
  await writeFile(join(directory, 'src/present.sim'), main);
  await writeFile(join(directory, 'src/emerging.sim'), main.replace('.initiallyPresent', '.mayEmerge'));
  await writeFile(join(directory, 'src/never.sim'), main.replace('.initiallyPresent', '.none'));
  await writeFile(join(directory, 'package.json'), JSON.stringify({ type: 'module', exports: { './projects': './src/projects.ts' } }));
  await writeFile(join(directory, 'src/projects.ts'), `
import { simProject } from '@bramas/simulant-ui/sim/project';
import * as present from './present.sim';
import * as emerging from './emerging.sim';
import * as never from './never.sim';
export const projects = {
  present: simProject(present, 'cautiousPair'),
  emerging: simProject(emerging, 'cautiousPair'),
  never: simProject(never, 'cautiousPair'),
};
`);
  return directory;
}

test('shared executable discovers simulations in an independent project', async t => {
  const directory = await simFixture(t);
  const result = await run(directory, ['list-projects']);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, 'emerging\nnever\npresent\n');

  const explicit = await run(tmpdir(), ['--root', directory, '--registry', './src/projects.ts', 'list-projects']);
  assert.equal(explicit.code, 0, explicit.stderr);
  assert.equal(explicit.stdout, result.stdout);
});

test('invalid limits, invalid settings and unknown projects return errors', async t => {
  const directory = await simFixture(t);
  const invalid = await run(directory, ['check-config', '-p', 'present', '-s', '{}', '-d', 'oops']);
  assert.equal(invalid.code, 1);
  assert.match(invalid.stderr, /non-negative integer/);
  const json = await run(directory, ['check-config', '-p', 'present', '-s', '{N:']);
  assert.equal(json.code, 1);
  assert.match(json.stderr, /Invalid JSON in settings/);
  const unknown = await run(directory, ['check-config', '-p', 'missing', '-s', '{}']);
  assert.equal(unknown.code, 1);
  assert.match(unknown.stderr, /Unknown project/);
});

test('.sim projects are checked by the explorer, with the same exit codes', async t => {
  const directory = await simFixture(t);
  const pass = await run(directory, ['check-config', '-p', 'present', '-s', '{"N":6,"site":2}']);
  assert.equal(pass.code, 0, pass.stdout + pass.stderr);
  assert.match(pass.stdout, /every admissible execution satisfies the task/);
  assert.match(pass.stdout, /Revision: [0-9a-f]{16}/);

  const fail = await run(directory, ['check-config', '-p', 'emerging', '-s', '{"N":5,"site":2}']);
  assert.equal(fail.code, 1, fail.stdout + fail.stderr);
  assert.match(fail.stdout, /path \[0(, \d+)+\]/);
  assert.match(fail.stdout, /\(activates\)/);

  const lasso = await run(directory, ['check-config', '-p', 'never', '-s', '{"N":5,"site":2}']);
  assert.equal(lasso.code, 1, lasso.stdout + lasso.stderr);
  assert.match(lasso.stdout, /repeats forever/);
  assert.match(lasso.stdout, /the cycle starts here/);

  const limited = await run(directory, ['check-config', '-p', 'present', '-s', '{"N":8,"site":5}', '-d', '2']);
  assert.equal(limited.code, 2, limited.stdout + limited.stderr);
  assert.match(limited.stdout, /depth limit 2/);
});

test('check-all shares state graphs by ring size, and reports the failing setting', async t => {
  const directory = await simFixture(t);
  const all = await run(directory, ['check-all', '-p', 'present']);
  assert.equal(all.code, 0, all.stdout + all.stderr);
  assert.match(all.stdout, /27 settings in 6 state graph\(s\)/);
  const separate = await run(directory, ['check-all', '-p', 'present', '--per-setting', '--max-configs', '5']);
  assert.equal(separate.code, 0, separate.stdout + separate.stderr);
  assert.match(separate.stdout, /5 settings in 5 state graph\(s\)/);
  const failing = await run(directory, ['check-all', '-p', 'emerging']);
  assert.equal(failing.code, 1, failing.stdout + failing.stderr);
  assert.match(failing.stdout, /FAILURE FOUND/);
  assert.match(failing.stdout, /settings \{"N":\d+,"site":\d+\}, path/);
});

test('smoke checks and state graphs of .sim projects', async t => {
  const directory = await simFixture(t);
  const smoke = await run(directory, ['check', 'present']);
  assert.equal(smoke.code, 0, smoke.stdout + smoke.stderr);
  assert.match(smoke.stdout, /Succeeded: 27/);
  const never = await run(directory, ['check', 'never']);
  assert.equal(never.code, 1, never.stdout + never.stderr);
  const graph = await run(directory, ['generate-config-graph', '-p', 'emerging', '-s', '{"N":4,"site":2}']);
  assert.equal(graph.code, 0, graph.stdout + graph.stderr);
  assert.match(graph.stdout, /\\begin\{tikzpicture\}/);
  assert.match(graph.stdout, /node\[midway, sloped, above\] \{activates\}/);
});
