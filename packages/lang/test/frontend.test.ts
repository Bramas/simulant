import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { compile } from '@bramas/simulant-lang/elab/elaborate';
import { Program, type SourceHost } from '@bramas/simulant-lang/elab/program';
import { explore } from '@bramas/simulant-engine/explorer';
import { parameterValues, System } from '@bramas/simulant-engine/system';

const stdlib = new URL('../../stdlib/sim/', import.meta.url).pathname;

/** Sources in memory; `std/...` imports read the standard library from disk. */
function host(files: Record<string, string>): SourceHost {
  return {
    read: p => p.startsWith(stdlib) ? readFileSync(p, 'utf8') : files[p],
    resolve: (from, spec) => spec.startsWith('std/') ? join(stdlib, spec.slice(4)) : resolve(dirname(from), spec),
  };
}

function compileSource(source: string) {
  return compile(new Program(host({ '/mem/main.sim': source }), '/mem/main.sim'));
}

/** The diagnostics of the experiment `e` (or of the program), as "line:col message". */
function errors(source: string): string[] {
  const out = compileSource(source);
  return [...out.diagnostics, ...Object.values(out.experiments).flatMap(r => r.diagnostics)]
    .map(d => `${d.span?.start.line}:${d.span?.start.col} ${d.message}`);
}

const PRELUDE = `import "std/examples.sim"\n`;
const experiment = (model: string) => `${PRELUDE}
experiment e where
  model := ${model}
  algorithm := CautiousPair
  task := IdentifyBlackHole
  param N : Nat := [5]
  param site : Node := [node 2]
  agents := 2
  position i := node 0
`;

test('the examples compile, and the cautious pair identifies a hole present from the start', () => {
  const out = compile(new Program(host({}), join(stdlib, 'examples.sim')));
  assert.deepEqual(out.diagnostics, []);
  const r = out.experiments.cautiousPair;
  assert.deepEqual(r.diagnostics, []);
  for (const params of parameterValues(r.experiment!)) {
    assert.equal(explore(new System(r.experiment!, params)).status, 'success', JSON.stringify(params));
  }
});

test('an experiment in a user module reuses the library unchanged', () => {
  const out = compileSource(experiment('blackHoleRing .mayEmerge .known (extra := [Faults.CrashStop 1, Storage.Pebbles])'));
  const r = out.experiments.e;
  assert.deepEqual(r.diagnostics, []);
  assert.deepEqual(r.experiment!.model.components.map(c => c.name), ['BlackHole', 'CrashStop', 'Pebbles']);
  assert.deepEqual(r.experiment!.model.components[0].args, { policy: 'mayEmerge' });
  assert.equal(explore(new System(r.experiment!, { N: 5, site: 2 })).status, 'failure');
});

test('parse errors point at the token', () => {
  assert.deepEqual(errors('def x : Nat := (1 +\n'), ['2:1 unexpected end of the file']);
  assert.deepEqual(errors('inductive A | a\n  b'), ['2:3 a declaration starts at the beginning of a line']);
  assert.deepEqual(errors('task T (C : Config) : Verdict := .success\nfoo'), ['2:1 expected a declaration, found \'foo\'']);
});

test('elaboration errors point at the expression', () => {
  const src = experiment('blackHoleRing .mayEmerge .unknown');
  const bad = src.replace('task := IdentifyBlackHole', 'task := Gathering\n  speed := 3');
  assert.deepEqual(errors(bad), ['7:3 unknown experiment field speed (expected one of model, algorithm, task, agents, position, limits, or param)']);
});

test('type errors from the checker point at the source expression', () => {
  const src = `${PRELUDE}
def Nosy : Component where
  flags := [flag scared visible, acts never]
  afterMove C := { raise scared := fun a => a.pos = true }
${experiment('blackHoleRing .mayEmerge .unknown (extra := [Nosy])').slice(PRELUDE.length)}`;
  const errs = errors(src);
  assert.equal(errs.length, 1, errs.join('\n'));
  assert.match(errs[0], /^5:45 Nosy.afterMove: eq: Node and Bool differ$/);
});

test('ownership errors point at the read of another component\'s field', () => {
  const src = `${PRELUDE}
def Nosy : Component where
  flags := [flag scared visible, acts never]
  afterMove C := { raise scared := fun a => a.pos = C.world.site }
${experiment('blackHoleRing .mayEmerge .unknown (extra := [Nosy])').slice(PRELUDE.length)}`;
  const errs = errors(src);
  assert.equal(errs.length, 1, errs.join('\n'));
  assert.match(errs[0], /^5:53 Nosy.afterMove: world field site belongs to BlackHole$/);
});

test('an ambiguous constructor asks for a qualified name', () => {
  // HolePolicy and PebbleAction (from the pebbles) both have `none`.
  const src = experiment('blackHoleRing .mayEmerge .unknown (extra := [Storage.Pebbles])').replace('algorithm := CautiousPair', 'algorithm := Bad') + `
algorithm Bad uses otherStates where
  Pub := { id : Nat, bh : Option Move }
  init i := { pub := { id := i, bh := none } }
  step mem pub view := { move := if view.otherStates.isEmpty then .stay else .stay, pub := { pub with id := if .none = .none then 0 else 1 } }
`;
  const errs = errors(src);
  assert.ok(errs.some(e => /ambiguous constructor \.none: it could be HolePolicy or PebbleAction; write HolePolicy\.none/.test(e)), errs.join('\n'));
});

test('an experiment records where the declarations it uses are written (display only)', () => {
  const source = `import "std/models.sim"
import "std/tasks.sim"

algorithm Stay uses ringPresence where
  main :=
    stay

/-- Doc comments are not part of the declaration's span. -/
experiment idle where
  model := gatheringWithCrash
  algorithm := Stay
  task := Gathering
  param N : Nat := [3]
  param crashNode : Node := [node 0]
  agents := 2
  position i := node i
`;
  const r = compileSource(source).experiments.idle;
  assert.deepEqual(errors(source), []);
  assert.deepEqual(r.experiment?.source?.uses.map(u => `${u.kind} ${u.name}`), [
    'experiment idle', 'model gatheringWithCrash', 'model obliviousRing', 'sensor ringPresence', 'component Faults.CrashAtNode',
    'algorithm Stay', 'task Gathering', 'goal Gathering',
  ]);
  assert.deepEqual([r.experiment?.source?.line, r.experiment?.source?.endLine], [9, 16]);
});
