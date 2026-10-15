/**
 * The skeleton acceptance test of plan Phase 1: one model of each reference
 * family, built from shared library components, run by the engine.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  agents, algorithm, experiment, ite, lit, model, move, node, ofFn, offset, param, range, sensor, size, subsets, unit,
} from '@bramas/simulant-lang/builder';
import type { Algorithm, Experiment, Model, Task } from '@bramas/simulant-lang/ir';
import { T } from '@bramas/simulant-lang/types';
import { Explorer, explore, type Result } from '@bramas/simulant-engine/explorer';
import { equivarianceViolations, Symmetry } from '@bramas/simulant-engine/symmetry';
import { parameterValues, System } from '@bramas/simulant-engine/system';
import {
  blackHoleRing, DynamicRing, dynamicRingBH, dynamicRingRobots, Exploration, Faults, Gathering, gatheringWithCrash, Hazards,
  Monitors, obliviousRing, otherStatesLossy, Ring, ringCount, Storage,
} from '../../stdlib/test/helpers/index';
import {
  AlwaysClockwise, cautiousPairExperiment, EveryoneActivated, MarkActivated, NearestNeighbour, Observe, PebbleTest,
} from '../../stdlib/test/helpers/examples';

const labels = (r: Result) => (r.counterexample?.steps ?? []).flatMap(s => s.witness.map(w => w.label));

/** Robots at `param positions` (every set of at least one node), rings of size 3 to `maxN`. */
function robots(m: Model, algorithm: Algorithm, task: Task, maxN = 5): Experiment {
  return experiment({
    name: `${algorithm.name} on ${m.name}`, model: m, algorithm, task,
    params: [
      { name: 'N', type: T.nat, domain: range(maxN + 1).filter(n => n.ge(3)) },
      { name: 'positions', type: T.list(T.node), domain: subsets(range(param('N')).map(n => node(n))).filter(s => s.length().ge(1)) },
      { name: 'crashNode', type: T.node, domain: lit(T.list(T.node), [0]) },
    ],
    agents: { count: param('positions').length(), pos: i => param('positions').at(i) },
  });
}

function checkAll(exp: Experiment, opts = {}) {
  return [...parameterValues(exp)].map(params => ({ params, result: explore(new System(exp, params), opts) }));
}

describe('black-hole search: local view, persistent memory, common chirality', () => {
  test('a hole present from the start is identified by the cautious pair', () => {
    for (const { params, result } of checkAll(cautiousPairExperiment(blackHoleRing({ policy: 'initiallyPresent', size: 'unknown' })))) {
      assert.equal(result.status, 'success', JSON.stringify(params));
    }
  });

  test('an emerging hole defeats it, and the hole activates in the counterexample', () => {
    const result = explore(new System(cautiousPairExperiment(blackHoleRing({ policy: 'mayEmerge', size: 'unknown' })), { N: 5, site: 2 }));
    assert.equal(result.status, 'failure');
    assert.ok(labels(result).includes('activates'));
  });

  test('a hole that never activates is a repeatable cycle that fails "eventually always success"', () => {
    // Without the hole ever appearing, the waiter never declares it: a lasso on which the task never succeeds.
    const result = explore(new System(cautiousPairExperiment(blackHoleRing({ policy: 'none', size: 'unknown' })), { N: 5, site: 2 }));
    assert.equal(result.status, 'failure');
    assert.equal(result.counterexample?.kind, 'lasso');
  });

  test('crash-stop with no budget is the fault-free model; with a budget of 1 it defeats the pair', () => {
    const base = cautiousPairExperiment(blackHoleRing({ policy: 'initiallyPresent', size: 'unknown' }));
    const none = cautiousPairExperiment(blackHoleRing({ policy: 'initiallyPresent', size: 'unknown', extra: [Faults.CrashStop(0)] }));
    const one = cautiousPairExperiment(blackHoleRing({ policy: 'initiallyPresent', size: 'unknown', extra: [Faults.CrashStop(1)] }));
    const params = { N: 5, site: 3 };
    const r0 = explore(new System(base, params));
    const r1 = explore(new System(none, params));
    assert.equal(r1.status, r0.status);
    assert.equal(r1.stats.states, r0.stats.states);
    const r2 = explore(new System(one, params));
    assert.equal(r2.status, 'failure');
    assert.ok(labels(r2).some(l => l.startsWith('crash')));
  });

  test('a lossy view with k = 0 is the exact view; with k = 1 the waiter can miss the leader', () => {
    const exact = cautiousPairExperiment(blackHoleRing({ policy: 'initiallyPresent', size: 'unknown' }));
    const lossy0 = cautiousPairExperiment(blackHoleRing({ policy: 'initiallyPresent', size: 'unknown', view: otherStatesLossy(0) }));
    const lossy1 = cautiousPairExperiment(blackHoleRing({ policy: 'initiallyPresent', size: 'unknown', view: otherStatesLossy(1) }));
    const params = { N: 5, site: 3 };
    assert.equal(explore(new System(lossy0, params)).stats.states, explore(new System(exact, params)).stats.states);
    const r = explore(new System(lossy1, params));
    assert.equal(r.status, 'failure');
    assert.ok(labels(r).some(l => l.includes('hides')));
  });

  test('knowing the ring size adds a sensor and changes nothing for an algorithm that does not use it', () => {
    const unknown = cautiousPairExperiment(blackHoleRing({ policy: 'initiallyPresent', size: 'unknown' }));
    const known = cautiousPairExperiment(blackHoleRing({ policy: 'initiallyPresent', size: 'known' }));
    assert.equal(explore(new System(known, { N: 6, site: 4 })).stats.states, explore(new System(unknown, { N: 6, site: 4 })).stats.states);
  });

  test('pebbles: an action read in beforeMove; two agents cannot pick up the same pebble', () => {
    const m = blackHoleRing({ policy: 'none', size: 'unknown', extra: [Storage.Pebbles()] });
    const exp = experiment({
      name: 'pebbles', model: m, algorithm: PebbleTest, task: Observe,
      params: [{ name: 'N', type: T.nat }, { name: 'site', type: T.node }],
      agents: { count: 2, pos: () => node(0) },
    });
    const sys = new System(exp, { N: 4, site: 2 });
    const [C0] = sys.initial().map(s => s.config);
    const [C1] = sys.successors(C0).map(s => s.config);
    assert.deepEqual(C1.world.pebbles, [0]);
    const [C2] = sys.successors(C1).map(s => s.config);
    assert.deepEqual(C2.world.pebbles, []);
  });
});

