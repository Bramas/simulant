import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Instant, SchedulerRuntime } from '@bramas/simulant-engine/scheduler';
import { Explorer } from '@bramas/simulant-engine/explorer';
import { equivarianceViolations, Symmetry } from '@bramas/simulant-engine/symmetry';
import { System, type Config } from '@bramas/simulant-engine/system';
import {
  agents, algorithm, component, decisionOf, effect, experiment, frames, here, lit, neighbors, pos, radius, rec, sense, type X,
} from '@bramas/simulant-lang/builder';
import { T } from '@bramas/simulant-lang/types';
import { Observe } from '../../stdlib/test/helpers/examples';
import { Cycle, robots } from '../../stdlib/test/helpers/models';
import { otherStates } from '../../stdlib/test/helpers/sensors';

/** Agents publish that they looked, record whether they saw an agent that had, and move clockwise. */
const Publish = algorithm({
  name: 'Publish',
  uses: ['otherStates'],
  pub: T.record({ looked: T.bool, sawLooked: T.bool }),
  init: { pub: () => rec({ looked: false, sawLooked: false }) },
  step: () => ({ move: neighbors(here()).at(0), pub: rec({ looked: true, sawLooked: sense('otherStates').any((s: X) => s.looked) }) }),
});

/** Counts the decisions each hook point sees. */
const Tally = component({
  name: 'Tally',
  world: { computes: T.nat, moves: T.nat },
  init: { world: { computes: lit(T.nat, 0), moves: lit(T.nat, 0) } },
  onCompute: C => effect({ world: { computes: C.world.computes.add(agents(C).count(a => decisionOf(a).decided)) } }),
  beforeMove: C => effect({ world: { moves: C.world.moves.add(agents(C).count(a => decisionOf(a).decided)) } }),
  equivariant: true,
});

const exp = experiment({
  name: 'publish',
  model: robots({ space: Cycle(), observation: radius(1), frames: frames.identity, sensors: [otherStates], components: [Tally] }),
  algorithm: Publish, task: Observe,
  params: [{ name: 'N', type: T.nat }], agents: { count: 2, pos: () => pos(0) },
});

/** Any nonempty set of agents takes its next event, with the given cut of the cycle. */
const scheduler = (events: Instant[][]): SchedulerRuntime => ({
  events, fairness: 'activation', anonymous: false,
  schedule: (_C, eligible, w, k) => {
    const sets = eligible.length === 2 ? [[0], [1], [0, 1]] : eligible.map(i => [i]);
    sets.forEach((S, index) => { w.push({ site: 'activation', index, label: `activates ${S}` }); k(S); w.pop(); });
  },
});

const ASYNC: Instant[][] = [['look'], ['compute'], ['move']];

/** The successor of `C` in which exactly the agents `S` take an event. */
function step(system: System, C: Config, ...S: number[]): Config {
  const t = system.successors(C).find(s => [...s.activated].sort().join() === S.join());
  assert.ok(t, `no successor activating ${S}`);
  return t.config;
}

test('under ASYNC a decision waits for its Compute and its Move', () => {
  const system = new System(exp, { N: 3 }, { scheduler: scheduler(ASYNC) });
  const C0 = system.initial()[0].config;
  const C1 = step(system, C0, 0);
  const a0 = C1.agents[0];
  assert.equal(a0.phase, 1);
  assert.equal(a0.pending?.pub.looked, true);
  assert.equal(a0.pub.looked, false, 'the public state changes at Compute, not at Look');
  assert.notEqual(system.key(C1), system.key(C0), 'the phase and the pending decision are part of the state');
  assert.deepEqual(C1.world, { computes: 0, moves: 0 });

  const C2 = step(system, C1, 0);
  assert.equal(C2.agents[0].phase, 2);
  assert.equal(C2.agents[0].pub.looked, true);
  assert.equal(C2.agents[0].pos, 0, 'the position changes at Move');
  assert.deepEqual(C2.world, { computes: 1, moves: 0 });

  const C3 = step(system, C2, 0);
  assert.equal(C3.agents[0].pos, 1);
  assert.equal(C3.agents[0].phase, undefined);
  assert.equal(C3.agents[0].pending, undefined);
  assert.deepEqual(C3.world, { computes: 1, moves: 1 });
});

test('a Look sees the configuration from before the Computes of the same step', () => {
  const system = new System(exp, { N: 3 }, { scheduler: scheduler(ASYNC) });
  const C1 = step(system, system.initial()[0].config, 0);
  // a0 computes while a1 looks: a1 still sees a0 before its Compute.
  const same = step(system, C1, 0, 1);
  assert.equal(same.agents[1].pending?.pub.sawLooked, false);
  // After a0's Compute, a1's Look sees it.
  const after = step(system, step(system, C1, 0), 1);
  assert.equal(after.agents[1].pending?.pub.sawLooked, true);
});

test('LC-atomic and CM-atomic cuts apply the state with the Look or with the Move', () => {
  const lc = new System(exp, { N: 3 }, { scheduler: scheduler([['look', 'compute'], ['move']]) });
  const L = step(lc, lc.initial()[0].config, 0);
  assert.equal(L.agents[0].pub.looked, true);
  assert.equal(L.agents[0].pos, 0);
  assert.equal(L.agents[0].phase, 1);
  assert.equal(step(lc, L, 0).agents[0].pos, 1);

  const cm = new System(exp, { N: 3 }, { scheduler: scheduler([['look'], ['compute', 'move']]) });
  const M = step(cm, cm.initial()[0].config, 0);
  assert.equal(M.agents[0].pub.looked, false);
  const done = step(cm, M, 0);
  assert.equal(done.agents[0].pub.looked, true);
  assert.equal(done.agents[0].pos, 1);
  assert.deepEqual(done.world, { computes: 1, moves: 1 });
});

test('atomic cycles keep configurations without phases', () => {
  const system = new System(exp, { N: 3 }, { scheduler: scheduler([['look', 'compute', 'move']]) });
  const C = step(system, system.initial()[0].config, 0, 1);
  assert.ok(C.agents.every(a => a.phase === undefined && a.pending === undefined));
  assert.deepEqual(C.world, { computes: 2, moves: 2 });
});

test('symmetry reduction maps pending decisions', () => {
  const system = new System(exp, { N: 4 }, { scheduler: scheduler(ASYNC) });
  const reduced = new Explorer(system, { maxDepth: 6 });
  const full = new Explorer(new System(exp, { N: 4 }, { scheduler: scheduler(ASYNC) }), { maxDepth: 6, symmetry: false });
  assert.equal(reduced.run().status, full.run().status);
  assert.ok(reduced.states.length <= full.states.length);
  const symmetry = new Symmetry(system);
  assert.equal(symmetry.group.kind, 'finite');
  const group = symmetry.group.kind === 'finite' ? symmetry.group.elements : [];
  assert.ok(group.length > 1);
  const pending = full.states.map(s => s.config).filter(C => C.agents.some(a => a.phase)).slice(0, 40);
  assert.ok(pending.length > 0);
  assert.deepEqual(equivarianceViolations(system, pending, group), []);
});
