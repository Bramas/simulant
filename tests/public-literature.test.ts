import assert from 'node:assert/strict';
import { test } from 'node:test';
import { discoverProjectPackages, loadProject } from '../packages/cli/src/project-registry';
import { checkSetting } from '@bramas/simulant-engine/check';
import { System, type Config } from '@bramas/simulant-engine/system';
import type { SimModel } from '@bramas/simulant-ui/sim/project';
import { projects as gathering, getPredefinedSettings as gatheringPresets } from '../projects/public/myopic-async-gathering/src/projects';
import { projects as exploration, getPredefinedSettings as explorationPresets } from '../projects/public/myopic-luminous-exploration/src/projects';

const gather = gathering['myopic-async-gathering-phi-one'];
const explore = exploration['myopic-luminous-exploration-three-fsync'];

function setup(project: typeof gather | typeof explore, settings: Record<string, unknown> = {}) {
  return (project.setup(settings) as SimModel).system;
}

function event(system: System, C: Config, ...agents: number[]): Config {
  const next = system.successors(C).find(s => [...s.activated].sort().join() === agents.join());
  assert.ok(next, 'requested scheduler branch exists');
  return next.config;
}

test('nested public paper registries are discoverable; presets satisfy their model domains', async () => {
  const packages = await discoverProjectPackages();
  for (const [registry, presets] of [[gathering, gatheringPresets], [exploration, explorationPresets]] as const) {
    for (const [name, project] of Object.entries(registry)) {
      assert.equal(await loadProject(name), project);
      assert.ok(packages.some(p => p.registry.includes('/projects/public/') && name.startsWith(p.slug)));
      for (const preset of presets(name)) {
        assert.deepEqual(project.settingsWarnings!(preset.settings), [], preset.name);
        const system = setup(project, preset.settings);
        assert.ok(system.successors(system.initial()[0].config).length);
      }
    }
  }
});

test('P07 phi=1 guards follow the paper rule table in both orientations, including mixed-color towers', () => {
  const system = setup(gather);
  const base = system.initial()[0].config;
  const agent = base.agents[0];
  // [left colors, own color, other colors here, right colors, target offset, new color]
  const cases: [number[], number, number[], number[], number, number][] = [
    [[], 1, [], [], 0, 1],           // R0 outranks motion/recoloring
    [[], 0, [], [0], 0, 1],         // R1
    [[], 1, [], [0], 1, 2],         // R2b
    [[], 2, [], [0], 1, 1],         // R3b
    [[], 0, [1], [0], 0, 1],       // R4a
    [[], 0, [2], [0], 0, 2],       // R4b
    [[], 1, [], [2], 1, 2],         // R5
    [[], 1, [], [1, 2], 0, 1],     // R5 needs singly-blue
    [[], 1, [0], [2], 0, 1],       // moving rules need singly-red here
    [[0], 1, [], [0], 0, 1],        // interior robot is not a border
    [[], 1, [], [0, 2], 1, 2],     // R2b permits white in a mixed-color neighbor
    [[], 1, [1], [0, 0], 1, 2],    // multiplicities do not change color-set guards
  ];
  for (const [left, own, others, right, offset, nextColor] of cases) {
    for (const sign of [-1, 1]) {
      const C: Config = {
        world: base.world,
        agents: [
          { ...agent, pos: 2, f: { ...agent.f, light: own } },
          ...[...others.map(light => [2, light]), ...left.map(light => [2 - sign, light]), ...right.map(light => [2 + sign, light])]
            .map(([pos, light]) => ({ ...agent, pos, f: { ...agent.f, light } })),
        ],
      };
      const decisions = system.decisionsOf(C, 0).map(({ decision: d }) => [d.target, d.setLight ?? own]);
      assert.deepEqual(decisions, [[2 + sign * offset, nextColor]]);
    }
  }
});

