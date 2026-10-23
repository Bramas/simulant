import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compileSource, errors, experiment } from './compile';

const PRELUDE = `import "std/examples.sim"\n`;
const BLACK_HOLE = (model: string) => `${PRELUDE}
experiment e where
  model := ${model}
  algorithm := CautiousPair
  task := IdentifyBlackHole
  param N : Nat in [5]
  param site : Pos in [pos 2]
  agents := 2
  position i := pos 0
`;

test('an experiment in a user module reuses the library unchanged', () => {
  const e = experiment(BLACK_HOLE('blackHoleRobots (Graphs.Cycle N) .mayEmerge .known (extra := [Faults.CrashStop 1, Storage.Pebbles])'));
  assert.deepEqual(e.model.components.map(c => c.name), ['BlackHole', 'CrashStop', 'Pebbles']);
  assert.deepEqual(e.model.components[0].args, { policy: 'mayEmerge' });
  assert.deepEqual(e.model.sensors.map(s => s.name), ['otherStates', 'spaceSize']);
});

test('parse errors point at the token', () => {
  assert.deepEqual(errors('def x : Nat := (1 +\n'), ['2:1 unexpected end of the file']);
  assert.deepEqual(errors('inductive A | a\n  b'), ['2:3 a declaration starts at the beginning of a line']);
  assert.deepEqual(errors('task T (C : Config) : Verdict := .success\nfoo'), ['2:1 expected a declaration, found \'foo\'']);
  assert.deepEqual(errors('sensor s (L : Look) where\n  x := 1\n'), ['3:1 a sensor with a Look-level part ends with `at (l : Loc) : T := ...`']);
});

test('elaboration errors point at the expression', () => {
  const src = BLACK_HOLE('blackHoleRobots (Graphs.Cycle N) .mayEmerge .unknown');
  const bad = src.replace('task := IdentifyBlackHole', 'task := Gathering\n  speed := 3');
  assert.deepEqual(errors(bad), ['7:3 unknown experiment field speed (expected one of model, algorithm, task, agents, position, limits, or param)']);
});

test('type errors from the checker point at the source expression', () => {
  const src = `${PRELUDE}
def Nosy : Component where
  flags := [flag scared visible, acts never]
  afterMove C := { raise scared := fun a => a.pos = true }
${BLACK_HOLE('blackHoleRobots (Graphs.Cycle N) .mayEmerge .unknown (extra := [Nosy])').slice(PRELUDE.length)}`;
  const errs = errors(src);
  assert.equal(errs.length, 1, errs.join('\n'));
  assert.match(errs[0], /^5:45 Nosy.afterMove: eq: Pos and Bool differ$/);
});

test('ownership errors point at the read of another component\'s field', () => {
  const src = `${PRELUDE}
def Nosy : Component where
  flags := [flag scared visible, acts never]
  afterMove C := { raise scared := fun a => a.pos = C.world.site }
${BLACK_HOLE('blackHoleRobots (Graphs.Cycle N) .mayEmerge .unknown (extra := [Nosy])').slice(PRELUDE.length)}`;
  const errs = errors(src);
  assert.equal(errs.length, 1, errs.join('\n'));
  assert.match(errs[0], /^5:53 Nosy.afterMove: world field site belongs to BlackHole$/);
});

test('an ambiguous constructor asks for a qualified name', () => {
  // HolePolicy and PebbleAction (from the pebbles) both have `none`.
  const src = BLACK_HOLE('blackHoleRobots (Graphs.Cycle N) .mayEmerge .unknown (extra := [Storage.Pebbles])').replace('algorithm := CautiousPair', 'algorithm := Bad') + `
algorithm Bad uses otherStates where
  Pub := { id : Nat, bh : Option Nat }
  init i := { pub := { id := i, bh := none } }
  step mem pub := { move := if otherStates.isEmpty then here else here, pub := { pub with id := if .none = .none then 0 else 1 } }
`;
  const errs = errors(src);
  assert.ok(errs.some(e => /ambiguous constructor \.none: it could be HolePolicy or PebbleAction; write HolePolicy\.none/.test(e)), errs.join('\n'));
});

test('an experiment records where the declarations it uses are written (display only)', () => {
  const source = `import "std/models.sim"

algorithm Stay uses occupied where
  main :=
    stay

/-- Doc comments are not part of the declaration's span. -/
experiment idle where
  model := robots (Graphs.Cycle N) (Observe.radius 1) Frames.isomorphisms [occupied] (components := [Faults.CrashAt])
  algorithm := Stay
  task := Gathering
  param N : Nat in [3]
  param crashNode : Pos in [pos 0]
  agents := 2
  position i := pos i
`;
  assert.deepEqual(errors(source), []);
  const e = experiment(source, 'idle');
  assert.deepEqual(e.source?.uses.map(u => `${u.kind} ${u.name}`), [
    'experiment idle', 'model robots', 'space Graphs.Cycle', 'sensor occupied', 'component Faults.CrashAt',
    'scheduler Schedulers.FSync', 'algorithm Stay', 'task Gathering', 'goal Gathering',
  ]);
  assert.deepEqual([e.source?.line, e.source?.endLine], [8, 15]);
});

test('optional action defaults accept none and some values', () => {
  const source = `import "std/models.sim"
def OptionalActions : Component where
  actions := [action keep : Option Nat := none, action set : Option Nat := (some 2)]
algorithm Idle where
  main :=
    stay
experiment optionalDefaults where
  model := robots (Graphs.Cycle N) (Observe.radius 1) Frames.identity [] (components := [OptionalActions])
  algorithm := Idle
  task := Gathering
  param N : Nat in [3]
  agents := 1
  position i := pos 0
`;
  assert.deepEqual(errors(source), []);
  assert.deepEqual(compileSource(source).experiments.optionalDefaults.experiment?.model.components[0].actions?.map(a => a.default), [null, 2]);
});

test('model arguments may name experiment parameters, which stay symbolic', () => {
  const e = experiment(`import "std/models.sim"
def lineModel : Model := robots Graphs.Line (Observe.radius (param phi)) Frames.isomorphisms [occupied]
algorithm A uses occupied where
  main :=
    stay
experiment e where
  model := lineModel
  algorithm := A
  task := Gathering
  param phi : Nat in [2, 3]
  param positions : List Int in [[0, 2]]
  agents := positions.length
  position i := pos (positions.at i)
`);
  assert.deepEqual(e.model.observation, { kind: 'radius', r: { e: 'param', name: 'phi' } });
  // A parameter named like a builtin (`positions`) is the parameter.
  assert.deepEqual(e.agents.count, { e: 'call', fn: 'length', args: [{ e: 'param', name: 'positions' }] });
});
