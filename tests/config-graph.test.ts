import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Config } from '../packages/core/src/lib/system';
import { ND_array } from '../packages/core/src/lib/non-determinism';
import { generateConfigGraph, handleGraphRequest, type WorkerRequest, type WorkerResponse } from '../packages/core/src/lib/config-graph';
import type { ProjectType, ExecutionStatus } from '../packages/core/src/types/project';

const request: WorkerRequest = {
  type: 'generate', projectName: 'counter', settings: null, maxDepth: 5,
  horizontalSpacing: 150, verticalSpacing: 180,
};

function counterProject(status: (round: number) => ExecutionStatus, branching = false) {
  let setupCount = 0;
  let updateCount = 0;
  const project: ProjectType<Config<any, any, any, any, any, number>> = {
    setup: () => {
      setupCount++;
      const initial = new Config<any, any, any, any, any, number>();
      initial.setState(0, 0);
      return {
        Agents: [], InitialConfig: initial, View: () => { throw new Error('No agents'); },
        Update: config => {
          updateCount++;
          const round = config.get(0).state ?? 0;
          const next = config.clone();
          next.setState(0, round + 1);
          if (!branching) return next;
          const other = config.clone();
          other.setState(0, round + 2);
          return new ND_array([next, other]);
        },
      };
    },
    executionStatusChecker: (config, model, history) => {
      assert.equal(history.at(-1), config);
      assert.equal(history[0], model.InitialConfig);
      return status(config.get(0).state ?? 0);
    },
    debugConfig: config => String(config.get(0).state),
  };
  return { project, counts: () => ({ setupCount, updateCount }) };
}

test('sets up one model and never expands terminal configurations', () => {
  const { project, counts } = counterProject(round => round >= 3 ? 'success' : 'inProgress');
  const result = generateConfigGraph({ counter: project }, request);
  assert.deepEqual(result.nodes?.map(node => node.path), [[0], [0, 0], [0, 0, 0], [0, 0, 0, 0]]);
  assert.deepEqual(result.nodes?.map(node => node.childrenCount), [1, 1, 1, 0]);
  assert.equal(result.stats?.successNodes, 1);
  assert.deepEqual(counts(), { setupCount: 1, updateCount: 3 });
});

test('does not compute successors at the depth limit', () => {
  const { project, counts } = counterProject(() => 'inProgress');
  const result = generateConfigGraph({ counter: project }, { ...request, maxDepth: 0 });
  assert.equal(result.stats?.totalNodes, 1);
  assert.equal(result.nodes?.[0].status, 'inProgress');
  assert.deepEqual(counts(), { setupCount: 1, updateCount: 0 });
});

test('stops repeated states without relabeling them as success', () => {
  const { project, counts } = counterProject(() => 'inProgress');
  project.debugConfig = () => 'same-state';
  const result = generateConfigGraph({ counter: project }, request);
  assert.equal(result.stats?.totalNodes, 2);
  assert.equal(result.stats?.successNodes, 0);
  assert.equal(result.stats?.inProgressNodes, 2);
  assert.deepEqual(counts(), { setupCount: 1, updateCount: 1 });
});

test('visits siblings in breadth-first order and stops on failure', () => {
  const { project, counts } = counterProject(round => round === 2 ? 'failure' : 'inProgress', true);
  const result = generateConfigGraph({ counter: project }, request);
  assert.deepEqual(result.nodes?.map(node => node.path), [[0], [0, 0], [0, 1]]);
  assert.equal(result.stats?.failureNodes, 1);
  assert.deepEqual(counts(), { setupCount: 1, updateCount: 2 });
});

test('reports progress snapshots and keeps exploring without a debug formatter', () => {
  const { project } = counterProject(() => 'inProgress');
  delete project.debugConfig;
  const progress: WorkerResponse[] = [];
  const result = generateConfigGraph({ counter: project }, { ...request, maxDepth: 51 }, response => progress.push(response));
  assert.equal(progress.length, 1);
  assert.equal(progress[0].nodes?.length, 50);
  assert.equal(progress[0].stats?.totalNodes, 50);
  assert.equal(result.stats?.totalNodes, 52);
});

test('worker handler returns errors for invalid requests', () => {
  const responses: WorkerResponse[] = [];
  handleGraphRequest({}, request, response => responses.push(response));
  assert.equal(responses[0].type, 'error');
  assert.match(responses[0].error!, /Unknown project/);
  const { project } = counterProject(() => 'inProgress');
  assert.throws(() => generateConfigGraph({ counter: project }, { ...request, maxDepth: -1 }), /Maximum depth/);
});