test('P07 separates Look from Compute and Move, and its task detects departure after apparent gathering', () => {
  const system = setup(gather);
  const initial = system.initial()[0].config;
  const looked = event(system, initial, 0);
  assert.equal(looked.agents[0].f.light, 0);
  assert.equal(looked.agents[0].pending?.setLight, 1);
  const computed = event(system, looked, 0);
  assert.equal(computed.agents[0].f.light, 1);
  assert.equal(computed.agents[0].pos, 0);

  const together: Config = {
    world: { ...initial.world, previous: [1], settled: true },
    agents: initial.agents.map(a => ({ ...a, pos: 1 })),
  };
  together.agents[0] = { ...together.agents[0], phase: 2, pending: {
    decided: true, target: 2, pub: null, mem: null, setLight: null,
  } };
  assert.equal(system.verdict(together), 'success');
  assert.equal(system.verdict(event(system, together, 0)), 'inProgress');

  const shifted: Config = {
    world: { ...initial.world, previous: [0], settled: true },
    agents: initial.agents.map(a => ({ ...a, pos: 1 })),
  };
  const first = event(system, shifted, 0);
  assert.equal(system.verdict(first), 'inProgress', 'co-location at a different site is not stationary');
  assert.equal(system.verdict(event(system, first, 0)), 'success');
});

test('P07 exhaustive fair-ASYNC checks include equal-color towers', async () => {
  for (const positions of [[0, 1, 2], [0, 0, 1, 2], [0, 1, 1, 2]]) {
    const result = await gather.check!({ N: 5, positions }, { maxStates: 50000 });
    assert.equal(result.status, 'success', JSON.stringify(result));
  }
  assert.ok(gather.settingsWarnings!({ N: 5, positions: [0, 2, 3] }).length, 'gaps exceed radius one');
  assert.ok(gather.settingsWarnings!({ N: 6, positions: [0, 1, 2, 3] }).length, 'even span is excluded');
});

test('P03 reproduces the first two stages of the paper WWW example, including both GWG choices', () => {
  const system = setup(explore, { N: 7, initialColors: [0, 0, 0] });
  const first = system.successors(system.initial()[0].config);
  assert.equal(first.length, 1);
  const positionsAndColors = (C: Config) => C.agents.map(a => [a.pos, a.f.light]).sort((a, b) => Number(a[0]) - Number(b[0]));
  assert.deepEqual(positionsAndColors(first[0].config), [[0, 1], [1, 0], [2, 1]]);
  const next = system.successors(first[0].config).map(s => JSON.stringify(positionsAndColors(s.config))).sort();
  assert.deepEqual(next, [
    JSON.stringify([[0, 0], [3, 1], [6, 1]]),
    JSON.stringify([[2, 0], [3, 1], [6, 1]]),
  ].sort());
});

test('P03 requires rule-disabledness as well as coverage, without giving the robots extra memory', () => {
  const system = setup(explore);
  const initial = system.initial()[0].config;
  assert.equal(system.verdict({ ...initial, world: { ...initial.world, visited: [...Array(7).keys()] } }), 'inProgress');
  // Independently follow the semantic configurations to verify the instrumentation's terminal report.
  let C = initial;
  for (let i = 0; i < 12; i++) {
    if (system.verdict(C) === 'success') {
      assert.ok(C.agents.every((_a, j) => system.decisionsOf(C, j).every(d => !d.decision.ruleEnabled)));
      assert.ok(C.agents.every(a => a.mem === null && a.pub === null));
      return;
    }
    C = system.successors(C)[0].config;
  }
  assert.fail('the paper example did not reach rule-disabled coverage');
});

test('P03 checks all four designated starts for N=3..12; unreduced runs agree', async () => {
  for (let N = 3; N <= 12; N++) {
    for (const initialColors of [[0, 0, 0], [1, 0, 0], [0, 0, 1], [1, 0, 1]]) {
      const settings = { N, initialColors };
      assert.equal((await explore.check!(settings, { maxStates: 1000 })).status, 'success');
      const system = setup(explore, settings);
      assert.equal((await checkSetting(system.exp, settings, { maxStates: 5000, symmetry: false })).status, 'success');
    }
  }
});
