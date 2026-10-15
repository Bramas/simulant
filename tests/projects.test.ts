import assert from 'node:assert/strict';
import { test } from 'node:test';
import { discoverProjectPackages, loadProject } from '../packages/cli/src/project-registry';
import { projects } from '../projects/black-hole-search/src/projects';

test('discovers public project registries and loads a simulation by its stable name', async () => {
  const packages = await discoverProjectPackages();
  assert.ok(packages.some(pkg => pkg.slug === 'starter'));
  assert.ok(packages.some(pkg => pkg.slug === 'black-hole-search'));
  assert.equal(await loadProject('black-hole-search-algo0'), projects['black-hole-search-algo0']);
  assert.equal(typeof (await loadProject('cautious-pair')).setup, 'function');
});

test('every black-hole-search simulation runs, and accepts the old parameter name BH_node', () => {
  for (const [name, project] of Object.entries(projects)) {
    const model = project.setup({ N: 5, site: 2 });
    const execution = project.execute(model);
    assert.ok(execution.getChildrenCount([0]) > 0, name);
    const next = execution.get([0, 0]);
    const info = project.getAlgorithmViewInfo!(next);
    assert.ok(info.agents.length > 0, name);
    assert.ok(info.agents.every(a => info.source.lines.some(l => l.number === a.line)), name);
    assert.ok(!info.source.lines.some(l => l.text.includes('@paper')), name);
    assert.ok(['success', 'failure', 'inProgress'].includes(project.executionStatusChecker!(next, model, [execution.get([0]), next])), name);
    // Shared links and saved settings of the TypeScript simulations name the hole's node `BH_node`.
    assert.deepEqual(project.setup({ N: 5, BH_node: 2 }).params, model.params, name);
    assert.deepEqual(project.normalizeSettings!({ N: 5, BH_node: 2 }), { N: 5, site: 2 }, name);
    assert.deepEqual(project.normalizeSettings!({ N: 5, site: 3, BH_node: 2 }), { N: 5, site: 3 }, name);
  }
});
