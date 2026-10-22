import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { test } from 'node:test';
import { compileFile } from './compile';

const root = new URL('../../../', import.meta.url).pathname;

/** The public projects' entry modules (a module imported by the others, such as model.sim, is not one). */
function entries(): string[] {
  const out = [`${root}projects/starter/src/main.sim`];
  for (const dir of ['black-hole-search/sim', 'standup-gathering/sim']) {
    for (const f of readdirSync(`${root}projects/${dir}`).sort()) if (f.endsWith('.sim') && f !== 'model.sim') out.push(`${root}projects/${dir}/${f}`);
  }
  return out;
}

test('every public project and the library examples compile without diagnostics', () => {
  const found: Record<string, string[]> = {};
  for (const file of [`${root}packages/stdlib/sim/examples.sim`, `${root}packages/stdlib/sim/conformance.sim`, ...entries()]) {
    const out = compileFile(file);
    const diagnostics = [...out.diagnostics, ...Object.values(out.experiments).flatMap(r => r.diagnostics)];
    assert.deepEqual(diagnostics.map(d => `${d.span?.file}:${d.span?.start.line} ${d.message}`), [], file);
    found[file.slice(root.length)] = Object.keys(out.experiments);
  }
  assert.deepEqual(found, {
    'packages/stdlib/sim/examples.sim': ['cautiousPair', 'cautiousPairCrash'],
    'packages/stdlib/sim/conformance.sim': [
      'blackHoleEmerging', 'blackHoleCrashStop', 'blackHoleLossy', 'pebbles', 'gatheringRobots', 'dynamicRing', 'ownOrientation',
      'portPermutations', 'ssync', 'sequential', 'parameterAcceptance', 'lights', 'starGathering', 'starDispersion',
    ],
    'projects/starter/src/main.sim': ['cautiousPair'],
    'projects/black-hole-search/sim/algo0.sim': ['algo0'],
    'projects/black-hole-search/sim/algo1.sim': ['algo1'],
    'projects/black-hole-search/sim/algo2.sim': ['algo2'],
    'projects/black-hole-search/sim/algo3.sim': ['algo3'],
    'projects/black-hole-search/sim/algo4.sim': ['algo4'],
    'projects/black-hole-search/sim/algo5.sim': ['algo5Sync', 'algo5'],
    'projects/black-hole-search/sim/algo6.sim': ['algo6', 'algo6Sync', 'algo6Async'],
    'projects/standup-gathering/sim/h-plus-one.sim': ['hPlusOne'],
    'projects/standup-gathering/sim/h-plus-three.sim': ['hPlusThree'],
    'projects/standup-gathering/sim/two-colors.sim': ['twoColors'],
  });
});

test('the project models compose the declared spaces, observations and frames', () => {
  const model = (file: string, name: string) => compileFile(`${root}projects/${file}`).experiments[name].experiment!.model;
  const bh = model('starter/src/main.sim', 'cautiousPair');
  assert.equal(bh.space.kind === 'graph' && bh.space.name, 'Graphs.Cycle');
  assert.deepEqual(bh.space.kind === 'graph' && bh.space.args, { n: { e: 'param', name: 'N' } });
  assert.deepEqual(bh.observation, { kind: 'radius', r: { e: 'lit', type: { k: 'nat' }, value: 1 } });
  assert.deepEqual(bh.frames, { kind: 'identity' });
  assert.deepEqual(bh.sensors.map(s => [s.name, s.perLocation]), [['otherStates', false]]);

  const line = model('standup-gathering/sim/two-colors.sim', 'twoColors');
  assert.equal(line.space.kind === 'graph' && line.space.vertex.k, 'int');
  assert.equal(line.space.kind === 'graph' && line.space.vertices, undefined);
  assert.deepEqual(line.observation, { kind: 'radius', r: { e: 'param', name: 'phi' } });
  assert.deepEqual(line.frames, { kind: 'isomorphisms' });
  assert.deepEqual(line.components.map(c => c.name), ['Lights', 'CrashAt']);
  assert.deepEqual(line.components[0].agent, [{ name: 'light', type: { k: 'nat' } }]);

  assert.equal(model('black-hole-search/sim/algo6.sim', 'algo6Async').round, 'ssync');
});
