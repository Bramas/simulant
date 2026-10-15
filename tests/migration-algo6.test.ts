/**
 * Migration of black-hole-search-algo6 to `.sim` (plan, Phase 7). The TypeScript simulation's
 * version (with its pseudo-random idling) is compared with the old engine; the same rules
 * without the idling are checked exhaustively in synchronous rounds. (With asynchronous agents,
 * `algo6Async`, the check finds a deadlock; it takes minutes, so it is not run here:
 * `pnpm cli check-config -p ...` on a registry entry of that experiment, or see docs/development.md.)
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compile } from '@bramas/simulant-lang/elab/elaborate';
import { loadProgram } from '@bramas/simulant-lang/elab/node';
import { checkSettings } from '@bramas/simulant-engine/check';
import { parameterValues } from '@bramas/simulant-engine/system';
import { assertSameRuns, assertSameReachable } from './migration';

const out = compile(loadProgram(new URL('../projects/black-hole-search/sim/algo6.sim', import.meta.url).pathname));
const replica = out.experiments.algo6.experiment!;
const sync = out.experiments.algo6Sync.experiment!;

test('without the idling, algo6 identifies an emerging black hole on every ring of 5 to 12 nodes', async () => {
  for (const name of ['algo6', 'algo6Sync', 'algo6Async']) assert.deepEqual(out.experiments[name].diagnostics, [], name);
  const r = await checkSettings(sync, [...parameterValues(sync)]);
  assert.equal(r.status, 'success', r.reason);
  assert.equal(r.settings, 68);
});

test('with the pseudo-random idling, algo6 reaches the configurations of the old engine, pebbles included', () => {
  assertSameReachable('black-hole-search-algo6', replica, [[5, 2], [6, 0], [7, 4]], 22, { pebbles: true });
});

test('algo6 follows the recorded random executions of the old engine', () => {
  assertSameRuns('black-hole-search-algo6', 'black-hole-search-algo6', [[6, 2], [7, 0], [8, 5]], 10, 30, { pebbles: true });
});
