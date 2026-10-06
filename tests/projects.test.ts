import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { discoverProjectPackages, loadProject } from '../packages/cli/src/project-registry';
import { execute } from '../packages/core/src/lib/system';
import { projects } from '../projects/black-hole-search/src/projects';

test('discovers public project registries and loads a simulation by its stable name', async () => {
  const packages = await discoverProjectPackages();
  assert.ok(packages.some(pkg => pkg.slug === 'example'));
  assert.ok(packages.some(pkg => pkg.slug === 'black-hole-search'));
  assert.equal(await loadProject('black-hole-search-algo0'), projects['black-hole-search-algo0']);
  assert.equal(typeof (await loadProject('moving-on-a-ring')).setup, 'function');
});

test('published algorithm subpaths still export runnable simulations after the source move', async () => {
  const manifest = JSON.parse(await readFile(new URL('../projects/black-hole-search/package.json', import.meta.url), 'utf8'));
  for (let index = 0; index <= 6; index++) {
    const module = await import(new URL(`../projects/black-hole-search/${manifest.exports[`./algo${index}`]}`, import.meta.url).href);
    const model = module.setup({ N: 5, BH_node: 2 });
    const execution = execute(model);
    assert.equal(execution.get([0]), model.InitialConfig);
    assert.ok(execution.getChildrenCount([0]) > 0);
    const next = execution.get([0, 0]);
    assert.ok(next.agents().length > 0);
    // Reading algorithm highlights must not replay agent histories by cloning.
    next.clone_agents = () => { throw new Error('Unexpected clone during rendering'); };
    const info = module.getAlgorithmViewInfo(next);
    assert.ok(Array.isArray(info.agentStates));
    assert.ok(info.agentStates.length > 0);
    assert.ok(['success', 'failure', 'inProgress'].includes(module.executionStatusChecker(next, model, [model.InitialConfig, next])));
  }
});