describe('oblivious robots: full-ring presence, dynamic reflection, crash at a node', () => {
  const exp = robots(gatheringWithCrash(), NearestNeighbour, Gathering);

  test('the model is oblivious and the derived group has rotations and reflections', () => {
    const sys = new System(exp, { N: 5, positions: [0, 2], crashNode: 0 });
    assert.equal(new Symmetry(sys).group.length, 10);
  });

  test('two robots at distance two gather; robots at the crash node may crash', () => {
    const r = explore(new System(exp, { N: 5, positions: [0, 2], crashNode: 0 }));
    assert.equal(r.status, 'success', r.reason);
    const sys = new System(exp, { N: 5, positions: [0, 1], crashNode: 0 });
    const witnesses = sys.successors(sys.initial()[0].config).flatMap(s => s.witness.map(w => w.label));
    assert.ok(witnesses.some(l => l.startsWith('crash')), witnesses.join(', '));
  });

  test('symmetry reduction gives the same verdicts as the unreduced graph', () => {
    for (const params of parameterValues(exp)) {
      const a = explore(new System(exp, params));
      const b = explore(new System(exp, params), { symmetry: false });
      assert.equal(a.status, b.status, JSON.stringify(params));
    }
  });

  test('symmetry reduction merges the rotated configurations of an instance', () => {
    // Robots that keep moving clockwise only visit rotations of their initial configuration.
    const rotating = robots(obliviousRing({ sensor: ringCount, frame: { kind: 'common' } }), AlwaysClockwise, Gathering);
    const params = { N: 5, positions: [0, 2], crashNode: 0 };
    const a = explore(new System(rotating, params));
    const b = explore(new System(rotating, params), { symmetry: false });
    assert.equal(a.status, b.status);
    assert.equal(a.stats.group, 5); // rotations only: common chirality
    assert.deepEqual([a.stats.states, b.stats.states], [1, 5]);
  });

  test('the library pieces pass the bounded equivariance test', () => {
    for (const params of [{ N: 5, positions: [0, 1, 3], crashNode: 0 }, { N: 6, positions: [0, 2, 3], crashNode: 2 }]) {
      const sys = new System(exp, params);
      const explorer = new Explorer(sys, { symmetry: false });
      explorer.run();
      const configs = explorer.states.map(s => s.config).slice(0, 30);
      assert.deepEqual(equivarianceViolations(sys, configs, sys.topo.automorphisms()), []);
    }
  });

  test('a wrong equivariance claim is caught by the bounded test', () => {
    // A view in the global orientation, wrongly claimed reflection-equivariant.
    const globalView = sensor('ringPresence', T.list(T.bool), ({ C, me }) =>
      ofFn(size(C), i => agents(C).any(b => b.pos.eq(offset(me.pos, lit(T.frame, false), i)))), { rotations: true, reflections: true });
    const followCw = algorithm({
      name: 'FollowCw', uses: ['ringPresence'], pub: T.unit, init: { pub: () => unit() },
      step: ({ view }) => ({ move: ite(view.ringPresence.at(1), move('cw'), move('stay')) }),
    });
    const bad = robots(obliviousRing({ sensor: globalView }), followCw, Gathering);
    const sys = new System(bad, { N: 5, positions: [0, 1], crashNode: 0 });
    assert.equal(new Symmetry(sys).group.length, 10); // the claim is believed...
    assert.notDeepEqual(equivarianceViolations(sys, sys.initial().map(s => s.config), new Symmetry(sys).group), []); // ...and refuted
  });
});

