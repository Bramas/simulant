/** Migration of black-hole-search-algo0 to `.sim` (plan, Phase 7), compared with the old engine. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compile } from '@bramas/simulant-lang/elab/elaborate';
import { loadProgram } from '@bramas/simulant-lang/elab/node';
import { checkSetting } from '@bramas/simulant-engine/check';
import { parameterValues } from '@bramas/simulant-engine/system';
import { assertSameRuns, assertSameReachable, claimsOf } from './migration';

const out = compile(loadProgram(new URL('../projects/black-hole-search/sim/algo0.sim', import.meta.url).pathname));
const experiment = out.experiments.algo0.experiment!;
const claims = claimsOf('black-hole-search-algo0');

test('algo0 identifies the hole only where a₄, which never claims, disappears: on the starting node', async () => {
  assert.deepEqual(out.experiments.algo0.diagnostics, []);
  for (const s of parameterValues(experiment)) {
    const r = await checkSetting(experiment, s);
    assert.equal(r.status, s.site === 0 ? 'success' : 'failure', `${JSON.stringify(s)}: ${r.reason}`);
  }
});

test('algo0 reaches the configurations of the old engine (and exactly those, deferring unobserved activations)', () => {
  assertSameReachable('black-hole-search-algo0', experiment, [[2, 0], [2, 1], [3, 1], [4, 2], [4, 3]], 24, claims);
});

test('algo0 follows the recorded random executions of the old engine', () => {
  assertSameRuns('black-hole-search-algo0', 'black-hole-search-algo0', [[2, 1], [3, 2], [4, 1]], 10, 30, claims);
});
