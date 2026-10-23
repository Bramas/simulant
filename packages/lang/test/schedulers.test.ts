import assert from 'node:assert/strict';
import { test } from 'node:test';
import { System } from '@bramas/simulant-engine/system';
import { CYCLE, errors, experiment } from './compile';

const STAY = `algorithm A uses otherStates where
  main :=
    stay
`;

/** A scheduler of the experiment's own, and a model that uses it. */
const withScheduler = (scheduler: string, algorithm = STAY) =>
  CYCLE(`${algorithm}\n${scheduler}`, 'robots (Graphs.Cycle N) (Observe.radius 1) Frames.identity [otherStates] (memory := .persistent) (scheduler := Late)');

const LATE = `/-- Agents wait at most one step; the cycle is cut into Look, then Compute and Move. -/
@[equivariant]
def Late : Scheduler where
  Agent := { waited : Nat }
  init i := { waited := 0 }
  events := [[.look], [.compute, .move]]
  fairness := .none
  schedule C :=
    let S := choose ((nonemptySubsets C.eligible).filter fun S => C.eligible.all fun a => a.waited = 0 ∨ S.contains a)
      labels fun S => "activates " ++ show S
    { activate := S, agents := fun a => { waited := if S.contains a then 0 else a.waited + 1 } }
`;

test('the library schedulers compile, and models take FSYNC by default', () => {
  const e = experiment(CYCLE(STAY));
  assert.equal(e.model.scheduler.name, 'FSync');
  assert.deepEqual(e.model.scheduler.events, [['look', 'compute', 'move']]);
  assert.equal(e.model.scheduler.fairness, 'none');
  for (const name of ['SSync', 'Sequential']) {
    const s = experiment(CYCLE(STAY, `robots (Graphs.Cycle N) (Observe.radius 1) Frames.identity [otherStates] (scheduler := Schedulers.${name})`)).model.scheduler;
    assert.equal(s.name, name);
    assert.equal(s.fairness, 'activation');
    assert.ok(s.equivariant);
  }
});

test('a scheduler of its own: fields, events, fairness and an effect that activates', () => {
  const s = experiment(withScheduler(LATE)).model.scheduler;
  assert.deepEqual(s.agent, [{ name: 'waited', type: { k: 'nat' } }]);
  assert.deepEqual(s.events, [['look'], ['compute', 'move']]);
  assert.equal(s.fairness, 'none');
  assert.equal(s.schedule.e, 'let');
});

test('the engine runs a scheduler of its own: its fields, its events and its phases', () => {
  // Agents keep their identity (without fairness, they are otherwise merged up to permutation).
  const system = new System(experiment(withScheduler(LATE)), { N: 3 }, { sortAgents: false });
  const C0 = system.initial()[0].config;
  assert.deepEqual(C0.agents.map(a => a.f.waited), [0, 0]);
  const succ = system.successors(C0);
  // Any nonempty set at first: {a0}, {a1}, {a0, a1}; each scheduled agent has looked.
  assert.deepEqual(succ.map(s => [...s.activated].sort().join()), ['0', '1', '0,1']);
  const [only0] = succ;
  assert.deepEqual(only0.config.agents.map(a => [a.phase, a.f.waited]), [[1, 0], [undefined, 1]]);
  // a1 waited: it is in every set of the next step.
  assert.ok(system.successors(only0.config).every(s => s.activated.has(1)));
});

test('a model names its scheduler, not a round', () => {
  const errs = errors(CYCLE(STAY, 'robots (Graphs.Cycle N) (Observe.radius 1) Frames.identity [otherStates] (round := .ssync)'));
  assert.ok(errs.some(e => /no parameter named round/.test(e)), errs.join('\n'));
});

test('a scheduler cuts the cycle once, in order, and needs a schedule', () => {
  const bad = (events: string) => errors(withScheduler(LATE.replace('[[.look], [.compute, .move]]', events)));
  for (const events of ['[[.compute], [.look, .move]]', '[[.look], [.move]]', '[[.look, .compute], [], [.move]]', '[[.look, .look, .compute, .move]]']) {
    assert.ok(bad(events).some(e => /events cut the cycle/.test(e)), `${events}: ${bad(events).join('\n')}`);
  }
  const missing = errors(withScheduler('def Late : Scheduler where\n  fairness := .none\n'));
  assert.ok(missing.some(e => /a scheduler needs `schedule C/.test(e)), missing.join('\n'));
});

test('only a scheduler activates agents, and C.eligible belongs to schedulers', () => {
  const component = `def Mark : Component where
  beforeLook C := { activate := C.agents }
`;
  const inHook = errors(CYCLE(`${STAY}\n${component}`,
    'robots (Graphs.Cycle N) (Observe.radius 1) Frames.identity [otherStates] (components := [Mark])'));
  assert.ok(inHook.some(e => /only a scheduler's schedule activates agents/.test(e)), inHook.join('\n'));
  const task = `task Eligible (C : Config) : Verdict := if C.eligible.isEmpty then .success else .inProgress
goal Eligible := eventually .success
`;
  const inTask = errors(CYCLE(`${STAY}\n${task}`).replace('task := Gathering', 'task := Eligible'));
  assert.ok(inTask.some(e => /eligible/.test(e)), inTask.join('\n'));
});

test('decisions are read in onCompute and beforeMove, not in other hooks', () => {
  const hooks = (hook: string) => errors(CYCLE(`${STAY}
def Count : Component where
  World := { n : Nat }
  init := { n := 0 }
  ${hook} C := { world := { C.world with n := C.agents.count fun a => (decisionOf a).decided } }
`, 'robots (Graphs.Cycle N) (Observe.radius 1) Frames.identity [otherStates] (components := [Count])'));
  assert.deepEqual(hooks('onCompute'), []);
  assert.deepEqual(hooks('beforeMove'), []);
  assert.ok(hooks('beforeLook').some(e => /decisionOf/.test(e)));
  assert.ok(hooks('afterMove').some(e => /decisionOf/.test(e)));
});
