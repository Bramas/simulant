import assert from 'node:assert/strict';
import { test } from 'node:test';
import { explore } from '@bramas/simulant-engine/explorer';
import { parameterValues, System } from '@bramas/simulant-engine/system';
import { blackHoleRing } from '../../stdlib/test/helpers/index';
import { cautiousPairExperiment } from '../../stdlib/test/helpers/examples';

const present = cautiousPairExperiment(blackHoleRing({ policy: 'initiallyPresent', size: 'unknown' }));
const emerging = cautiousPairExperiment(blackHoleRing({ policy: 'mayEmerge', size: 'unknown' }));

test('parameters are enumerated from their domains', () => {
  const all = [...parameterValues(present)];
  assert.equal(all.length, 2 + 3 + 4 + 5); // N = 3..6, site in 1..N-1
  assert.deepEqual(all[0], { N: 3, site: 1 });
});

test('a step of the cautious pair: the leader probes, the waiter waits', () => {
  const sys = new System(present, { N: 5, site: 3 });
  const [init] = sys.initial();
  assert.equal(sys.initial().length, 1);
  const succ = sys.successors(init.config);
  assert.equal(succ.length, 1);
  const positions = succ[0].config.agents.map(a => a.pos).sort();
  assert.deepEqual(positions, [0, 1]);
});

test('with a hole present from the start, the cautious pair identifies it', () => {
  for (const params of parameterValues(present)) {
    const result = explore(new System(present, params));
    assert.equal(result.status, 'success', `${JSON.stringify(params)}: ${result.reason}`);
  }
});

test('with an emerging hole, the cautious pair fails, with a counterexample', () => {
  const result = explore(new System(emerging, { N: 5, site: 2 }));
  assert.equal(result.status, 'failure');
  assert.ok(result.counterexample);
});
