/** Migration of black-hole-search-algo2 to `.sim` (plan, Phase 7), compared with the old engine. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compile } from '@bramas/simulant-lang/elab/elaborate';
import { loadProgram } from '@bramas/simulant-lang/elab/node';
import { checkSettings } from '@bramas/simulant-engine/check';
import { parameterValues } from '@bramas/simulant-engine/system';
import { assertSameRuns, assertSameReachable } from './migration';

const out = compile(loadProgram(new URL('../projects/black-hole-search/sim/algo2.sim', import.meta.url).pathname));
const experiment = out.experiments.algo2.experiment!;

test('algo2 identifies an emerging black hole on every ring of 5 to 12 nodes, wherever the hole is', async () => {
  assert.deepEqual(out.experiments.algo2.diagnostics, []);
  const r = await checkSettings(experiment, [...parameterValues(experiment)]);
  assert.equal(r.status, 'success', r.reason);
  assert.equal(r.settings, 68);
});

test('algo2 reaches the configurations of the old engine, pebbles included', () => {
  assertSameReachable('black-hole-search-algo2', experiment, [[5, 2], [6, 0], [7, 4], [8, 7]], 24, { pebbles: true });
});

test('algo2 follows the recorded random executions of the old engine', () => {
  assertSameRuns('black-hole-search-algo2', 'black-hole-search-algo2', [[6, 2], [7, 0], [8, 5]], 10, 25, { pebbles: true });
});
