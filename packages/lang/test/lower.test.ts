/**
 * Lowering of structured algorithms: memory, resume points and diagnostics. How the lowered
 * algorithms run is tested with the engine (packages/engine/test).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compileSource, experiment } from './compile';

const errorsOf = (source: string) => Object.values(compileSource(source).experiments).flatMap(r => r.diagnostics.map(d => `${d.span?.start.line}: ${d.message}`));

const ROBOTS = (algorithm: string, components = '[Faults.CrashAt]') => `import "std/models.sim"
${algorithm}
experiment e where
  model := robots (Graphs.Cycle N) Observe.full Frames.isomorphisms [occupied] (components := ${components})
  algorithm := A
  task := Gathering
  param N : Nat
  param positions : List Nat
  param crashNode : Pos
  agents := positions.length
  position i := pos (positions.at i)
`;

const PAIR = (body: string) => `import "std/examples.sim"
algorithm A uses otherStates where
  Pub := { id : Nat, bh : Option Nat }
  output claim := pub.bh
  init i := { pub := { id := i, bh := none } }
${body}
experiment e where
  model := blackHoleRobots (Graphs.Cycle N) .initiallyPresent .unknown
  algorithm := A
  task := IdentifyBlackHole
  param N : Nat
  param site : Pos
  agents := 2
  position i := pos 0
`;

test('a structured oblivious algorithm needs no memory', () => {
  // NearestNeighbour, written with statements and locations: one move at the end of `main`.
  const e = experiment(ROBOTS(`
algorithm A uses occupied where
  main :=
    let others := visible.filter fun l => l ≠ here ∧ occupied l
    if others.isEmpty then stay
    else
      let d := (others.map fun l => distance here l).at 0
      let towards := (neighbors here).filter fun n => others.any fun l => distance n l < d
      if towards.isEmpty then stay else move (towards.at 0)
`));
  assert.equal(e.algorithm.mem.k, 'unit');
});

test('resume points are numbered by kind in program order, with their lines', () => {
  const e = experiment(PAIR(`
  def leader (dir : Nat) :=
    repeat
      move (port dir)
      move (port (Port.opposite dir))
      move (port dir)
  def waiter (leaderId : Nat) (dir : Nat) :=
    repeat
      stay
      stay
      if !(otherStates.any (·.id = leaderId)) then
        pub := { pub with bh := some dir }
        halt
      move (port dir)
  main :=
    if pub.id = 0 then leader Port.cw else waiter 0 Port.cw
`));
  // The leader's three moves are on lines 9 to 11.
  const line = e.algorithm.line;
  assert.ok(line && line.e === 'match');
  const cases = (line as { cases: Record<string, { value: number }> }).cases;
  assert.deepEqual(['move1', 'move2', 'move3'].map(pc => cases[pc]?.value), [9, 10, 11], Object.keys(cases).join(', '));
  // `Port.cw` is a constant argument: no local, only the program counter.
  assert.deepEqual((e.algorithm.mem as { fields: { name: string }[] }).fields.map(f => f.name), ['pc']);
});

test('wait n keeps one counter; agents in procedures know the lines of the calls', () => {
  const e = experiment(PAIR(`
  def pause (n : Nat) :=
    wait n
  main :=
    if pub.id = 0 then
      wait 0
      pause 2
      move Ring.cw
      halt
    else
      halt
`));
  const mem = e.algorithm.mem as { fields: { name: string }[] };
  assert.deepEqual(mem.fields.map(f => f.name.replace(/_\d+$/, '')), ['pc', 'wait']);
  // The wait inside `pause` (line 8) is called at line 12.
  assert.ok(Object.values(e.algorithm.source?.calls ?? {}).some(c => c.length === 1 && c[0] === 12), JSON.stringify(e.algorithm.source?.calls));
});

test('an oblivious algorithm cannot continue after a move', () => {
  const errs = errorsOf(ROBOTS(`
algorithm A uses occupied where
  main :=
    move Ring.cw
    move Ring.ccw
`));
  assert.deepEqual(errs, ['5: A: in an oblivious model, the algorithm cannot continue after this move (it would need memory)']);
});

test('a loop must move, stay or halt on every iteration', () => {
  const errs = errorsOf(PAIR(`
  main :=
    repeat
      if pub.id = 0 then move Ring.cw
`));
  assert.deepEqual(errs, ['8: this loop can run again without move, stay or halt']);
});

test('procedures cannot be recursive', () => {
  const errs = errorsOf(PAIR(`
  def p (d : Nat) :=
    move (port d)
    p d
  main := p Port.cw
`));
  assert.deepEqual(errs, ['9: procedures cannot be recursive: p → p']);
});

test('a local kept across a move needs a type, and becomes memory', () => {
  const untyped = errorsOf(PAIR(`
  main :=
    let k := 0
    repeat
      move Ring.cw
      k := k + 1
`));
  assert.deepEqual(untyped, ['8: k is kept across a move: give its type (let x : T := ...)']);
  const typed = experiment(PAIR(`
  main :=
    let k : Nat := 0
    repeat
      move Ring.cw
      k := k + 1
`));
  const mem = typed.algorithm.mem as { fields: { name: string }[] };
  assert.deepEqual(mem.fields.map(f => f.name), ['pc', 'k_0']);
});

const PEBBLE_RING = (algorithm: string) => `import "std/models.sim"
${algorithm}
experiment e where
  model := blackHoleRobots (Graphs.Cycle N) .initiallyPresent .known (extra := [Storage.Pebbles])
  algorithm := A
  task := IdentifyBlackHole
  param N : Nat
  param site : Pos
  agents := 1
  position i := pos 0
`;

test('while conditions end with their line; else-if chains; actions with move, stay and halt', () => {
  const r = compileSource(PEBBLE_RING(`
algorithm A uses otherStates, spaceSize, pebblesHere where
  Pub := { id : Nat, bh : Option Nat }
  output claim := pub.bh
  init i := { pub := { id := i, bh := none } }
  main :=
    let k : Nat := 0
    while k < spaceSize - 4
      k := k + 1
      move Ring.cw with { pebble := .drop }
    if pebblesHere > 0 then
      stay
    else if k = 4 then
      move Ring.ccw
    else
      stay
    stay with { pebble := .pick }
    halt with { pebble := .drop }
`));
  assert.deepEqual(r.experiments.e.diagnostics.map(d => d.message), []);
});

test('an action that the model does not have is an error', () => {
  const errors = errorsOf(PEBBLE_RING(`
algorithm A uses otherStates where
  main :=
    move Ring.cw with { paint := .red }
`));
  assert.ok(errors.length > 0);
});

const WITH_DEFS = `
structure Ends where
  first : Nat
  last : Nat

def occupiedAt (v : List Bool) : List Nat := (range v.length).filter fun i => v.at i

def ends (v : List Bool) : Ends :=
  let os := occupiedAt v
  { first := os.at 0, last := os.at (os.length - 1) }

def smaller (a : List Bool) (b : List Bool) : Bool := a < b

def view : List Bool := Line.window.map occupied

algorithm A uses occupied where
  main :=
    let v := view
    let e := ends v
    if !v.at 1 ∧ e.last > 1 then
      move Ring.ccw
    else
      stay
`;

test('definitions on values: elaborated once, callees first, with what calls them', () => {
  const src = ROBOTS(WITH_DEFS).replace('param positions : List Nat', 'param positions : List Nat := [[0, 2]].filter fun p => smaller [false] [true]');
  const e = experiment(src);
  // In order of first use, each after the definitions it calls.
  assert.deepEqual(e.algorithm.defs?.map(d => d.name), ['port', 'Line.window', 'view', 'occupiedAt', 'ends', 'Ring.ccw']);
  assert.deepEqual(e.model.defs?.map(d => d.name), ['smaller']);
  assert.equal(e.task.defs, undefined);
});

test('definitions cannot be recursive or named like a builtin', () => {
  assert.match(errorsOf(ROBOTS(`
def loop (n : Nat) : Nat := loop n
algorithm A uses occupied where
  main := move (if loop 1 = 0 then Ring.cw else Ring.ccw)`)).join('\n'), /cannot be recursive: loop/);
  assert.match(errorsOf(ROBOTS(`
def distance (n : Nat) : Nat := n
algorithm A uses occupied where
  main := move (if distance 1 = 0 then Ring.cw else Ring.ccw)`)).join('\n'), /distance/);
});

test('type errors in statements point at the statement, with or without memory and actions', () => {
  const at = (source: string) => Object.values(compileSource(source).experiments).flatMap(r => r.diagnostics.map(d => [d.span?.start.line, d.span?.start.col, d.message]));
  const position = (source: string, text: string) => {
    const lines = source.split('\n');
    const line = lines.findIndex(l => l.includes(text));
    return [line + 1, lines[line].indexOf(text) + 1];
  };

  // No memory: the step loses its program counter after lowering.
  const oblivious = ROBOTS(`
algorithm A uses occupied where
  main :=
    if occupied here then stay
    else move 3
`);
  assert.deepEqual(at(oblivious), [[...position(oblivious, '3'), 'A.step: 3 is not a value of type Loc']]);

  // Memory and actions: decisions that omit an action get its default after lowering.
  const pebbles = `import "std/models.sim"
algorithm A uses pebblesHere where
  main :=
    stay with { pebble := .drop }
    move Ring.cw with { pebble := .grab }
    halt
experiment e where
  model := blackHoleRobots (Graphs.Cycle N) .none .unknown (extra := [Storage.Pebbles])
  algorithm := A
  task := Gathering
  param N : Nat in [3]
  param site : Pos in [pos 0]
  agents := 1
  position i := pos 0
`;
  const [diagnostic] = at(pebbles);
  assert.deepEqual(diagnostic.slice(0, 2), position(pebbles, '.grab'));
});
