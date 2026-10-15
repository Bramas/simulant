import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { compileSource } from '../../vite-plugin/src/index';
import { simExecution } from '../../simulator-ui/src/sim/execution';
import { checkSetting, checkSettings, type Trace } from '@bramas/simulant-engine/check';
import { Explorer } from '@bramas/simulant-engine/explorer';
import { Symmetry } from '@bramas/simulant-engine/symmetry';
import { parameterValues, System } from '@bramas/simulant-engine/system';
import type { Experiment } from '@bramas/simulant-lang/ir';

const starter = new URL('../../../projects/starter/src/main.sim', import.meta.url).pathname;
const algo1File = new URL('../../../projects/black-hole-search/sim/algo1.sim', import.meta.url).pathname;
const text = readFileSync(starter, 'utf8');
const compile = (file: string, source: string, name: string): Experiment => {
  const exp = compileSource(file, source).module.experiments[name];
  assert.ok(exp, `${name} does not compile`);
  return exp;
};
const pair = (policy: string) => compile(starter, text.replace('.initiallyPresent', policy), 'cautiousPair');

/** Replays a trace through the UI's execution adapter: the same configurations, step by step. */
function replay(exp: Experiment, trace: Trace) {
  const system = new System(exp, trace.settings);
  const execution = simExecution(system);
  trace.path.forEach((_, i) => {
    const snapshot = execution.get(trace.path.slice(0, i + 1));
    assert.equal(system.key(snapshot.config), system.key(trace.steps[i].config), `step ${i}`);
    if (i > 0) assert.equal(execution.getEdgeLabel(trace.path.slice(0, i + 1)), trace.steps[i].label);
  });
  return { system, last: execution.get(trace.path).config };
}

test('settings of a ring size share one state graph, with the verdicts of separate checks', async () => {
  const algo1 = compile(algo1File, readFileSync(algo1File, 'utf8'), 'algo1');
  const settings = [...parameterValues(algo1)];
  const shared = await checkSettings(algo1, settings);
  const separate = await checkSettings(algo1, settings, { shared: false });
  assert.deepEqual([shared.status, shared.settings, shared.graphs], ['success', 68, 8]);
  assert.deepEqual([separate.status, separate.settings, separate.graphs], ['success', 68, 68]);
  assert.ok(shared.stats.states < separate.stats.states, `${shared.stats.states} < ${separate.stats.states}`);
});

test('a failure is a path of the adapter, replayable in the UI', async () => {
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
  // Every setting, checked alone, gets the verdict a shared check gives it.
  for (const s of settings) {
    const shared = await checkSettings(exp, [s]);
    assert.equal(shared.status, (await checkSetting(exp, s)).status, JSON.stringify(s));
  }
});

test('limits make a check incomplete, and an aborted check stops', async () => {
  const exp = pair('.initiallyPresent');
  const r = await checkSetting(exp, { N: 8, site: 5 }, { maxDepth: 3 });
  assert.equal(r.status, 'incomplete');
  assert.match(r.reason, /depth limit 3/);
  const controller = new AbortController();
  controller.abort(new Error('superseded'));
  const explorer = new Explorer(new System(exp, { N: 8, site: 5 }));
  await assert.rejects(explorer.runAsync({ signal: controller.signal, slice: 0 }), /superseded/);
});
