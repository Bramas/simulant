import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { ProjectUpdate } from '../../core/src/types/project';
import { generateConfigGraph } from '../../core/src/lib/config-graph';
import { compileSource } from '../../vite-plugin/src/index';
import { defineRenderer } from '../src/renderers/define';
import { simProject, type SimSources } from '../src/sim/project';

const file = new URL('../../../projects/black-hole-search/sim/algo1.sim', import.meta.url).pathname;
const original = readFileSync(file, 'utf8');

/** A module whose recompilations the test triggers, as the plugin's `subscribe` does. */
function hotModule(source: string) {
  const listeners = new Set<(m: SimSources) => void>();
  const compile = (text: string) => ({ ...compileSource(file, text).module, subscribe: (l: (m: SimSources) => void) => { listeners.add(l); return () => listeners.delete(l); } });
  return { module: compile(source), save: (text: string) => { for (const l of listeners) l(compile(text)); } };
}

function record(project: ReturnType<typeof simProject>) {
  const updates: ProjectUpdate[] = [];
  project.subscribe!(u => updates.push(u));
  return updates;
}

test('a semantic edit replaces the experiment and keeps the settings that still fit', () => {
  const hot = hotModule(original);
  const project = simProject(hot.module, 'algo1');
  const updates = record(project);
  const before = project.revision!();
  assert.deepEqual(project.settingsWarnings!({ N: 10, site: 3 }), []);
  // A new parameter domain bound changes the experiment.
  hot.save(original.replace('(range 13).filter (· ≥ 5)', '(range 9).filter (· ≥ 5)'));
  assert.equal(updates.length, 1);
  const u = updates[0];
  assert.equal(u.kind, 'replaced');
  if (u.kind !== 'replaced') return;
  assert.notEqual(u.revision, before);
  assert.equal(project.revision!(), u.revision);
  assert.deepEqual(u.adjust({ N: 7, site: 3 }), { settings: { N: 7, site: 3 }, notes: [] });
  assert.deepEqual(u.adjust({ N: -1, site: 3, old: 1 }), { settings: { N: 5, site: 3 }, notes: ['N reset from -1 to 5', 'parameter old no longer exists'] });
  assert.deepEqual(u.adjust(null), { settings: null, notes: [] });
  assert.equal([...project.settingsGenerator()].length, 5 + 6 + 7 + 8);
  assert.deepEqual(project.settingsWarnings!({ N: 10, site: 3 }), ['N = 10 is outside its declared parameter domain.']);
});

test('an edit that only moves lines redraws, and the algorithm view follows', () => {
  const hot = hotModule(original);
  const project = simProject(hot.module, 'algo1');
  const updates = record(project);
  const model = project.setup({ N: 5, site: 2 });
  const snapshot = project.execute!(model).get([0, 0]);
  const lines = () => project.getAlgorithmViewInfo!(snapshot)!.agents.map(s => s.line);
  assert.deepEqual(lines(), [32, 32, 35, 35]);
  hot.save(original.replace('import "std/models.sim"', '-- a comment\nimport "std/models.sim"'));
  assert.deepEqual(updates.map(u => u.kind), ['redraw']);
  // The configuration comes from the running system (old line table); the view shows the new lines.
  assert.ok(project.getAlgorithmViewInfo!(snapshot)!.source.lines.some(l => l.number === 33 && l.text.trim() === 'move Ring.cw'));
  assert.deepEqual(lines(), [33, 33, 36, 36]);
  // The model view follows too.
  assert.equal(project.describe!().sources.find(s => s.kind === 'experiment')!.lines[0].number, 39);
});

test('an edit that does not compile keeps the last good experiment, and a fix recovers', () => {
  const hot = hotModule(original);
  const project = simProject(hot.module, 'algo1');
  const updates = record(project);
  hot.save(original.replace('move Ring.cw', 'move Ring.clockwise'));
  assert.equal(updates[0].kind, 'failed');
  if (updates[0].kind !== 'failed') return;
  assert.match(updates[0].diagnostics[0], /algo1\.sim:\d+:\d+: /);
  // The last good experiment still runs.
  const model = project.setup({ N: 5, site: 2 });
  assert.equal(project.execute!(model).getChildrenCount([0]), 2);
  hot.save(original);
  assert.deepEqual(updates.map(u => u.kind), ['failed', 'redraw']);
});

test('a module that fails on first load reports its diagnostics at setup, and recovers', () => {
  const hot = hotModule(original.replace('move Ring.cw', 'move Ring.clockwise'));
  const project = simProject(hot.module, 'algo1');
  const updates = record(project);
  assert.throws(() => project.setup(null), /algo1\.sim:\d+:\d+: /);
  assert.deepEqual(project.editorSchema, { fields: [] });
  hot.save(original);
  assert.deepEqual(updates.map(u => u.kind), ['replaced']);
  assert.equal(project.setup(null).params.N, 5);
});

test('a renderer redefinition redraws through the same function', () => {
  const first = defineRenderer('test-renderer', () => undefined);
  const project = simProject(hotModule(original).module, 'algo1', { draw: first });
  const updates = record(project);
  let drawn = '';
  const second = defineRenderer('test-renderer', () => { drawn = 'second'; });
  assert.equal(second, first);
  assert.deepEqual(updates.map(u => u.kind), ['redraw']);
  const model = project.setup({ N: 5, site: 2 });
  const ctx = { save() {}, restore() {} } as unknown as CanvasRenderingContext2D;
  project.drawConfig!(ctx, project.execute!(model).get([0]), model, {});
  assert.equal(drawn, 'second');
});

test('a graph worker refuses a request for another revision', () => {
  const project = simProject(hotModule(original).module, 'algo1');
  const request = { type: 'generate' as const, projectName: 'p', settings: { N: 5, site: 2 }, maxDepth: 2, horizontalSpacing: 0, verticalSpacing: 0 };
  assert.equal(generateConfigGraph({ p: project }, { ...request, revision: project.revision!() }).revision, project.revision!());
  assert.throws(() => generateConfigGraph({ p: project }, { ...request, revision: 'older' }), /generate the graph again/);
});