describe('robots on a dynamic ring: the adversary removes an edge each round', () => {
  const m = dynamicRingRobots([Monitors.Visited()]);

  test('a robot that always moves clockwise explores a static ring but not a dynamic one', () => {
    const staticExp = robots(obliviousRing({ sensor: m.sensors[0], frame: { kind: 'common' }, components: [Monitors.Visited()] }), AlwaysClockwise, Exploration);
    assert.equal(explore(new System(staticExp, { N: 4, positions: [0], crashNode: 0 })).status, 'success');
    const dyn = robots(m, AlwaysClockwise, Exploration);
    const r = explore(new System(dyn, { N: 4, positions: [0], crashNode: 0 }));
    assert.equal(r.status, 'failure');
    assert.equal(r.counterexample?.kind, 'lasso');
    assert.ok(labels(r).some(l => l.startsWith('missing')), labels(r).join(', '));
  });

  test('the topology state is not kept: successors that differ only by the missing edge merge', () => {
    const sys = new System(robots(m, AlwaysClockwise, Exploration), { N: 4, positions: [0, 2], crashNode: 0 });
    // 5 topology states (no edge missing, or one of 4), but the two robots either move or not.
    assert.equal(sys.successors(sys.initial()[0].config).length, 3);
  });
});

describe('the black-hole ring over a dynamic ring', () => {
  test('reuses the black-hole component unchanged', () => {
    const dyn = dynamicRingBH();
    const stat = blackHoleRing({ policy: 'mayEmerge', size: 'unknown' });
    assert.deepEqual(dyn.components, stat.components);
    assert.deepEqual(dyn.components[0], Hazards.BlackHole('mayEmerge'));
    assert.deepEqual(dyn.topology, DynamicRing(1));
    assert.deepEqual(stat.topology, Ring());
  });

  test('runs, with missing edges in its witnesses', () => {
    const r = explore(new System(cautiousPairExperiment(dynamicRingBH()), { N: 4, site: 2 }));
    assert.equal(r.status, 'failure');
    const sys = new System(cautiousPairExperiment(dynamicRingBH()), { N: 4, site: 2 });
    const witnesses = sys.successors(sys.initial()[0].config).flatMap(s => s.witness.map(w => w.label));
    assert.ok(witnesses.some(l => l.startsWith('missing')), witnesses.join(', '));
  });
});

describe('executions: synchronous rounds check every cycle, SSYNC only scheduler-fair ones', () => {
  const ring = (round: 'fsync' | 'ssync') => model({ name: round, topology: Ring(), sensors: [], round });
  const exp = (round: 'fsync' | 'ssync') => experiment({
    name: `mark ${round}`, model: ring(round), algorithm: MarkActivated, task: EveryoneActivated,
    params: [{ name: 'N', type: T.nat }], agents: { count: 2, pos: i => node(i) },
  });

  test('a repeatable cycle that violates the task fails under FSYNC', () => {
    // Two robots that always move clockwise never gather: a lasso, although nothing forces the cycle.
    const m = obliviousRing({ sensor: ringCount, frame: { kind: 'common' } });
    const r = explore(new System(robots(m, AlwaysClockwise, Gathering), { N: 4, positions: [0, 2], crashNode: 0 }));
    assert.equal(r.status, 'failure');
    assert.equal(r.counterexample?.kind, 'lasso');
  });

  test('under SSYNC, never activating an agent is a cycle, but not a fair one', () => {
    const fsync = explore(new System(exp('fsync'), { N: 3 }));
    assert.equal(fsync.status, 'success');
    const explorer = new Explorer(new System(exp('ssync'), { N: 3 }));
    const r = explorer.run();
    assert.equal(r.status, 'success', r.reason);
    // The unfair cycle exists: a state where only agent 0 was activated, with a self-loop.
    const unfair = explorer.states.find(s => s.config.agents[0].pub.activated && !s.config.agents[1].pub.activated);
    assert.ok(unfair?.succ?.includes(unfair.id));
  });
});

