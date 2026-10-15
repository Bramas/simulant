/**
 * Migration of black-hole-search-algo1 to `.sim` (plan, Phase 4), compared with the old
 * engine (see ./migration.ts).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compile } from '@bramas/simulant-lang/elab/elaborate';
import { loadProgram } from '@bramas/simulant-lang/elab/node';
import { explore } from '@bramas/simulant-engine/explorer';
import { parameterValues, System } from '@bramas/simulant-engine/system';
import { assertSameRuns, assertSameReachable, newReachable, oldReachable } from './migration';

const out = compile(loadProgram(new URL('../projects/black-hole-search/sim/algo1.sim', import.meta.url).pathname));
const experiment = out.experiments.algo1.experiment!;

test('algo1 compiles from .sim, keeping only a program counter', () => {
  assert.deepEqual(out.experiments.algo1.diagnostics, []);
  const mem = experiment.algorithm.mem;
  assert.equal(mem.k, 'record');
  assert.deepEqual((mem as { fields: { name: string }[] }).fields.map(f => f.name), ['pc']);
});

test('algo1 identifies an emerging black hole on every ring of 5 to 12 nodes, wherever the hole is', () => {
  let count = 0;
  for (const params of parameterValues(experiment)) {
    const r = explore(new System(experiment, params));
    assert.equal(r.status, 'success', `${JSON.stringify(params)}: ${r.reason}`);
    count++;
  }
  assert.equal(count, 68);
});

test('algo1 reaches the configurations of the old engine (and exactly those, deferring unobserved activations)', () => {
  assertSameReachable('black-hole-search-algo1', experiment, [[5, 2], [6, 0], [7, 4]], 20);
  // Without deferral, the new model reaches more: the hole may activate while nobody is on it.
  assert.ok(newReachable(experiment, 5, 2, 20, false).size > oldReachable('black-hole-search-algo1', 5, 2, 20).size);
});

test('algo1 follows the recorded random executions of the old engine', () => {
  assertSameRuns('black-hole-search-algo1', 'black-hole-search-algo1', [[6, 2], [7, 0], [8, 5]]);
});
