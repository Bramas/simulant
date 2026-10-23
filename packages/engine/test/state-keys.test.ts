import assert from 'node:assert/strict';
import { test } from 'node:test';
import { explore } from '@bramas/simulant-engine/explorer';
import { System, type Config } from '@bramas/simulant-engine/system';
import { experimentOf, libraryExperiments } from './compile';

test('distinct agent fields keep both branches and their safety counterexample', () => {
  const exp = libraryExperiments('conformance.sim').agentFields;
  const system = new System(exp, { N: 3 });
  const initial = system.initial()[0].config;
  const successors = system.successors(initial);
  assert.deepEqual(successors.map(s => s.config.agents[0].f), [{ x: 1, y: 23 }, { x: 12, y: 3 }]);
  assert.notEqual(successors[0].key, successors[1].key);
  const result = explore(system);
  assert.equal(result.status, 'failure');
  assert.equal(result.counterexample?.kind, 'failure');
  assert.equal(result.counterexample?.steps.at(-1)?.config.agents[0].f.x, 12);
});

test('multi-digit ports keep different frames and decisions distinct', () => {
  const exp = experimentOf(`import "std/models.sim"
algorithm PortOne where
  init i := {}
  step mem pub := { move := port 1 }
experiment e where
  model := obliviousRobots (Graphs.Star 12) (Observe.radius 1) (Frames.portPermutations .perRobot) []
    (symmetries := .none)
  algorithm := PortOne
  task := Gathering
  agents := 1
  position i := pos 0
`, 'e');
  const system = new System(exp, {});
  // Choose two valid frames directly, without enumerating all 12! initial permutations.
  const config = (frame: number[]): Config => ({
    agents: [{ pos: 0, frame, f: {}, pub: null, mem: null }], world: {},
  });
  const a = config([0, 1, 11, 10, 2, 3, 4, 5, 6, 7, 8, 9]);
  const b = config([0, 11, 1, 10, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.notEqual(system.key(a), system.key(b));
  assert.equal(system.decisionsOf(a, 0)[0].decision.target, 2);
  assert.equal(system.decisionsOf(b, 0)[0].decision.target, 12);
});
