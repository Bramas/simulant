import assert from 'node:assert/strict';
import { test } from 'node:test';
import { explore } from '@bramas/simulant-engine/explorer';
import { parameterDomainViolations, parameterValues, System } from '@bramas/simulant-engine/system';
import { lit } from '@bramas/simulant-lang/builder';
import { T } from '@bramas/simulant-lang/types';
import { blackHoleRobots } from '../../stdlib/test/helpers/index';
import { cautiousPairExperiment } from '../../stdlib/test/helpers/examples';

const present = cautiousPairExperiment(blackHoleRobots({ policy: 'initiallyPresent', size: 'unknown' }));
const emerging = cautiousPairExperiment(blackHoleRobots({ policy: 'mayEmerge', size: 'unknown' }));

test('parameters are enumerated from their domains', () => {
  const all = [...parameterValues(present)];
  assert.equal(all.length, 2 + 3 + 4 + 5); // N = 3..6, site in 1..N-1
  assert.deepEqual(all[0], { N: 3, site: 1 });
});

test('domain membership uses the current values of dependent parameters', () => {
  for (const params of parameterValues(present)) assert.deepEqual(parameterDomainViolations(present, params), []);
  assert.deepEqual(parameterDomainViolations(present, { N: 5, site: 0 }), ['site']);
  assert.deepEqual(parameterDomainViolations(present, { N: 5, site: 5 }), ['site']);
  assert.deepEqual(parameterDomainViolations(present, { N: 6, site: 5 }), []);
  // A size outside the enumeration still determines the dependent domain.
  assert.deepEqual(parameterDomainViolations(present, { N: 8, site: 7 }), ['N']);
  assert.deepEqual(parameterDomainViolations(present, { N: 8, site: 8 }), ['N', 'site']);
});

test('domain membership compares structured values and handles empty or absent domains', () => {
  const record = T.record({ left: T.nat, right: T.nat });
  const exp = {
    ...present,
    params: [...present.params,
      { name: 'positions', type: T.list(T.pos), domain: lit(T.list(T.list(T.pos)), [[0, 1], [2]]).ir },
      { name: 'pair', type: record, domain: lit(T.list(record), [{ left: 1, right: 2 }]).ir },
      { name: 'manual', type: T.nat },
    ],
  };
  const params = { N: 5, site: 1, positions: [0, 1], pair: { right: 2, left: 1 }, manual: 99 };
  assert.deepEqual(parameterDomainViolations(exp, params), []);
  assert.deepEqual(parameterDomainViolations(exp, { ...params, positions: [1, 0], pair: { left: 2, right: 1 } }), ['positions', 'pair']);
  const empty = { ...present, params: present.params.map(p => p.name === 'site' ? { ...p, domain: lit(T.list(T.pos), []).ir } : p) };
  assert.deepEqual(parameterDomainViolations(empty, params), ['site']);
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

test('a position outside the space is an error', () => {
  assert.throws(() => new System(present, { N: 5, site: 3 }).initialWith({ N: 5, site: 9 }).length, /not a vertex/);
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
