import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { compile } from '@bramas/simulant-lang/elab/elaborate';
import { nodeHost } from '@bramas/simulant-lang/elab/node';
import { Program } from '@bramas/simulant-lang/elab/program';
import { conformanceGraph } from '@bramas/simulant-engine/conformance';
import { explore } from '@bramas/simulant-engine/explorer';
import { definition, System } from '@bramas/simulant-engine/system';
import { generateModel } from '@bramas/simulant-lean-gen/model';

function compileSource(source: string) {
  const host = nodeHost();
  const out = compile(new Program({ ...host, read: p => p === '/mem/main.sim' ? source : host.read(p) }, '/mem/main.sim'));
  return Object.fromEntries(Object.entries(out.experiments).map(([n, r]) => [n, r]));
}

const errorsOf = (source: string) => Object.values(compileSource(source)).flatMap(r => r.diagnostics.map(d => `${d.span?.start.line}: ${d.message}`));

const ROBOTS = (algorithm: string, model = 'gatheringWithCrash') => `import "std/conformance.sim"
${algorithm}
experiment e where
  model := ${model}
  algorithm := A
  task := Gathering
  param N : Nat
  param positions : List Node
  param crashNode : Node
  agents := positions.length
  position i := positions.at i
`;

test('a structured oblivious algorithm needs no memory, and runs as its state-machine version', () => {
  // NearestNeighbour, written with statements: one move at the end of `main`.
  const r = compileSource(ROBOTS(`
algorithm A uses ringPresence where
  main :=
    let v := view.ringPresence
    let n := v.length
    let cw := (range n).filter fun i => i > 0 ∧ v.at i
    let ccw := (range n).filter fun i => i > 0 ∧ v.at (n - i)
    if cw.isEmpty then stay
    else
      let dcw := cw.at 0
      let dccw := ccw.at 0
      if dcw < dccw then move .cw else if dccw < dcw then move .ccw else stay
`.replaceAll('view.ringPresence', 'ringPresence'))).e;
  assert.deepEqual(r.diagnostics, []);
  assert.equal(r.experiment!.algorithm.mem.k, 'unit');
  const fixture = JSON.parse(readFileSync(new URL('../../engine/conformance/gathering-with-crash.json', import.meta.url), 'utf8'));
  const g = conformanceGraph('x', r.experiment!, fixture.params, fixture.maxStates);
  assert.deepEqual(JSON.parse(JSON.stringify(g.states)), fixture.states);
  assert.deepEqual(JSON.parse(JSON.stringify(g.edges)), fixture.edges);
});

const PAIR = (body: string) => `import "std/examples.sim"
algorithm A uses otherStates where
  Pub := { id : Nat, bh : Option Move }
  output claim := pub.bh
  init i := { pub := { id := i, bh := none } }
${body}
experiment e where
  model := blackHoleRing .initiallyPresent .unknown
  algorithm := A
  task := IdentifyBlackHole
  param N : Nat
  param site : Node
  agents := 2
  position i := node 0
`;

test('the structured cautious pair explores like the state machine', () => {
  const structured = compileSource(PAIR(`
  def leader (dir : Move) :=
    repeat
      move dir
      move dir.opposite
      move dir
  def waiter (leaderId : Nat) (dir : Move) :=
    repeat
      stay
      stay
      if !(otherStates.any (·.id = leaderId)) then
        pub := { pub with bh := some dir }
        halt
      move dir
  main :=
    if pub.id = 0 then leader .cw else waiter 0 .cw
`)).e;
  assert.deepEqual(structured.diagnostics, []);
  const machine = compileSource(`import "std/examples.sim"
experiment e where
  model := blackHoleRing .initiallyPresent .unknown
  algorithm := CautiousPair
  task := IdentifyBlackHole
  param N : Nat
  param site : Node
  agents := 2
  position i := node 0
`).e;
  for (const params of [{ N: 5, site: 3 }, { N: 6, site: 1 }]) {
    const a = explore(new System(structured.experiment!, params));
    const b = explore(new System(machine.experiment!, params));
    assert.equal(a.status, b.status);
    assert.equal(a.stats.states, b.stats.states);
    assert.equal(a.stats.edges, b.stats.edges);
  }
  // The line of each resume point (numbered by kind in program order): the leader's three moves are on lines 9 to 11.
  const line = structured.experiment!.algorithm.line;
  assert.ok(line && line.e === 'match');
  const cases = (line as { cases: Record<string, { value: number }> }).cases;
  assert.deepEqual(['move1', 'move2', 'move3'].map(pc => cases[pc]?.value), [9, 10, 11], Object.keys(cases).join(', '));
});

