import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkSetting } from '@bramas/simulant-engine/check';
import { parameterDomainViolations, definition } from '@bramas/simulant-engine/system';
import { equivarianceViolations, Symmetry } from '@bramas/simulant-engine/symmetry';
import type { SimModel } from '@bramas/simulant-ui/sim/project';
import { loadProject } from '../packages/cli/src/project-registry';
import { projects, getPredefinedSettings } from '../projects/public/synthesized-ring-gathering/src/projects';

const primary = projects['synthesized-ring-gathering-three-fsync'];
const literal = projects['synthesized-ring-gathering-literal-final-paragraph'];
const setup = (N: number, positions: number[], project = primary) => (project.setup({ N, positions }) as SimModel).system;

test('P04 registries, presets and periodicity domains keep the two source readings explicit', async () => {
  for (const [name, project] of Object.entries(projects)) {
    assert.equal(await loadProject(name), project);
    for (const preset of getPredefinedSettings(name)) assert.deepEqual(project.settingsWarnings!(preset.settings), []);
  }
  const system = setup(6, [0, 1, 3]);
  assert.deepEqual(system.exp.model.sensors.map(s => s.name), ['count']);
  assert.deepEqual(system.exp.algorithm.mem, { k: 'unit' });
  assert.equal(system.exp.task.goal, 'eventuallyAlways');
  assert.deepEqual(parameterDomainViolations(system.exp, { N: 6, positions: [0, 2, 4] }), ['positions']);
  assert.deepEqual(parameterDomainViolations(system.exp, { N: 6, positions: [0, 0, 1] }), []);
  const admitted = definition(system.exp, 'admittedTriple');
  assert.equal(admitted(6, [1, 3, 5]), false, 'rotation of a periodic triple');
  assert.equal(admitted(7, [0, 0, 0]), true, 'already gathered configurations are admitted');
});

test('P04 movement fixtures follow tower, symmetric and rigid cases from section 4', () => {
  const cases: [number, number[], number, number[]][] = [
    [7, [0, 0, 2], 2, [1]],          // isolated robot approaches the tower
    [4, [0, 0, 2], 2, [1, 3]],       // preceding strategy's disoriented-tower move
    [6, [0, 1, 2], 0, [1]],          // view (0,0,3)
    [6, [0, 1, 2], 1, [1]],          // symmetric robot with larger middle gap stays
    [7, [0, 3, 4], 0, [1, 6]],       // view (2,0,2)
    [6, [0, 1, 3], 0, [1]],          // view (0,1,2)
    [6, [0, 2, 3], 0, [1]],          // view (1,0,2)
    [6, [0, 1, 3], 2, [2]],          // mirrored rigid case
  ];
  for (const [N, positions, i, targets] of cases) {
    const system = setup(N, positions);
    const C = system.initial()[0].config;
    assert.deepEqual(system.decisionsOf(C, i).map(d => Number(d.decision.target)).sort((a, b) => a - b), targets);
  }
});

test('P04 strategy converges on all registered triples through N=12; unreduced exploration agrees', async () => {
  let checked = 0;
  for (let N = 4; N <= 12; N++) {
    for (let b = 0; b < N; b++) {
      for (let c = b; c < N; c++) {
        if (b > 0 && 3 * b === N && c === 2 * b) continue;
        const settings = { N, positions: [0, b, c] };
        assert.equal((await primary.check!(settings, { maxStates: 5000 })).status, 'success', JSON.stringify(settings));
        const system = setup(N, settings.positions);
        assert.equal((await checkSetting(system.exp, settings, { maxStates: 5000, symmetry: false })).status, 'success', JSON.stringify(settings));
        checked++;
      }
    }
  }
  assert.equal(checked, 351);
});

test('P04 literal final paragraph retains a replayable disoriented-tower lasso', async () => {
  const settings = { N: 4, positions: [0, 0, 2] };
  const result = await literal.check!(settings);
  assert.equal(result.status, 'failure');
  assert.equal(result.trace?.kind, 'lasso');
  assert.deepEqual(result.trace?.path, [0, 0]);
  const system = setup(4, settings.positions, literal);
  const C = system.initial()[0].config;
  assert.equal(system.successors(C).length, 1);
  assert.equal(system.successors(C)[0].key, system.key(C));
  assert.equal((await primary.check!(settings)).status, 'success', 'earlier strategy bullet supplies the omitted move');
});

test('P04 local cycle adapter commutes with rotations/reflections and gathered states stay fixed', () => {
  for (const [N, positions] of [[7, [0, 1, 3]], [4, [0, 0, 2]], [8, [0, 3, 5]]] as [number, number[]][]) {
    const system = setup(N, positions);
    const C = system.initial()[0].config;
    const symmetry = new Symmetry(system);
    assert.equal(symmetry.group.kind, 'finite');
    const group = symmetry.group.kind === 'finite' ? symmetry.group.elements : [];
    assert.deepEqual(equivarianceViolations(system, [C], group), []);
  }
  const system = setup(7, [2, 2, 2]);
  const C = system.initial()[0].config;
  assert.equal(system.verdict(C), 'success');
  assert.ok(system.successors(C).every(s => s.config.agents.every(a => a.pos === 2)));
});
