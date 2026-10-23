import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkSetting, checkSettings } from '../src/check';
import { experimentOf } from './compile';

const exp = experimentOf(`
import "std/models.sim"
algorithm Idle uses occupied where
  main := stay
experiment batch where
  model := obliviousRobots (Graphs.Cycle N) Observe.full Frames.isomorphisms [occupied]
  algorithm := Idle
  task := Gathering
  param N : Nat in [3, 4]
  param positions : List Pos in [[pos 0], [pos 1], [pos 0, pos 1]]
  agents := positions.length
  position i := positions.at i
`, 'batch');
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