test('wait n stays n activations on its own line; agents in procedures know the lines of the calls', () => {
  const exp = compileSource(PAIR(`
  def pause (n : Nat) :=
    wait n
  main :=
    if pub.id = 0 then
      wait 0
      pause 2
      move .cw
      halt
    else
      halt
`)).e.experiment!;
  // One counter for every wait, besides the program counter.
  const mem = exp.algorithm.mem as { fields: { name: string }[] };
  assert.deepEqual(mem.fields.map(f => f.name.replace(/_\d+$/, '')), ['pc', 'wait']);
  const sys = new System(exp, { N: 5, site: 3 });
  let C = sys.initial()[0].config;
  const rounds: [number, number | undefined, number[], unknown][] = [];
  for (let r = 0; r < 4; r++) {
    [C] = sys.successors(C).map(s => s.config);
    const a = C.agents.find(x => x.pub.id === 0)!;
    const pc = (a.mem as { pc: string }).pc;
    const counter = Object.entries(a.mem as object).find(([k]) => k.startsWith('wait'))![1];
    rounds.push([a.pos, sys.line(a), exp.algorithm.source?.calls?.[pc] ?? [], counter]);
  }
  // `wait 0` does nothing; `pause 2` stays twice at the wait (line 8, called at line 12), the counter
  // back to 0 after; then the move (line 13) and the halt (line 14), outside any call.
  assert.deepEqual(rounds, [[0, 8, [12], 1], [0, 8, [12], 0], [1, 13, [], 0], [1, 14, [], 0]]);
});

test('an oblivious algorithm cannot continue after a move', () => {
  const errs = errorsOf(ROBOTS(`
algorithm A uses ringPresence where
  main :=
    move .cw
    move .ccw
`));
  assert.deepEqual(errs, ['5: A: in an oblivious model, the algorithm cannot continue after this move (it would need memory)']);
});

test('a loop must move, stay or halt on every iteration', () => {
  const errs = errorsOf(PAIR(`
  main :=
    repeat
      if pub.id = 0 then move .cw
`));
  assert.deepEqual(errs, ['8: this loop can run again without move, stay or halt']);
});

test('procedures cannot be recursive', () => {
  const errs = errorsOf(PAIR(`
  def p (d : Move) :=
    move d
    p d
  main := p .cw
`));
  assert.deepEqual(errs, ['9: procedures cannot be recursive: p → p']);
});

test('a local kept across a move needs a type, and becomes memory', () => {
  const untyped = errorsOf(PAIR(`
  main :=
    let k := 0
    repeat
      move .cw
      k := k + 1
`));
  assert.deepEqual(untyped, ['8: k is kept across a move: give its type (let x : T := ...)']);
  const typed = compileSource(PAIR(`
  main :=
    let k : Nat := 0
    repeat
      move .cw
      k := k + 1
`)).e;
  assert.deepEqual(typed.diagnostics, []);
  const mem = typed.experiment!.algorithm.mem as { fields: { name: string }[] };
  assert.deepEqual(mem.fields.map(f => f.name), ['pc', 'k_0']);
});

const PEBBLE_RING = (algorithm: string) => `import "std/models.sim"
import "std/tasks.sim"
${algorithm}
experiment e where
  model := blackHoleRing .initiallyPresent .known (extra := [Storage.Pebbles])
  algorithm := A
  task := IdentifyBlackHole
  param N : Nat
  param site : Node
  agents := 1
  position i := node 0
`;

test('while conditions end with their line; else-if chains; actions with move, stay and halt', () => {
  const r = compileSource(PEBBLE_RING(`
algorithm A uses otherStates, ringSize, pebblesHere where
  Pub := { id : Nat, bh : Option Move }
  init i := { pub := { id := i, bh := none } }
  main :=
    let k : Nat := 0
    while k < ringSize - 4
      k := k + 1
      move .cw with { pebble := .drop }
    if pebblesHere > 0 then
      stay
    else if k = 4 then
      move .ccw
    else
      stay
    stay with { pebble := .pick }
    halt with { pebble := .drop }
`));
  assert.deepEqual(r.e.diagnostics.map(d => d.message), []);
  const sys = new System(r.e.experiment!, { N: 8, site: 7 });
  let C = sys.initial()[0].config;
  const rounds: string[] = [];
  for (let i = 0; i < 9; i++) {
    C = sys.successors(C)[0].config;
    rounds.push(`${C.agents[0].pos}:${[...C.world.pebbles].join(',')}`);
  }
  // Four steps clockwise dropping a pebble each, back one node, pick the pebble there, drop it
  // again when halting, and nothing more once halted.
  assert.deepEqual(rounds, ['1:0', '2:0,1', '3:0,1,2', '4:0,1,2,3', '3:0,1,2,3', '3:0,1,2', '3:0,1,2,3', '3:0,1,2,3', '3:0,1,2,3']);
});

test('an action that the model does not have is an error', () => {
  const errors = errorsOf(PEBBLE_RING(`
algorithm A uses otherStates where
  main :=
    move .cw with { paint := .red }
`));
  assert.ok(errors.length > 0);
});

