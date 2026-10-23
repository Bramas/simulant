import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compile } from '@bramas/simulant-lang/elab/elaborate';
import { nodeHost } from '@bramas/simulant-lang/elab/node';
import { Program } from '@bramas/simulant-lang/elab/program';
import type { Experiment } from '@bramas/simulant-lang/ir';
import { Explorer } from '@bramas/simulant-engine/explorer';
import { System, type Config } from '@bramas/simulant-engine/system';

const host = nodeHost();
function experiment(source: string, name = 'e'): Experiment {
  const out = compile(new Program({ ...host, read: p => p === '/mem/s.sim' ? source : host.read(p) }, '/mem/s.sim'));
  const r = out.experiments[name];
  assert.deepEqual([...out.diagnostics, ...(r?.diagnostics ?? [])].map(d => d.message), []);
  return r!.experiment!;
}

/** Two co-located agents that light the next color after the sum of the colors they see here, under `scheduler`. */
const lights = (scheduler: string) => experiment(`import "std/models.sim"
algorithm NextColor uses colors where
  init i := {}
  step mem pub := { move := here, setLight := some (((colors here).sum + 1) % 3) }
experiment e where
  model := obliviousRobots (Graphs.Cycle N) (Observe.radius 1) Frames.identity [colors] (components := [Storage.Lights 3]) (scheduler := ${scheduler})
  algorithm := NextColor
  task := Gathering
  param N : Nat
  agents := 2
  position i := pos 0
`);

/** Every agent marks that it was activated, under `scheduler` (declared in `decls` if it is not the library's). */
const marks = (scheduler: string, decls = '') => experiment(`import "std/models.sim"
${decls}
algorithm Mark where
  Pub := { activated : Bool }
  init i := { pub := { activated := false } }
  step mem pub := { move := here, pub := { pub with activated := true } }
@[equivariant]
task Everyone (C : Config) : Verdict := if C.agents.all (·.pub.activated) then .success else .inProgress
goal Everyone := eventually .success
experiment e where
  model := obliviousRobots (Graphs.Cycle N) (Observe.radius 1) Frames.identity [] (scheduler := ${scheduler})
  algorithm := Mark
  task := Everyone
  param N : Nat
  agents := 3
  position i := pos i
`);

/** The successor in which exactly the agents `S` take an event. */
function step(system: System, C: Config, ...S: number[]): Config {
  const t = system.successors(C).find(s => [...s.activated].sort().join() === S.join());
  assert.ok(t, `no successor activating ${S}`);
  return t.config;
}

test('under ASYNC a light changes at its Compute, and a Look at that instant sees the previous one', () => {
  const system = new System(lights('Schedulers.Async'), { N: 3 }, { sortAgents: false });
  const looked = step(system, system.initial()[0].config, 0);
  assert.equal(looked.agents[0].f.light, 0);
  assert.equal(looked.agents[0].pending?.setLight, 1);
  // a0 computes while a1 looks: a1 sees light 0 only.
  assert.equal(step(system, looked, 0, 1).agents[1].pending?.setLight, 1);
  // a1 looks after a0's Compute: it sees lights 0 and 1.
  const computed = step(system, looked, 0);
  assert.equal(computed.agents[0].f.light, 1);
  assert.equal(step(system, computed, 1).agents[1].pending?.setLight, 2);
});

test('LC-atomic and CM-atomic ASYNC show the light with the Look or with the Move', () => {
  const lc = new System(lights('(Schedulers.Async [[.look, .compute], [.move]])'), { N: 3 }, { sortAgents: false });
  assert.equal(step(lc, lc.initial()[0].config, 0).agents[0].f.light, 1);
  const cm = new System(lights('(Schedulers.Async [[.look], [.compute, .move]])'), { N: 3 }, { sortAgents: false });
  const looked = step(cm, cm.initial()[0].config, 0);
  assert.equal(looked.agents[0].f.light, 0);
  assert.equal(step(cm, looked, 0).agents[0].f.light, 1);
});

test('a bounded scheduler activates every agent within k steps, without a fairness assumption', () => {
  const bounded = new Explorer(new System(marks('(Schedulers.Bounded 2)'), { N: 3 }));
  assert.equal(bounded.run().status, 'success');
  assert.ok(bounded.states.every(s => s.config.agents.every(a => (a.f.waited as number) < 2)));
  // The same choices without the bound and without fairness leave an agent out forever.
  const unfair = marks('Unfair', `@[equivariant]
def Unfair : Scheduler where
  fairness := .none
  schedule C :=
    let S := choose (nonemptySubsets C.eligible)
    { activate := S }
`);
  const r = new Explorer(new System(unfair, { N: 3 })).run();
  assert.equal(r.status, 'failure');
  assert.equal(r.counterexample?.kind, 'lasso');
  // With activation fairness (SSync), the task holds again.
  assert.equal(new Explorer(new System(marks('Schedulers.SSync'), { N: 3 })).run().status, 'success');
});

test('a permutation scheduler activates every agent once per pass, in any order', () => {
  const system = new System(marks('Schedulers.Permutation'), { N: 3 }, { sortAgents: false });
  const C0 = system.initial()[0].config;
  assert.deepEqual(system.successors(C0).map(s => [...s.activated].join()), ['0', '1', '2']);
  const C1 = step(system, C0, 1);
  assert.deepEqual(system.successors(C1).map(s => [...s.activated].join()), ['0', '2']);
  const C2 = step(system, C1, 0);
  assert.deepEqual(system.successors(C2).map(s => [...s.activated].join()), ['2']);
  // A new pass: any agent again.
  assert.deepEqual(system.successors(step(system, C2, 2)).map(s => [...s.activated].join()), ['0', '1', '2']);
  assert.equal(new Explorer(new System(marks('Schedulers.Permutation'), { N: 3 })).run().status, 'success');
});

test('under ASYNC, explanations name the event and say when an earlier decision applies', () => {
  const system = new System(lights('Schedulers.Async'), { N: 3 }, { sortAgents: false });
  const C0 = system.initial()[0].config;
  const looked = system.successors(C0).find(s => [...s.activated].join() === '0')!;
  const e0 = system.explainAll(C0, looked.key)[0]!;
  assert.equal(e0.event, 'Look');
  assert.equal(e0.pending, true);
  assert.ok(e0.locations.length > 0);
  const computed = system.successors(looked.config).find(s => [...s.activated].join() === '0')!;
  const e1 = system.explainAll(looked.config, computed.key)[0]!;
  assert.deepEqual([e1.event, e1.applies, e1.pending, e1.locations.length], ['Compute', true, true, 0]);
  // With atomic cycles there is no event to name.
  const fsync = new System(lights('Schedulers.FSync'), { N: 3 });
  const C = fsync.initial()[0].config;
  assert.equal(fsync.explainAll(C, fsync.successors(C)[0].key)[0]?.event, undefined);
});
