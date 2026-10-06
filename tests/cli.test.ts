import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const binary = fileURLToPath(new URL('../packages/cli/bin/simulant.mjs', import.meta.url));
const core = fileURLToPath(new URL('../packages/core/', import.meta.url));

const registry = `
import { Config } from '@bramas/simulant-core/lib/system';
import { ND_array } from '@bramas/simulant-core/lib/non-determinism';

function setup() {
  const initial = new Config();
  initial.setState(0, 0);
  return {
    Agents: [], InitialConfig: initial, View: () => { throw new Error('No agents'); },
    Update: config => {
      const next = config.clone();
      next.setState(0, config.get(0).state + 1);
      return next;
    },
  };
}
const pass = {
  setup,
  executionStatusChecker: config => config.get(0).state >= 2 ? 'success' : 'inProgress',
  settingsGenerator: function* () { yield { N: 3 }; yield { N: 4 }; },
  debugConfig: config => 'round_' + config.get(0).state,
};
export const projects = {
  pass,
  fail: { ...pass, executionStatusChecker: config => config.get(0).state > 0 ? 'failure' : 'inProgress' },
  endless: { ...pass, executionStatusChecker: () => 'inProgress' },
  stuck: { ...pass, setup: () => ({ ...setup(), Update: () => new ND_array([]) }) },
  'broken-generator': { ...pass, settingsGenerator: function* () { throw new Error('generator failed'); } },
};
`;

async function fixture(t: { after: (callback: () => Promise<void>) => void }) {
  const directory = await mkdtemp(join(tmpdir(), 'simulant-cli-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, 'src'));
  await mkdir(join(directory, 'node_modules/@bramas'), { recursive: true });
  await symlink(core, join(directory, 'node_modules/@bramas/simulant-core'), 'dir');
  await writeFile(join(directory, 'package.json'), JSON.stringify({
    type: 'module', exports: { './projects': { import: './src/projects.ts' } },
  }));
  await writeFile(join(directory, 'src/projects.ts'), registry);
  return directory;
}

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

test('shared executable discovers TypeScript simulations in an independent project', async t => {
  const directory = await fixture(t);
  const result = await run(directory, ['list-projects']);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^pass$/m);
  assert.doesNotMatch(result.stdout, /black-hole-search/);

  const explicit = await run(tmpdir(), ['--root', directory, '--registry', './src/projects.ts', 'list-projects']);
  assert.equal(explicit.code, 0, explicit.stderr);
  assert.equal(explicit.stdout, result.stdout);
});

test('exhaustive checks distinguish success, failure, depth limits, and unfinished dead ends', async t => {
  const directory = await fixture(t);
  for (const [name, expected] of [['pass', 0], ['fail', 1], ['endless', 2], ['stuck', 2]] as const) {
    const result = await run(directory, ['check-config', '-p', name, '-s', '{}', '-d', '3']);
    assert.equal(result.code, expected, `${name}: ${result.stdout}\n${result.stderr}`);
  }
  const generated = await run(directory, ['check-all', '-p', 'pass', '--max-configs', '1']);
  assert.equal(generated.code, 0, generated.stderr);
  assert.match(generated.stdout, /Total configurations tested: 1/);
});

test('smoke checks and graph export use the same external project registry', async t => {
  const directory = await fixture(t);
  const smoke = await run(directory, ['check', 'pass']);
  assert.equal(smoke.code, 0, smoke.stderr);
  assert.match(smoke.stdout, /Succeeded: 2/);
  const graph = await run(directory, ['generate-config-graph', '-p', 'pass', '-s', '{}', '-d', '2']);
  assert.equal(graph.code, 0, graph.stderr);
  assert.match(graph.stdout, /\\begin\{tikzpicture\}/);
});

test('invalid limits, unknown projects, and settings generator errors return errors', async t => {
  const directory = await fixture(t);
  const invalid = await run(directory, ['check-config', '-p', 'pass', '-s', '{}', '-d', 'oops']);
  assert.equal(invalid.code, 1);
  assert.match(invalid.stderr, /non-negative integer/);
  const unknown = await run(directory, ['check-config', '-p', 'missing', '-s', '{}']);
  assert.equal(unknown.code, 1);
  assert.match(unknown.stderr, /Unknown project/);
  const generator = await run(directory, ['check', 'broken-generator']);
  assert.equal(generator.code, 1);
  assert.match(generator.stderr, /generator failed/);
});
