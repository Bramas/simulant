/** `simulant lean`: Lean generation into a project (plan, Sections 5 and 6.6). */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const binary = fileURLToPath(new URL('../packages/cli/bin/simulant.mjs', import.meta.url));
const repo = fileURLToPath(new URL('..', import.meta.url));

async function run(args: string[], cwd = repo) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  try {
    const out = await promisify(execFile)(process.execPath, [binary, ...args], { cwd, env });
    return { code: 0, stdout: out.stdout + out.stderr };
  } catch (error) {
    const e = error as { code: number; stdout: string; stderr: string };
    return { code: e.code, stdout: e.stdout + e.stderr };
  }
}

async function localProject(t: { after: (callback: () => Promise<void>) => void }, names: string[]) {
  const directory = await mkdtemp(join(tmpdir(), 'simulant-lean-local-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, 'package.json'), JSON.stringify({ type: 'module', exports: { './projects': './projects.ts' } }));
  await writeFile(join(directory, 'main.sim'), `import "std/models.sim"
algorithm Idle uses occupied where
  main :=
    stay
experiment sample where
  model := obliviousRobots (Graphs.Cycle N) (Observe.radius 1) Frames.isomorphisms [occupied]
  algorithm := Idle
  task := Gathering
  param N : Nat in [3]
  agents := 1
  position i := pos 0
`);
  await writeFile(join(directory, 'projects.ts'), `import { simProject } from '@bramas/simulant-ui/sim/project';
import * as sim from './main.sim';
export const projects = { ${names.map(name => `${JSON.stringify(name)}: simProject(sim, 'sample')`).join(', ')} };
`);
  return directory;
}

test('lean infers the only local simulation, regenerates idempotently and rejects extra arguments', async t => {
  const directory = await localProject(t, ['my-simulation']);
  const generated = await run(['lean'], directory);
  assert.equal(generated.code, 0, generated.stdout);
  assert.match(generated.stdout, /Lean model of my-simulation/);
  const file = join(directory, 'lean/Generated/MySimulation/Model.lean');
  assert.match(await readFile(file, 'utf8'), /namespace Generated\.MySimulation/);

  const again = await run(['lean'], directory);
  assert.equal(again.code, 0, again.stdout);
  assert.match(again.stdout, /Up to date: nothing written/);

  const extra = await run(['lean', 'generate'], directory);
  assert.equal(extra.code, 1, extra.stdout);
  assert.match(extra.stdout, /too many arguments/);
});

test('lean asks for a simulation on ambiguity and accepts explicit selection', async t => {
  const directory = await localProject(t, ['first', 'second']);
  const ambiguous = await run(['lean'], directory);
  assert.equal(ambiguous.code, 1, ambiguous.stdout);
  assert.match(ambiguous.stdout, /Several simulations are available: first, second/);
  assert.match(ambiguous.stdout, /--project <name>/);
  await assert.rejects(access(join(directory, 'lean')), { code: 'ENOENT' });

  const selected = await run(['lean', '-p', 'second'], directory);
  assert.equal(selected.code, 0, selected.stdout);
  assert.match(selected.stdout, /Lean model of second/);
  assert.match(await readFile(join(directory, 'lean/Generated/Second/Model.lean'), 'utf8'), /namespace Generated\.Second/);
});

test('lean respects root, registry and output options and explains missing simulations', async t => {
  const directory = await localProject(t, ['local']);
  const output = join(directory, 'custom-lean');
  const generated = await run(['--root', directory, '--registry', 'projects.ts', 'lean', '-o', output]);
  assert.equal(generated.code, 0, generated.stdout);
  await access(join(output, 'Generated/Local/Model.lean'));
  await assert.rejects(access(join(directory, 'lean')), { code: 'ENOENT' });

  const empty = await localProject(t, []);
  const missing = await run(['lean'], empty);
  assert.equal(missing.code, 1, missing.stdout);
  assert.match(missing.stdout, /No simulations found/);
  assert.match(missing.stdout, /--root or --registry/);
  await assert.rejects(access(join(empty, 'lean')), { code: 'ENOENT' });
});

test('generation writes Generated/ only, is idempotent, and rejects proof files that cheat', async t => {
  const out = await mkdtemp(join(tmpdir(), 'simulant-lean-'));
  t.after(() => rm(out, { recursive: true, force: true }));
  const first = await run(['lean', '-p', 'cautious-pair', '-o', out]);
  assert.equal(first.code, 0, first.stdout);
  assert.match(first.stdout, /Written: lakefile\.toml, lean-toolchain, Generated\/CautiousPair\/Model\.lean, Generated\/CautiousPair\/revision\.json/);
  const model = await readFile(join(out, 'Generated/CautiousPair/Model.lean'), 'utf8');
  assert.match(model, /namespace Generated\.CautiousPair/);
  const revision = JSON.parse(await readFile(join(out, 'Generated/CautiousPair/revision.json'), 'utf8'));
  assert.equal(revision.experiment, 'cautiousPair');
  assert.match(revision.revision, /^[0-9a-f]{16}$/);

  // The researcher's files survive regeneration.
  const proof = 'import Generated.CautiousPair.Model\n\ntheorem starts : True := trivial\n';
  await writeFile(join(out, 'Proofs/Pair.lean'), proof);
  await writeFile(join(out, 'lakefile.toml'), (await readFile(join(out, 'lakefile.toml'), 'utf8')) + '\n# edited by hand\n');
  const again = await run(['lean', '-p', 'cautious-pair', '-o', out]);
  assert.equal(again.code, 0, again.stdout);
  assert.match(again.stdout, /Up to date: nothing written/);
  assert.equal(await readFile(join(out, 'Proofs/Pair.lean'), 'utf8'), proof);
  assert.match(await readFile(join(out, 'lakefile.toml'), 'utf8'), /edited by hand/);

  await writeFile(join(out, 'Proofs/Cheat.lean'), 'theorem cheat : False := sorry\n');
  const cheat = await run(['lean', '-p', 'cautious-pair', '-o', out]);
  assert.equal(cheat.code, 1, cheat.stdout);
  assert.match(cheat.stdout, /Proofs\/Cheat\.lean: the proof file contains `sorry`/);
});

test('the generated model and the proofs build with Lake', { skip: !process.env.SIMULANT_LEAN }, async t => {
  const out = await mkdtemp(join(tmpdir(), 'simulant-lean-build-'));
  t.after(() => rm(out, { recursive: true, force: true }));
  assert.equal((await run(['lean', '-p', 'cautious-pair', '-o', out])).code, 0);
  await writeFile(join(out, 'Proofs/Pair.lean'), 'import Generated.CautiousPair.Model\n\ntheorem starts : True := trivial\n');
  const built = await run(['lean', '-p', 'cautious-pair', '-o', out, '--build']);
  assert.equal(built.code, 0, built.stdout);
  assert.match(built.stdout, /lake build succeeded/);
  await writeFile(join(out, 'Proofs/Pair.lean'), 'import Generated.CautiousPair.Model\n\ntheorem wrong : 1 = 2 := rfl\n');
  const broken = await run(['lean', '-p', 'cautious-pair', '-o', out, '--build']);
  assert.equal(broken.code, 1, broken.stdout);
});

test('every migrated black-hole-search algorithm has a Lean model that builds', { skip: !process.env.SIMULANT_LEAN }, async t => {
  const out = await mkdtemp(join(tmpdir(), 'simulant-lean-bhs-'));
  t.after(() => rm(out, { recursive: true, force: true }));
  for (const i of [0, 1, 2, 3, 4, 5, 6]) {
    const generated = await run(['lean', '-p', `black-hole-search-algo${i}`, '-o', out]);
    assert.equal(generated.code, 0, generated.stdout);
  }
  const built = await run(['lean', '-p', 'black-hole-search-algo6', '-o', out, '--build']);
  assert.equal(built.code, 0, built.stdout);
});
