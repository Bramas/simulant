import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkSetting } from '@bramas/simulant-engine/check';
import { equivarianceViolations, Symmetry } from '@bramas/simulant-engine/symmetry';
import type { Config } from '@bramas/simulant-engine/system';
import type { SimModel } from '@bramas/simulant-ui/sim/project';
import { loadProject } from '../packages/cli/src/project-registry';
import { projects, getPredefinedSettings } from '../projects/public/standup-ring-gathering/src/projects';

const name = 'standup-ring-gathering-two-fsync';
const project = projects[name];
const systemFor = (N: number, offset: number) => (project.setup({ N, offset }) as SimModel).system;

test('P06 public registry and presets preserve the two-robot model contract', async () => {
  assert.equal(await loadProject(name), project);
  for (const preset of getPredefinedSettings(name)) assert.deepEqual(project.settingsWarnings!(preset.settings), []);
  const system = systemFor(10, 4);
  assert.deepEqual(system.exp.model.sensors.map(s => s.name), ['occupied']);
  assert.deepEqual(system.exp.algorithm.mem, { k: 'unit' });
  assert.deepEqual(system.exp.algorithm.pub, { k: 'unit' });
  assert.equal(system.exp.task.goal, 'eventuallyAlways');
  assert.equal(system.scheduler.events.length, 1);
  for (const settings of [{ N: 9, offset: 2 }, { N: 8, offset: 4 }, { N: 10, offset: 3 }]) {
    assert.ok(project.settingsWarnings!(settings).length, JSON.stringify(settings));
  }
});

test('P06 crashes may occur before Look at either robot; survivors approach the actual crash site', () => {
  const system = systemFor(10, 4);
  const initial = system.initial()[0].config;
  const successors = system.successors(initial);
  assert.equal(successors.length, 3, 'no crash, first crashes, second crashes');
  const live = successors.find(s => s.config.agents.every(a => !a.f.crashed))!.config;
  assert.deepEqual(live.agents.map(a => a.pos).sort(), [1, 3]);
  for (const { config: C } of successors) {
    const crashed = C.agents.filter(a => a.f.crashed);
    assert.ok(crashed.length <= 1);
    if (!crashed.length) continue;
    const site = crashed[0].pos;
    assert.ok(site === 0 || site === 4);
    const survivor = C.agents.findIndex(a => !a.f.crashed);
    const decisions = system.decisionsOf(C, survivor);
    assert.equal(decisions.length, 1);
    assert.equal(Math.abs(Number(decisions[0].decision.target) - site), 2);
    let next = C;
    for (let i = 0; i < 4; i++) next = system.successors(next)[0].config;
    assert.ok(next.agents.every(a => a.pos === site));
  }
  // Fault flags change eligibility, but not the survivor's occupancy observation.
  const normal = system.decisionsOf(initial, 1).map(d => d.decision.target);
  const faulty: Config = { ...initial, agents: initial.agents.map((a, i) => i === 0 ? { ...a, f: { ...a.f, crashed: true } } : a) };
  assert.deepEqual(system.decisionsOf(faulty, 1).map(d => d.decision.target), normal);
});

test('P06 admitted pairs converge under all crash times, and symmetry reduction agrees', async () => {
  let checked = 0;
  for (let N = 6; N <= 20; N += 2) {
    for (let offset = 2; offset < N; offset += 2) {
      if (2 * offset === N) continue;
      const settings = { N, offset };
      assert.equal((await project.check!(settings, { maxStates: 2000 })).status, 'success');
      const system = systemFor(N, offset);
      assert.equal((await checkSetting(system.exp, settings, { maxStates: 2000, symmetry: false })).status, 'success');
      checked++;
    }
  }
  assert.ok(checked > 30);
});

test('P06 gathered states stay fixed and the fault policy commutes with rotations/reflections', () => {
  const system = systemFor(10, 4);
  const initial = system.initial()[0].config;
  const gathered: Config = { ...initial, agents: initial.agents.map(a => ({ ...a, pos: 3 })) };
  assert.equal(system.verdict(gathered), 'success');
  assert.ok(system.successors(gathered).every(s => s.config.agents.every(a => a.pos === 3)));
  const symmetry = new Symmetry(system);
  assert.equal(symmetry.group.kind, 'finite');
  const group = symmetry.group.kind === 'finite' ? symmetry.group.elements : [];
  assert.deepEqual(equivarianceViolations(system, [initial, gathered], group), []);
});
