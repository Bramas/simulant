import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkSetting, checkSettings, type Trace } from '@bramas/simulant-engine/check';
import { Explorer } from '@bramas/simulant-engine/explorer';
import { Symmetry } from '@bramas/simulant-engine/symmetry';
import { parameterValues, System } from '@bramas/simulant-engine/system';
import type { Experiment } from '@bramas/simulant-lang/ir';
import { experimentOf } from './compile';

const pair = (policy: string) => experimentOf(`import "std/examples.sim"
experiment e where
  model := blackHoleSearch (Graphs.Cycle N) ${policy} .unknown
  algorithm := CautiousPair
  task := IdentifyBlackHole
  param N : Nat in (range 7).filter (· ≥ 3)
  param site : Pos in ((range N).filter (· ≥ 1)).map pos
  agents := 2
  position i := pos 0
`, 'e');

/** Replays a trace's path (an initial index, then successor indices), checking each configuration and label. */
function replay(exp: Experiment, trace: Trace) {
  const system = new System(exp, trace.settings);
  let config = system.initial()[trace.path[0]].config;
  assert.equal(system.key(config), system.key(trace.steps[0].config), 'step 0');
  for (let i = 1; i < trace.path.length; i++) {
    const next = system.successors(config)[trace.path[i]];
    assert.equal(next.key, system.key(trace.steps[i].config), `step ${i}`);
    assert.equal(next.witness.map(c => c.label).join('; '), trace.steps[i].label);
    config = next.config;
  }
  return { system, last: config };
}

test('settings of the same instantiated model share one state graph, with the verdicts of separate checks', async () => {
  const exp = pair('.initiallyPresent');
  const settings = [...parameterValues(exp)];
  const shared = await checkSettings(exp, settings);
  const separate = await checkSettings(exp, settings, { shared: false });
  // One graph per cycle size: the site is an initial value.
  assert.deepEqual([shared.status, shared.settings, shared.graphs], ['success', 14, 4]);
  assert.deepEqual([separate.status, separate.settings, separate.graphs], ['success', 14, 14]);
  assert.ok(shared.stats.states < separate.stats.states, `${shared.stats.states} < ${separate.stats.states}`);
});

test('settings that differ by a model argument do not share a graph', async () => {
  const exp = experimentOf(`import "std/models.sim"
algorithm Idle uses occupied where
  main := stay
experiment e where
  model := obliviousRobots Graphs.Line (Observe.radius phi) Frames.isomorphisms [occupied]
  algorithm := Idle
  task := Gathering
  param phi : Nat in [1, 2]
  param positions : List Int in [[0, 0], [3, 3]]
  agents := positions.length
  position i := pos (positions.at i)
`, 'e');
  // The radius is a model argument; the positions are initial values.
  const r = await checkSettings(exp, [...parameterValues(exp)]);
  assert.deepEqual([r.status, r.settings, r.graphs], ['success', 4, 2]);
});

test('a failure is a path that replays', async () => {
  const exp = pair('.mayEmerge');
  const r = await checkSetting(exp, { N: 5, site: 2 });
  assert.equal(r.status, 'failure');
  assert.equal(r.trace?.kind, 'failure');
  const { system, last } = replay(exp, r.trace!);
  assert.equal(system.verdict(last), 'failure');
  assert.ok(r.trace!.steps.some(s => s.label.includes('activates')));
});

test('a lasso returns to the configuration it repeats, up to the symmetry group', async () => {
  const exp = pair('.none');
  const r = await checkSetting(exp, { N: 5, site: 2 });
  assert.equal(r.status, 'failure');
  const trace = r.trace!;
  assert.equal(trace.kind, 'lasso');
  assert.ok(trace.cycleStart !== undefined && trace.cycleStart < trace.path.length - 1);
  const { system, last } = replay(exp, trace);
  const symmetry = new Symmetry(system);
  assert.equal(symmetry.canonical(last).key, symmetry.canonical(trace.steps[trace.cycleStart!].config).key);
});

test('a shared check reports the failing setting, and its path replays with that setting', async () => {
  const exp = pair('.mayEmerge');
  const settings = [...parameterValues(exp)];
  const r = await checkSettings(exp, settings);
  assert.equal(r.status, 'failure');
  const alone = await checkSetting(exp, r.trace!.settings);
  assert.equal(alone.status, 'failure');
  replay(exp, r.trace!);
  for (const s of settings) {
    const shared = await checkSettings(exp, [s]);
    assert.equal(shared.status, (await checkSetting(exp, s)).status, JSON.stringify(s));
  }
});

test('limits make a check incomplete, and an aborted check stops', async () => {
  const exp = pair('.initiallyPresent');
  const r = await checkSetting(exp, { N: 6, site: 5 }, { maxDepth: 3 });
  assert.equal(r.status, 'incomplete');
  assert.match(r.reason, /depth limit 3/);
  const controller = new AbortController();
  controller.abort(new Error('superseded'));
  const explorer = new Explorer(new System(exp, { N: 6, site: 5 }));
  await assert.rejects(explorer.runAsync({ signal: controller.signal, slice: 0 }), /superseded/);
});
