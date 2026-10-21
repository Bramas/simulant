/** Checks through the adapter: the limits it passes on, and traces replayed by its execution. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { checkSetting } from '@bramas/simulant-engine/check';
import { System } from '@bramas/simulant-engine/system';
import { compileSource } from '../../vite-plugin/src/index';
import { simExecution } from '../src/sim/execution';
import { simProject } from '../src/sim/project';

const module = compileSource('/tmp/adapter-checks.sim', `
import "std/models.sim"
algorithm Idle uses occupied where
  main := stay
experiment batch where
  model := robots (Graphs.Cycle N) Observe.full Frames.isomorphisms [occupied]
  algorithm := Idle
  task := Gathering
  param N : Nat in [3, 4]
  param positions : List Pos in [[pos 0], [pos 1], [pos 0, pos 1]]
  agents := positions.length
  position i := positions.at i
`).module;

test('the adapter passes the prefix limit to the checker for both batch modes', async () => {
  assert.deepEqual(module.diagnostics, []);
  const project = simProject(module, 'batch');
  for (const perSetting of [false, true]) {
    const prefix = await project.checkAll!({ maxConfigs: 2, perSetting });
    assert.equal(prefix.status, 'success');
    assert.equal(prefix.settings, 2);
    assert.equal(prefix.graphs, perSetting ? 2 : 1);
    const extended = await project.checkAll!({ maxConfigs: 3, perSetting });
    assert.equal(extended.status, 'failure');
    assert.deepEqual(extended.trace!.settings, { N: 3, positions: [0, 1] });
  }
});

test('a counterexample replays through the execution the simulator shows', async () => {
  const starter = new URL('../../../projects/starter/src/main.sim', import.meta.url).pathname;
  const exp = compileSource(starter, readFileSync(starter, 'utf8').replace('.initiallyPresent', '.mayEmerge')).module.experiments.cautiousPair;
  const r = await checkSetting(exp, { N: 5, site: 2 });
  assert.equal(r.status, 'failure');
  const trace = r.trace!;
  const system = new System(exp, trace.settings);
  const execution = simExecution(system);
  trace.path.forEach((_, i) => {
    const snapshot = execution.get(trace.path.slice(0, i + 1));
    assert.equal(system.key(snapshot.config), system.key(trace.steps[i].config), `step ${i}`);
    if (i > 0) assert.equal(execution.getEdgeLabel(trace.path.slice(0, i + 1)), trace.steps[i].label);
  });
  assert.equal(system.verdict(execution.get(trace.path).config), 'failure');
});
