import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { conformanceGraph, type ConformanceFixture } from '@bramas/simulant-engine/conformance';

const dir = new URL('../conformance/', import.meta.url);

for (const file of readdirSync(dir).filter(f => f.endsWith('.json'))) {
  test(`conformance: ${file}`, () => {
    const fixture: ConformanceFixture = JSON.parse(readFileSync(new URL(file, dir), 'utf8'));
    // The experiment is read back from JSON: the IR is self-contained data.
    const actual = conformanceGraph(fixture.name, fixture.experiment, fixture.params, fixture.maxStates);
    assert.deepEqual(JSON.parse(JSON.stringify(actual)), fixture);
  });
}

// The fixtures come from the `.sim` experiments; the builder's versions give the same graphs,
// so the builder's standard library and the `.sim` one agree.
test('conformance: the builder versions of the experiments give the same graphs', async () => {
  const { builderExperiments } = await import('./builder-experiments');
  for (const [file, experiment] of Object.entries(builderExperiments)) {
    const fixture: ConformanceFixture = JSON.parse(readFileSync(new URL(`${file}.json`, dir), 'utf8'));
    const g = conformanceGraph(fixture.name, experiment, fixture.params, fixture.maxStates);
    assert.deepEqual(JSON.parse(JSON.stringify(g.states)), fixture.states, file);
    assert.deepEqual(JSON.parse(JSON.stringify(g.edges)), fixture.edges, file);
  }
});