const WITH_DEFS = `
structure Ends where
  first : Nat
  last : Nat

def occupied (v : List Bool) : List Nat := (range v.length).filter fun i => v.at i

def ends (v : List Bool) : Ends :=
  let os := occupied v
  { first := os.at 0, last := os.at (os.length - 1) }

def smaller (a : List Bool) (b : List Bool) : Bool := a < b

algorithm A uses ringPresence where
  main :=
    let v := ringPresence
    let e := ends v
    if !v.at 1 ∧ e.last > 1 then
      move .ccw
    else
      stay
`;

test('definitions on values: elaborated once, callees first, with what calls them', () => {
  const src = ROBOTS(WITH_DEFS).replace('param positions : List Node', 'param positions : List Node := [[node 0, node 2]].filter fun p => smaller [false] [true]');
  const r = compileSource(src).e;
  assert.deepEqual(r.diagnostics, []);
  const exp = r.experiment!;
  assert.deepEqual(exp.algorithm.defs?.map(d => d.name), ['occupied', 'ends']);
  assert.deepEqual(exp.model.defs?.map(d => d.name), ['smaller']);
  assert.equal(exp.task.defs, undefined);
  // `!v.at 1` is `!(v.at 1)`.
  const sys = new System(exp, { N: 4, positions: [0, 2], crashNode: 0 }, { memoStep: false });
  const step = (sys as unknown as { step: (m: unknown, p: unknown, v: object) => { move: string } }).step;
  assert.equal(step(null, null, { ringPresence: [true, false, true, false] }).move, 'ccw');
  assert.equal(step(null, null, { ringPresence: [true, true, false, false] }).move, 'stay');
  assert.deepEqual(definition(exp, 'ends')([false, true, true, false]), { first: 1, last: 2 });
});

test('lists of Bool and Nat compare lexicographically, false before true, a prefix first', () => {
  const src = ROBOTS(WITH_DEFS.replace('if !v.at 1 ∧ e.last > 1 then', 'if !v.at 1 ∧ e.last > 1 ∧ smaller [false] v then'));
  const lt = definition(compileSource(src).e.experiment!, 'smaller');
  assert.equal(lt([false, true], [true, false]), true);
  assert.equal(lt([true], [true, false]), true);
  assert.equal(lt([true, false], [true, false]), false);
  assert.equal(lt([true, false], [false, true]), false);
});

test('definitions cannot be recursive or named like a builtin', () => {
  assert.match(errorsOf(ROBOTS(`
def loop (n : Nat) : Nat := loop n
algorithm A uses ringPresence where
  main := move (if loop 1 = 0 then .cw else .ccw)`)).join('\n'), /cannot be recursive: loop/);
  assert.match(errorsOf(ROBOTS(`
def target (n : Nat) : Nat := n
algorithm A uses ringPresence where
  main := move (if target 1 = 0 then .cw else .ccw)`)).join('\n'), /target/);
});

test('the Lean model declares the definitions before the step', () => {
  const lean = generateModel(compileSource(ROBOTS(WITH_DEFS)).e.experiment!, 'Defs');
  const at = (s: string) => lean.indexOf(s);
  assert.ok(at('def occupied (v : List (Bool)) : List (Nat)') >= 0, lean.slice(0, 2000));
  assert.ok(at('def occupied') < at('def ends') && at('def ends') < at('def step'));
});

test('a step is explained: the line that decided, and each definition called with its result and return line', () => {
  const algorithm = `
def side (v : List Bool) : Move :=
  if v.at 1 then .cw
  else .ccw

algorithm A uses ringPresence where
  main :=
    if ringPresence.length > 100 then stay
    else move (side ringPresence)
`;
  const source = ROBOTS(algorithm);
  const lineOf = (text: string) => source.split('\n').findIndex(l => l.includes(text)) + 1;
  const exp = compileSource(source).e.experiment!;
  // Where the definition is written, for the algorithm view.
  assert.deepEqual(exp.algorithm.source?.defs?.map(d => [d.name, d.line, d.endLine]), [['side', lineOf('def side'), lineOf('else .ccw')]]);
  const sys = new System(exp, { N: 5, positions: [0, 1], crashNode: 0 });
  const C = sys.initial()[0].config;
  const next = sys.successors(C);
  for (const s of next) {
    const explanations = sys.explainAll(C, s.key);
    assert.equal(explanations.length, 2);
    for (const e of explanations) {
      assert.ok(e);
      assert.equal(e.line, lineOf('move (side'));
      assert.equal(e.calls.length, 1);
      const [call] = e.calls;
      assert.equal(call.fn, 'side');
      assert.equal(call.result, e.move);
      assert.equal(call.line, lineOf(call.result === 'cw' ? 'then .cw' : 'else .ccw'));
      assert.match(e.view.ringPresence, /^\[[X.]{5}\]$/);
    }
  }
  // Explaining evaluates nothing in the step's normal evaluation: the lines are display only.
  assert.deepEqual(sys.successors(C).map(s => s.key), next.map(s => s.key));
});
