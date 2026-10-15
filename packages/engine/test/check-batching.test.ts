import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compileSource } from '../../vite-plugin/src/index';
import { simProject } from '../../simulator-ui/src/sim/project';
import { checkSetting, checkSettings } from '../src/check';

const module = compileSource('/tmp/check-batching.sim', `
import "std/models.sim"
import "std/tasks.sim"
algorithm Idle uses ringPresence where
  main := stay
experiment batch where
  model := obliviousRing
  algorithm := Idle
  task := Gathering
  param N : Nat := [3, 4]
  param positions : List Node := [[node 0], [node 1], [node 0, node 1]]
  agents := positions.length
  position i := positions.at i
`).module;
assert.deepEqual(module.diagnostics, []);
const exp = module.experiments.batch;
const success = { N: 3, positions: [0] };
const failure = { N: 3, positions: [0, 1] };

test('a configuration limit closes the settings iterator without requesting another setting', async () => {
  let closed = false;
  function* settings() {
    try {
      yield success;
      yield success;
      throw new Error('enumerated beyond the requested limit');
    } finally { closed = true; }
  }
  const r = await checkSettings(exp, settings(), { maxConfigs: 2 });
  assert.equal(r.status, 'success');
  assert.equal(r.settings, 2);
  assert.equal(r.graphs, 1);
  assert.equal(closed, true);
});

test('a zero configuration limit does not start enumeration', async () => {
  function* settings() { throw new Error('enumerated an empty prefix'); yield success; }
  const r = await checkSettings(exp, settings(), { maxConfigs: 0 });
  assert.equal(r.settings, 0);
  assert.equal(r.graphs, 0);
});

test('the adapter passes the prefix limit to the checker for both batch modes', async () => {
  const project = simProject(module, 'batch');
  for (const perSetting of [false, true]) {
    const prefix = await project.checkAll!({ maxConfigs: 2, perSetting });
    assert.equal(prefix.status, 'success');
    assert.equal(prefix.settings, 2);
    assert.equal(prefix.graphs, perSetting ? 2 : 1);
    const extended = await project.checkAll!({ maxConfigs: 3, perSetting });
    assert.equal(extended.status, 'failure');
    assert.deepEqual(extended.trace!.settings, failure);
  }
});

test('shared and separate graphs retain the first failing origin after duplicate initial states', async () => {
  for (const shared of [false, true]) {
    const r = await checkSettings(exp, [success, { N: 3, positions: [1] }, failure], { shared });
    assert.equal(r.status, 'failure');
    assert.deepEqual(r.trace!.settings, failure);
    assert.equal(r.trace!.kind, 'lasso');
    assert.equal((await checkSetting(exp, r.trace!.settings)).status, 'failure');
  }
});

test('large per-setting batches do not exceed the JavaScript argument limit', async () => {
  const r = await checkSettings(exp, Array(150000).fill(failure), { shared: false });
  assert.equal(r.status, 'failure');
  assert.equal(r.settings, 150000);
  assert.equal(r.graphs, 1);
});
