import assert from 'node:assert/strict';
import { test } from 'node:test';
import { check } from '@bramas/simulant-lang/check';
import {
  agents, algorithm, component, cycle, effect, experiment as exp, flag, frames, here, ite, lit, locationSensor, model, neighbors,
  occupants, param, pos, present, radius, rec, sense, sensor, task, unit, verdict,
} from '@bramas/simulant-lang/builder';
import { IR_VERSION } from '@bramas/simulant-lang/ir';
import { T } from '@bramas/simulant-lang/types';
import { CYCLE, errors, experiment } from './compile';

const has = (errs: string[], text: string | RegExp) =>
  assert.ok(errs.some(e => typeof text === 'string' ? e.includes(text) : text.test(e)), errs.join('\n') || 'no errors');

const STAY = 'algorithm A uses otherStates where\n  main :=\n    stay';

test('a structured algorithm on a cycle compiles, and its IR round-trips through JSON', () => {
  const e = experiment(CYCLE(STAY));
  assert.equal(e.irVersion, IR_VERSION);
  assert.deepEqual(JSON.parse(JSON.stringify(e)), e);
  // `stay` is a move to the agent's own location.
  const step = e.algorithm.step as { fields: Record<string, unknown> };
  assert.deepEqual(step.fields.move, { e: 'call', fn: 'here', args: [] });
});

test('locations are valid for one activation: not in public state, memory or kept locals', () => {
  has(errors(CYCLE(`algorithm A uses otherStates where
  Pub := { last : Option Loc }
  init i := { pub := { last := none } }
  main :=
    stay`)), 'public state cannot be stored (locations are valid for one activation: store a port index instead)');
  has(errors(CYCLE(`algorithm A uses otherStates where
  main :=
    let l : Loc := here
    move Ring.cw
    move l`)), 'a location is valid for one activation and cannot be kept across a move');
});

test('algorithms never see positions', () => {
  has(errors(CYCLE(`algorithm A uses otherStates where
  Pub := { start : Option Pos }
  init i := { pub := { start := none } }
  main :=
    stay`)), 'cannot hold positions');
  has(errors(CYCLE(`algorithm A uses otherStates where
  main :=
    if pos 0 = pos 0 then stay else stay`)), 'pos is not allowed in an algorithm');
});

test('a sensor returns no position, agent or location, and its per-location part is deterministic', () => {
  const sensors = `
sensor whereAmI (L : Look) : Pos := L.position L.here
sensor coin (L : Look) (l : Loc) : Bool := choose [false, true]
sensor lucky (L : Look) where
  coin := choose [false, true]
  at (l : Loc) : Bool := coin ∧ (L.occupants l).any present
`;
  const src = (view: string) => CYCLE(`${sensors}\nalgorithm A uses ${view} where\n  main :=\n    stay`,
    `robots (Graphs.Cycle N) (Observe.radius 1) Frames.identity [${view}]`);
  has(errors(src('whereAmI')), "a sensor's result cannot contain Pos");
  has(errors(src('coin')), 'a per-location sensor is deterministic');
  assert.deepEqual(errors(src('lucky')), []);
});

test('sensors are read by the algorithm that uses them, at a location when they are per location', () => {
  has(errors(CYCLE(`algorithm A where
  main :=
    if otherStates.isEmpty then stay else stay`)), 'reads sensor otherStates without using it');
  has(errors(CYCLE(`algorithm A uses occupied where
  main :=
    if occupied then stay else stay`, 'robots (Graphs.Cycle N) (Observe.radius 1) Frames.identity [occupied]')), 'is read at a location');
  assert.deepEqual(errors(CYCLE(`algorithm A uses occupied where
  main :=
    if occupied Ring.cw then stay else move Ring.cw`, 'robots (Graphs.Cycle N) (Observe.radius 1) Frames.identity [occupied]')), []);
});

test('definitions that read the Look are algorithm-local', () => {
  has(errors(`import "std/models.sim"
algorithm A uses otherStates where
  main :=
    stay
task Bad (C : Config) : Verdict :=
  if Ring.cw = Ring.cw then .success else .inProgress
goal Bad := eventually .success
experiment e where
  model := robots (Graphs.Cycle N) (Observe.radius 1) Frames.identity [otherStates]
  algorithm := A
  task := Bad
  param N : Nat in [3]
  agents := 1
  position i := pos 0
`), /Ring.cw \(it reads the Look\) is read by algorithms/);
});

