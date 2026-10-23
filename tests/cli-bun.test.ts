import assert from 'node:assert/strict';
import { execFile, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const binary = fileURLToPath(new URL('../packages/cli/bin/simulant.mjs', import.meta.url));
const bun = process.env.SIMULANT_BUN ?? 'bun';
const available = spawnSync(bun, ['--version']).status === 0;

test('Bun and Node agree on independent .sim projects, verdicts, limits and counterexamples', { skip: !available }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'simulant-bun-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, 'package.json'), JSON.stringify({ type: 'module' }));
  // Bun uses native package resolution; model the project's installed UI dependency.
  await mkdir(join(directory, 'node_modules/@bramas'), { recursive: true });
  await symlink(fileURLToPath(new URL('../packages/simulator-ui', import.meta.url)),
    join(directory, 'node_modules/@bramas/simulant-ui'), 'junction');
  await writeFile(join(directory, 'projects.ts'), `
import { simProject } from '@bramas/simulant-ui/sim/project';
import * as sim from './main.sim';
export const projects = { idle: simProject(sim, 'idle') };
`);
  await writeFile(join(directory, 'main.sim'), `
import "std/models.sim"
algorithm Idle uses occupied where
  main := stay
experiment idle where
  model := obliviousRobots (Graphs.Cycle N) (Observe.radius 1) Frames.isomorphisms [occupied]
  algorithm := Idle
  task := Gathering
  param N : Nat in [3, 4]
  param positions : List Pos in [[pos 0], [pos 1], [pos 0, pos 1]]
  agents := positions.length
  position i := positions.at i
`);
  const environment = { ...process.env };
  delete environment.NODE_TEST_CONTEXT;
  const run = async (runtime: string, args: string[]) => {
    try {
      const r = await execute(runtime, [binary, ...args], { cwd: directory, env: environment });
      return { code: 0, stdout: r.stdout, stderr: r.stderr };
    } catch (error) {
      const r = error as { code: number; stdout: string; stderr: string };
      return { code: r.code, stdout: r.stdout, stderr: r.stderr };
    }
  };
  for (const [args, code] of [
    [['list-projects'], 0],
    [['check-config', '-p', 'idle', '-s', '{"N":3,"positions":[0]}'], 0],
    [['check-config', '-p', 'idle', '-s', '{"N":3,"positions":[0,1]}'], 1],
    [['check-config', '-p', 'idle', '-s', '{"N":3,"positions":[0,1]}', '--max-states', '1'], 2],
    [['check-all', '-p', 'idle', '--max-configs', '2'], 0],
    [['check-all', '-p', 'idle', '--max-configs', '2', '--per-setting'], 0],
    [['check-all', '-p', 'idle'], 1],
  ] as [string[], number][]) {
    const nodeResult = await run(process.execPath, args);
    const bunResult = await run(bun, args);
    assert.equal(nodeResult.code, code, JSON.stringify(nodeResult));
    assert.deepEqual(bunResult, nodeResult, args.join(' '));
  }
});
