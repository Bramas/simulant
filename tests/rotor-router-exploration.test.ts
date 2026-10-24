import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkSetting } from '@bramas/simulant-engine/check';
import type { Config } from '@bramas/simulant-engine/system';
import type { SimModel } from '@bramas/simulant-ui/sim/project';
import { loadProject } from '../packages/cli/src/project-registry';
import { getPredefinedSettings, graphExamples, projects, rotorAssignments } from '../projects/public/rotor-router-exploration/src/projects';

const name = 'rotor-router-exploration-graph';
const project = projects[name];
const systemFor = (graph: number[][], initialRotors = graph.map(() => 0), start = 0) =>
  (project.setup({ graph, initialRotors, start }) as SimModel).system;

test('P21 registry admits arbitrary connected port graphs and keeps the agent memoryless', async () => {
  assert.equal(await loadProject(name), project);
  for (const preset of getPredefinedSettings(name)) assert.deepEqual(project.settingsWarnings!(preset.settings), []);
  const system = systemFor(graphExamples.tree);
  assert.deepEqual(system.exp.algorithm.mem, { k: 'unit' });
  assert.deepEqual(system.exp.algorithm.pub, { k: 'unit' });
  assert.deepEqual(system.exp.model.sensors.map(s => s.name), ['rotorHere']);
  assert.equal(system.exp.task.goal, 'eventually');
  for (const graph of [[[1], [0], [3], [2]], [[1], []], [[0]], [[1, 1], [0]], [[2], [0]]]) {
    assert.ok(project.settingsWarnings!({ graph, initialRotors: graph.map(() => 0), start: 0 }).length);
  }
  assert.ok(project.settingsWarnings!({ graph: graphExamples.path, initialRotors: [0], start: 0 }).length);
  assert.ok(project.settingsWarnings!({ graph: graphExamples.path, initialRotors: [1, 0, 0, 0, 0], start: 0 }).length);
});

test('P21 reads the old pointer then changes only the departure node, without an inport', () => {
  const system = systemFor(graphExamples.diamond, [1, 2, 0, 1]);
  const initial = system.initial()[0].config;
  assert.equal(system.decisionsOf(initial, 0)[0].decision.target, 2);
  const next = system.successors(initial)[0].config;
  assert.equal(next.agents[0].pos, 2);
  assert.deepEqual(next.world.rotors, [0, 2, 0, 1]);
  // Unseen node storage and coverage instrumentation cannot change this decision.
  const changed: Config = { ...initial, world: { ...initial.world, rotors: [1, 0, 1, 0], visited: [0, 1, 2, 3] } };
  assert.deepEqual(system.decisionsOf(changed, 0).map(d => d.decision), system.decisionsOf(initial, 0).map(d => d.decision));
  assert.equal(system.successors(next)[0].config.agents[0].pos, 0);
});

test('P21 exhausts starts and node pointers on trees, a ring and a general graph', async () => {
  let count = 0;
  for (const graph of Object.values(graphExamples)) {
    for (const initialRotors of rotorAssignments(graph)) {
      for (let start = 0; start < graph.length; start++) {
        const settings = { graph, initialRotors, start };
        assert.equal((await project.check!(settings, { maxStates: 2000 })).status, 'success');
        const system = systemFor(graph, initialRotors, start);
        assert.equal((await checkSetting(system.exp, settings, { maxStates: 2000, symmetry: false })).status, 'success');
        count++;
      }
    }
  }
  assert.equal(count, 340);
});

test('P21 arbitrary local port permutations preserve coverage; a worst-case path takes (n-1)^2 moves', async () => {
  const graph = graphExamples.tree.map((row, i) => i % 2 ? [...row].reverse() : row);
  for (const initialRotors of rotorAssignments(graph)) {
    assert.equal((await project.check!({ graph, initialRotors, start: 5 }, { maxStates: 2000 })).status, 'success');
  }
  for (let n = 2; n <= 10; n++) {
    // All interior pointers initially send the token back towards its start at n-1.
    const path = Array.from({ length: n }, (_, v) => [v + 1, v - 1].filter(w => w >= 0 && w < n));
    const system = systemFor(path, path.map(() => 0), n - 1);
    let C = system.initial()[0].config;
    let moves = 0;
    while (C.agents[0].pos !== 0 && moves <= n * n) { C = system.successors(C)[0].config; moves++; }
    assert.equal(moves, (n - 1) ** 2);
  }
});
