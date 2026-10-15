/**
 * Migration of black-hole-search-algo5 to `.sim` (plan, Phase 7). The paper's algorithm is
 * checked exhaustively; the version with the TypeScript simulation's pseudo-random idling is
 * compared with the old engine (bounded exploration: its pseudo-random state never repeats).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compile } from '@bramas/simulant-lang/elab/elaborate';
import { loadProgram } from '@bramas/simulant-lang/elab/node';
import { checkSettings } from '@bramas/simulant-engine/check';
import { parameterValues } from '@bramas/simulant-engine/system';
import { assertSameRuns, assertSameReachable, claimsOf } from './migration';

const out = compile(loadProgram(new URL('../projects/black-hole-search/sim/algo5.sim', import.meta.url).pathname));
const paper = out.experiments.algo5Sync.experiment!;
const latency = out.experiments.algo5.experiment!;
const claims = claimsOf('black-hole-search-algo5');

test('algo5 identifies an emerging black hole on rings of 3 to 12 nodes, and fails on 2 nodes as before', async () => {
  for (const name of ['algo5', 'algo5Sync']) assert.deepEqual(out.experiments[name].diagnostics, [], name);
  const all = [...parameterValues(paper)];
  const r = await checkSettings(paper, all.filter(s => s.N >= 3));
  assert.equal(r.status, 'success', r.reason);
  assert.equal(r.settings, 75);
  for (const s of all.filter(s => s.N === 2)) assert.equal((await checkSettings(paper, [s])).status, 'failure');
});

test('with the pseudo-random idling, algo5 reaches the configurations of the old engine', () => {
  assertSameReachable('black-hole-search-algo5', latency, [[4, 2], [5, 0], [6, 3]], 18, claims);
});

test('with the pseudo-random idling, algo5 follows the recorded random executions of the old engine', () => {
  assertSameRuns('black-hole-search-algo5', 'black-hole-search-algo5', [[5, 2], [6, 0], [7, 4]], 10, 25, claims);
});
