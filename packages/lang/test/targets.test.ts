import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { test } from 'node:test';
import { compileFile } from './compile';

const root = new URL('../../../', import.meta.url).pathname;
const targets = new URL('../../../docs/phase0-target/', import.meta.url).pathname;

/** The Phase 0 target sources (docs/phase0-target/), entry modules only, as `.sim` paths. */
function entries(): string[] {
  const out: string[] = [];
  for (const dir of ['starter', 'black-hole-search', 'standup-gathering', 'star']) {
    for (const f of readdirSync(targets + dir).sort()) {
      if (f.endsWith('.sim-design') && f !== 'model.sim-design') out.push(`${targets}${dir}/${f.replace(/-design$/, '')}`);
    }
  }
  return out;
}

test('every Phase 0 target source and the library examples compile without diagnostics', () => {
  const found: Record<string, string[]> = {};
  for (const file of [`${root}packages/stdlib/sim/examples.sim`, ...entries()]) {
    const out = compileFile(file);
    const diagnostics = [...out.diagnostics, ...Object.values(out.experiments).flatMap(r => r.diagnostics)];
    assert.deepEqual(diagnostics.map(d => `${d.span?.file}:${d.span?.start.line} ${d.message}`), [], file);
    found[file.slice(root.length)] = Object.keys(out.experiments);
  }
  assert.deepEqual(found, {
    'packages/stdlib/sim/examples.sim': ['cautiousPair', 'cautiousPairCrash'],
    'docs/phase0-target/starter/main.sim': ['cautiousPair'],
    'docs/phase0-target/black-hole-search/algo0.sim': ['algo0'],
    'docs/phase0-target/black-hole-search/algo1.sim': ['algo1'],
    'docs/phase0-target/black-hole-search/algo2.sim': ['algo2'],
    'docs/phase0-target/black-hole-search/algo3.sim': ['algo3'],
    'docs/phase0-target/black-hole-search/algo4.sim': ['algo4'],
    'docs/phase0-target/black-hole-search/algo5.sim': ['algo5Sync', 'algo5'],
    'docs/phase0-target/black-hole-search/algo6.sim': ['algo6', 'algo6Sync', 'algo6Async'],
    'docs/phase0-target/standup-gathering/h-plus-one.sim': ['hPlusOne'],
    'docs/phase0-target/standup-gathering/h-plus-three.sim': ['hPlusThree'],
    'docs/phase0-target/standup-gathering/two-colors.sim': ['twoColors'],
    'docs/phase0-target/star/witnesses.sim': ['starGathering', 'starDispersion'],
  });
});

test('the target models compose the declared spaces, observations and frames', () => {
  const model = (file: string, name: string) => compileFile(targets + file).experiments[name].experiment!.model;
  const bh = model('starter/main.sim', 'cautiousPair');
  assert.equal(bh.space.kind === 'graph' && bh.space.name, 'Graphs.Cycle');
  assert.deepEqual(bh.space.kind === 'graph' && bh.space.args, { n: { e: 'param', name: 'N' } });
  assert.deepEqual(bh.observation, { kind: 'radius', r: { e: 'lit', type: { k: 'nat' }, value: 1 } });
  assert.deepEqual(bh.frames, { kind: 'identity' });
  assert.deepEqual(bh.sensors.map(s => [s.name, s.perLocation]), [['otherStates', false]]);

  const line = model('standup-gathering/two-colors.sim', 'twoColors');
  assert.equal(line.space.kind === 'graph' && line.space.vertex.k, 'int');
  assert.equal(line.space.kind === 'graph' && line.space.vertices, undefined);
  assert.deepEqual(line.observation, { kind: 'radius', r: { e: 'param', name: 'phi' } });
  assert.deepEqual(line.frames, { kind: 'isomorphisms' });
  assert.deepEqual(line.components.map(c => c.name), ['Lights', 'CrashAt']);
  assert.deepEqual(line.components[0].agent, [{ name: 'light', type: { k: 'nat' } }]);

  assert.equal(model('black-hole-search/algo6.sim', 'algo6Async').round, 'ssync');
});
