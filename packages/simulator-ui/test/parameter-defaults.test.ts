import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compileSource } from '../../vite-plugin/src/index';
import { simProject, type SimSources } from '../src/sim/project';
import type { ProjectUpdate } from '../../core/src/types/project';

const source = `
import "std/models.sim"
algorithm Idle where
  main := stay
experiment domains where
  model := robots (Graphs.Cycle N) (Observe.radius 1) Frames.identity [occupied]
  algorithm := Idle
  task := Gathering
  param N : Nat where N ≥ 3
  param site : Nat where site ≥ 1 ∧ site < N
  agents := 2
  position i := pos 0
`;
const file = new URL('../../../parameter-defaults.sim', import.meta.url).pathname;
const compile = (text = source) => {
  const module = compileSource(file, text).module;
  assert.deepEqual(module.diagnostics, []);
  return module;
};

test('predicate-only defaults populate both the form and execution without finite model samples', () => {
  const project = simProject(compile(), 'domains');
  assert.deepEqual(project.editorSchema!.fields.map(f => [f.key, f.defaultValue]), [['N', 3], ['site', 1]]);
  assert.deepEqual(project.setup(null).params, { N: 3, site: 1 });
  assert.deepEqual(project.settingsWarnings!(null), []);
  assert.throws(() => [...project.settingsGenerator!()], /no finite domain.*checkSettings/);
});

test('project defaults and finite check settings are separate from the model domains and each other', async () => {
  const module = compile();
  const before = JSON.stringify(module.experiments.domains);
  const project = simProject(module, 'domains', {
    defaults: { N: '8', site: '2' },
    checkSettings: () => [{ N: '4', site: '1' }, { N: 2, site: 1 }, { N: 6, site: 3 }],
  });
  assert.deepEqual(project.editorSchema!.fields.map(f => [f.key, f.defaultValue]), [['N', 8], ['site', 2]]);
  assert.deepEqual(project.setup(null).params, { N: 8, site: 2 });
  assert.deepEqual([...project.settingsGenerator!()], [{ N: 4, site: 1 }, { N: 6, site: 3 }]);
  assert.equal((await project.checkAll!()).settings, 2);
  const checked = project.describe!().sections.flatMap(s => s.facts).find(f => f.label === 'Settings checked')!;
  assert.equal(checked.value, '2');
  assert.match(checked.note!, /project.ts/);
  assert.equal(JSON.stringify(module.experiments.domains), before);
  assert.deepEqual(project.settingsWarnings!({ N: 100, site: 20 }), []);
});

test('typed fallback values and out-of-domain project defaults still produce advisory warnings', () => {
  const hard = simProject(compile(source.replace('N ≥ 3', 'N ≥ 10000')), 'domains');
  assert.deepEqual(hard.editorSchema!.fields.map(f => f.defaultValue), [0, 0]);
  const outside = simProject(compile(), 'domains', { defaults: { N: 2, site: 1 } });
  assert.match(outside.settingsWarnings!(null).join(' '), /N = 2.*outside/);
  assert.deepEqual(outside.setup(null).params, { N: 2, site: 1 });
  const missing = simProject(compile(), 'domains', { checkSettings: () => [{ N: 4 }] });
  assert.throws(() => [...missing.settingsGenerator!()], /missing parameter site/);
});

test('source updates use project defaults when adding parameters', () => {
  const listeners = new Set<(module: SimSources) => void>();
  const module = { ...compile(), subscribe: (listener: (next: SimSources) => void) => { listeners.add(listener); return () => listeners.delete(listener); } };
  const project = simProject(module, 'domains', { defaults: { N: 8, site: 2, extra: 9 } });
  const updates: ProjectUpdate[] = [];
  project.subscribe!(u => updates.push(u));
  for (const listener of listeners) listener(compile(source.replace('  agents :=', '  param extra : Nat where extra ≥ 5\n  agents :=')));
  const update = updates[0];
  assert.equal(update.kind, 'replaced');
  if (update.kind !== 'replaced') return;
  assert.deepEqual(update.adjust({ N: 8, site: 2 }), { settings: { N: 8, site: 2, extra: 9 }, notes: ['new parameter extra = 9'] });
  assert.equal(project.editorSchema!.fields.find(f => f.key === 'extra')!.defaultValue, 9);
});