test('locations have no order of their own, and positions are opaque', () => {
  has(errors(CYCLE(`algorithm A uses otherStates where
  main :=
    if here < Ring.cw then stay else stay`)), 'expected Nat or Int');
  has(errors(`import "std/models.sim"
task Bad (C : Config) : Verdict :=
  if C.agents.all fun a => a.pos < a.pos then .success else .inProgress
goal Bad := eventually .success
algorithm A uses otherStates where
  main :=
    stay
experiment e where
  model := robots (Graphs.Cycle N) (Observe.radius 1) Frames.identity [otherStates]
  algorithm := A
  task := Bad
  param N : Nat in [3]
  agents := 1
  position i := pos 0
`), 'expected Nat or Int, got Pos');
});

test('a space must say how its infinite vertex set is reduced, and full views need finite spaces', () => {
  const space = `
def Ray : Space where
  Vertex := Int
  neighbors v := [v + 1, v - 1]
`;
  const src = (observe: string, s = 'Ray') => CYCLE(`${space}\n${STAY}`, `robots ${s} ${observe} Frames.isomorphisms [otherStates]`)
    .replace('  param N : Nat in [3, 4]\n', '');
  has(errors(src('(Observe.radius 1)')), 'Ray is infinite: give its automorphisms');
  has(errors(src('Observe.full', 'Graphs.Line')), 'Observe.full needs a finite space');
  assert.deepEqual(errors(src('(Observe.radius 2)', 'Graphs.Line')), []);
});

test('a hook updates only its own agent fields', () => {
  const comp = (field: string) => `
def Paint : Component where
  Agent := { color : Nat }
  init i := { color := 0 }
  afterMove C := { agents := fun a => { ${field} := 1 } }
`;
  const src = (field: string) => CYCLE(`${comp(field)}\n${STAY}`,
    'robots (Graphs.Cycle N) (Observe.radius 1) Frames.identity [otherStates] (components := [Paint, Storage.Lights 2])');
  assert.deepEqual(errors(src('color')), []);
  has(errors(src('light')), 'agent field light belongs to Lights');
});

test('number literals are Int where an Int is expected', () => {
  const e = experiment(CYCLE(`
def gap (a : Int) (b : Int) : Nat := (b - a + 1).toNat
algorithm A uses otherStates where
  main :=
    stay`).replace('param N : Nat in [3, 4]', 'param N : Nat in [3, 4]\n  param d : Nat in [gap 2 5]'));
  const def = e.model.defs?.find(d => d.name === 'gap');
  assert.deepEqual((def?.body as { args: { args: { type: unknown }[] }[] }).args[0].args[1].type, { k: 'int' });
});

test('the old ring constructs explain their replacement', () => {
  has(errors(CYCLE(STAY, 'obliviousRing')), /unknown name obliviousRing/);
  has(errors(CYCLE(STAY, 'robots Ring (Observe.radius 1) Frames.identity [otherStates]')), 'Ring is gone: use Graphs.Cycle N');
  has(errors(CYCLE(`algorithm A uses otherStates where
  Pub := { d : Move }
  init i := { pub := { d := .cw } }
  main :=
    stay`)), 'Move is gone');
});

test('the builder constructs a model on a cycle that typechecks', () => {
  const paint = component({
    name: 'Paint', agent: { color: T.nat }, init: { agent: { color: () => 0 } },
    afterMove: () => effect({ agents: () => rec({ color: 1 }) }),
  });
  const hole = component({
    name: 'Hole', world: { site: T.pos }, flags: [flag('dead', 'hidden', 'never')], init: { world: { site: param('site') } },
    afterMove: C => effect({ raise: { dead: agents(C).filter(a => a.pos.eq(C.world.site)) } }),
  });
  const crowded = locationSensor('crowded', T.bool, ({ L, l }) => occupants(L, l).count(a => present(a)).gt(1));
  const lonely = sensor('lonely', T.bool, ({ L }) => occupants(L, L.here).count(a => present(a)).eq(1));
  const e = exp({
    name: 'built',
    model: model({ name: 'm', space: cycle(), observation: radius(1), frames: frames.identity, sensors: [crowded, lonely], components: [paint, hole] }),
    algorithm: algorithm({
      name: 'A', uses: ['crowded', 'lonely'], pub: T.unit, init: { pub: () => unit() },
      step: () => ({ move: ite(sense('lonely').and(sense('crowded', neighbors(here()).at(0)).not()), neighbors(here()).at(0), here()) }),
    }),
    task: task({ name: 't', goal: 'safety', verdict: () => verdict('inProgress') }),
    params: [{ name: 'N', type: T.nat, domain: lit(T.list(T.nat), [3, 4]) }, { name: 'site', type: T.pos }],
    agents: { count: 2, pos: () => pos(0) },
  });
  assert.deepEqual(check(e).errors, []);
});
