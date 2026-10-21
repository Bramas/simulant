/** Watch mode of the CLI (plan, Sections 6.7 and Phase 6). */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { ProjectUpdate } from '../packages/core/src/types/project';
import { watchProject } from '../packages/cli/src/watch';

const binary = fileURLToPath(new URL('../packages/cli/bin/simulant.mjs', import.meta.url));

test('a run superseded by a newer revision is cancelled, and its result never printed', async () => {
  let listener!: (u: ProjectUpdate) => void;
  let revision = 'r1';
  const project = { subscribe: (l: typeof listener) => { listener = l; return () => {}; }, revision: () => revision } as any;
  const lines: string[] = [];
  const runs: AbortSignal[] = [];
  const watching = watchProject(project, signal => {
    runs.push(signal);
    const n = runs.length;
    return new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason));
      setTimeout(() => { lines.push(`result of run ${n}`); resolve(0); }, n === 1 ? 200 : 10);
    });
  }, line => lines.push(line));
  revision = 'r2';
  listener({ kind: 'replaced', revision, adjust: s => ({ settings: s, notes: [] }) });
  await new Promise(r => setTimeout(r, 300));
  assert.ok(runs[0].aborted && !runs[1].aborted);
  assert.ok(lines.includes('result of run 2'));
  assert.ok(lines.some(l => l.startsWith('--- revision r1')) && lines.some(l => l.startsWith('--- revision r2')));
  assert.equal(lines.filter(l => l.startsWith('--- exit code')).length, 1, lines.join('\n'));
  listener({ kind: 'failed', revision: 'r3', diagnostics: ['main.sim:3:4: oops'] });
  assert.ok(lines.includes('main.sim:3:4: oops'));
  watching.stop();
  await watching.done;
});

/** Collects a process's output and waits for patterns in it. */
function watchProcess(cwd: string, args: string[]) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const child = spawn(process.execPath, [binary, ...args], { cwd, env });
  let out = '';
  child.stdout.on('data', d => { out += d; });
  child.stderr.on('data', d => { out += d; });
  const waitFor = async (pattern: RegExp, from: number) => {
    for (let i = 0; i < 600; i++) {
      if (pattern.test(out.slice(from))) return out.length;
      await new Promise(r => setTimeout(r, 50));
    }
    throw new Error(`timed out waiting for ${pattern}:\n${out}`);
  };
  return { child, waitFor, output: () => out };
}

test('check-config --watch checks again on every revision, and reports sources that do not compile', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'simulant-watch-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, 'src'));
  const main = await readFile(new URL('../projects/starter/src/main.sim', import.meta.url), 'utf8');
  const file = join(directory, 'src/main.sim');
  await writeFile(file, main);
  await writeFile(join(directory, 'package.json'), JSON.stringify({ type: 'module', exports: { './projects': './src/projects.ts' } }));
  await writeFile(join(directory, 'src/projects.ts'), `import { simProject } from '@bramas/simulant-ui/sim/project';
import * as main from './main.sim';
export const projects = { pair: simProject(main, 'cautiousPair') };
`);
  const w = watchProcess(directory, ['check-config', '-p', 'pair', '-s', '{"N":5,"site":2}', '--watch']);
  t.after(() => { w.child.kill(); });
  let at = await w.waitFor(/exit code 0; watching/, 0);
  await writeFile(file, main.replace('.initiallyPresent', '.mayEmerge'));
  at = await w.waitFor(/Sources changed\.[^]*\(activates\)[^]*exit code 1; watching/, at);
  await writeFile(file, main.replace('move Ring.cw', 'move Ring.clockwise'));
  at = await w.waitFor(/the sources do not compile[^]*main\.sim:\d+:\d+: /, at);
  await writeFile(file, main);
  at = await w.waitFor(/Sources changed\.[^]*exit code 0; watching/, at);
  await writeFile(file, main.replace('import "std/models.sim"', '-- a comment\nimport "std/models.sim"'));
  await w.waitFor(/results unchanged/, at);
});
