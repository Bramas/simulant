import assert from 'node:assert/strict';
import { test } from 'node:test';
import { projects, getPredefinedSettings } from '../projects/standup-gathering/src/projects';
import { Compiler } from '@bramas/simulant-engine/compile';
import type { SimModel } from '@bramas/simulant-ui/sim/project';
import { parameterDomainViolations, runDet } from '@bramas/simulant-engine/system';
import type { Config } from '@bramas/simulant-engine/system';
import { loadProject } from '../packages/cli/src/project-registry';

const colorProject = projects['standup-gathering-two-colors'];

test('the public line projects expose only model settings and every preset records gathering', async () => {
  for (const [name, project] of Object.entries(projects)) {
    assert.equal(await loadProject(name), project);
    assert.equal(project.experiment!().ir && project.describe!().lean && 'error' in project.describe!().lean!, false);
    assert.deepEqual(project.editorSchema.fields.map(f => f.key), ['positions', 'phi']);
    for (const preset of getPredefinedSettings(name)) {
      const model: SimModel = project.setup(preset.settings);
      assert.deepEqual(Object.keys(model.params).sort(), ['N', 'phi', 'positions']);
      assert.deepEqual(project.settingsWarnings!(preset.settings), [], preset.name);
      assert.equal(typeof preset.settings.positions, 'string');
      assert.ok(preset.path);
      const last = project.execute(model).get(preset.path);
      assert.equal(project.verdict!(last, model).verdict, 'success', `${name}: ${preset.name}`);
    }
  }
});

test('all algorithms satisfy permanent SUIG with crashes chosen at any single location', async () => {
  for (const [name, project] of Object.entries(projects)) {
    for (const positions of [[0, 2, 4], [0, 0, 1, 2]]) {
      const result = await project.check!({ positions }, { maxStates: 5000 });
      assert.equal(result.status, 'success', `${name}, ${positions}: ${result.reason}`);
      const graph = project.stateGraph!({ positions }, { maxStates: 5000 });
      for (const state of graph.states) {
        const sites = new Set(state.config.agents.filter((a: any) => !a.correct).map((a: any) => a.pos));
        assert.ok(sites.size <= 1, 'every crash in the execution occurs at the same location');
      }
    }
    const model: SimModel = project.setup({ positions: [0, 2, 4] });
    const successors = model.system.successors(model.system.initial()[0].config);
    const sites = new Set(successors.flatMap(s => s.config.agents.filter(a => a.f.crashed).map(a => a.pos)));
    assert.deepEqual([...sites].sort((a, b) => a - b), [0, 2, 4].map(p => p + Number(model.params.phi) + 1));
  }
});

test('two-color execution reproduces both fault-free examples from the paper', () => {
  const examples = [
    ['X.XX.X..XX.X....XX', '.XXX.X..XX.X....Z', '..ZX.X..XX.X...Z', '...X.X..XX.X..Z', '....XX..XX.X.Z', '.....Z..XX.XZ', '......Z.XX.X', '.......ZXXX', '........XZ', '........Z'],
    ['X.X.X...X....XX', '.XX.X...X....Z', '..Z.X...X...Z', '...ZX...X..Z', '....X...X.Z', '.....X..XZ', '......X.X', '.......X'],
  ];
  for (const rows of examples) {
    const positions = [...rows[0]].flatMap((c, i) => c === 'X' ? [i] : []);
    const model = colorProject.setup({ positions, phi: 5 });
    const execution = colorProject.execute(model);
    const path = [0];
    for (const row of rows) {
      const snapshot = execution.get(path);
      const actual = Array.from({ length: rows[0].length }, (_, i) => {
        const colors = new Set(snapshot.agents.filter((a: any) => a.pos === model.params.phi + 1 + i)
          .map((a: any) => snapshot.world.lights[a.fields.slot]));
        return colors.size === 2 ? 'Z' : colors.has(true) ? 'Y' : colors.has(false) ? 'X' : '.';
      }).join('').replace(/\.+$/, '');
      assert.equal(actual, row, `round ${path.length - 1}`);
      assert.ok(execution.getChildrenCount(path) > 0);
      path.push(0);
    }
  }
});

test('Algorithm 1 matches its figure; Algorithm 2 matches its prefix and formal four-block rules', () => {
  const examples: [keyof typeof projects, number, string[]][] = [
    ['standup-gathering-h-plus-three', 7, [
      '....>..X...X...X...XXXX.X...<<', '.....>.X...X...X...XXXX.X..<<',
      '......>>...X...X...XXXX.X.<<', '.......>>..X...X...XXXX.>X<',
      '........>>.X...X...XXXX..<', '.........>>>...X...XXXX.<',
      '..........>>>..X...XX>X<', '...........>X<.X...XX.<',
      '............>..X...<<<', '.............>.X..<<<', '..............>>.>X<',
      '...............>>.X', '................>X<', '.................X',
    ]],
    ['standup-gathering-h-plus-one', 5, [
      '...>...X><.XX.XX.<', '....>..XXX.XX.>X<', '.....>.XXX.XX..<',
      '......>X<X.XX.<',
      // The figure's next row moves coordinate 6; the formal border-idle,2 guard keeps it fixed.
      '......X..X.XXX',
    ]],
  ];
  for (const [name, phi, rows] of examples) {
    const occupied = (row: string) => [...row].flatMap((c, i) => c === '.' ? [] : [i]);
    const { system }: SimModel = projects[name].setup({ positions: occupied(rows[0]), phi });
    let config = system.initial()[0].config;
    for (const row of rows.slice(1)) {
      const expected = occupied(row);
      const matches = system.successors(config).filter(s => {
        if (s.config.agents.some(a => a.f.crashed)) return false;
        const actual = [...new Set(s.config.agents.map(a => a.pos - phi - 1))].sort((a, b) => a - b);
        return JSON.stringify(actual) === JSON.stringify(expected);
      });
      assert.ok(matches.length, `${name}: no successor matches ${row}`);
      config = matches[0].config;
    }
  }
});

test('crash phases retain the old light before Compute and the new light after Compute', () => {
  const { system, params }: SimModel = colorProject.setup({ positions: [0, 1, 2], phi: 1 });
  const initial = system.initial()[0].config;
  const first = system.successors(initial);
  const slotZero = (c: Config) => c.agents.find(a => a.f.slot === 0)!;
  const before = first.find(s => slotZero(s.config).f.crashed && !(s.config.world.lights as boolean[])[0]);
  const after = first.find(s => slotZero(s.config).f.crashed && (s.config.world.lights as boolean[])[0]);
  assert.ok(before, 'before Look: robot crashes with X');
  assert.ok(after, 'after Compute: robot crashes with Y');
  assert.equal(slotZero(before.config).pos, Number(params.phi) + 1);
  assert.equal(slotZero(after.config).pos, Number(params.phi) + 1);
  assert.ok(first.some(s => !slotZero(s.config).f.crashed && slotZero(s.config).pos === Number(params.phi) + 2));
});

test('the local sensor exposes color sets without multiplicity or fault information', () => {
  const { system }: SimModel = colorProject.setup({ positions: [0, 0, 2], phi: 2 });
  const C = system.initial()[0].config;
  const component = system.exp.model.components[0];
  const sensor = component.sensors![0];
  const compiler = new Compiler(system.rt, system.lay, new Map(system.exp.params.map(p => [p.name, p.type])));
  const fn = compiler.root(sensor.body, [['C', { k: 'config' }], ['me', { k: 'agent' }], ['frame', { k: 'frame' }]], new Map());
  const observer = C.agents.findIndex(a => a.f.slot === 2);
  const view = (c: Config) => runDet(fn, [c, observer, false]);
  const seen = view(C);
  const crashed = structuredClone(C);
  crashed.agents.find(a => a.f.slot === 0)!.f.crashed = true;
  assert.deepEqual(view(crashed), seen);
  const duplicated = structuredClone(C);
  duplicated.agents.push({ ...duplicated.agents.find(a => a.f.slot === 0)!, f: { slot: 3, crashed: false } });
  (duplicated.world.lights as boolean[]).push(false);
  delete duplicated.idx;
  assert.deepEqual(view(duplicated), seen);
  (duplicated.world.lights as boolean[])[3] = true;
  assert.notDeepEqual(view(duplicated), seen);
});

test('settings enforce padding and report theorem assumptions independently of example domains', () => {
  for (const project of Object.values(projects)) {
    const s = project.normalizeSettings({ positions: [20, 0, 4], phi: 8, N: 3 });
    assert.deepEqual(JSON.parse(s.positions), [0, 4, 20]);
    assert.ok(s.N > 20 + 2 * s.phi + 2);
    assert.throws(() => project.setup({ positions: [-1, 2] }), /nonnegative/);
    assert.throws(() => project.setup({ positions: [0] }), /at least two/);
  }
  assert.ok(projects['standup-gathering-h-plus-one'].settingsWarnings({ positions: [0, 2] }).some(s => s.includes('positions')));
  assert.match(colorProject.settingsWarnings({ positions: [0, 5, 10], phi: 2 }).join(' '), /Visibility φ = 2.*at least 5/);
});

test('every preset satisfies the general domain and crash recordings crash at the named round', () => {
  for (const [name, project] of Object.entries(projects)) {
    for (const preset of getPredefinedSettings(name)) {
      const model: SimModel = project.setup(preset.settings);
      assert.deepEqual(parameterDomainViolations(model.system.exp, model.system.params), [], `${name}: ${preset.name}`);
      assert.ok(preset.path && preset.path.length > 1, preset.name);
      const match = preset.name.match(/round (\d+)/);
      const round = match ? Number(match[1]) : Infinity;
      const execution = project.execute(model);
      for (let r = 0; r < preset.path.length; r++) {
        const snapshot = execution.get(preset.path.slice(0, r + 1));
        const crashed = snapshot.agents.filter((a: any) => !a.correct);
        assert.equal(crashed.length, r < round ? 0 : 1, `${name}: ${preset.name}, round ${r}`);
      }
      const last = execution.get(preset.path);
      assert.equal(project.verdict!(last, model).verdict, 'success');
      if (preset.name.includes('after Compute')) {
        const when = preset.path.slice(0, round + 1);
        assert.ok(execution.getEdgeWitness!(when).some(w => w.label.startsWith('crash after Compute:')));
        const crashed = execution.get(when).agents.find((a: any) => !a.correct);
        assert.equal(execution.get(when).world.lights[crashed.fields.slot], true);
      }
    }
  }
});

test('the .sim domains accept arbitrary valid configurations, multiplicities and larger visibility', () => {
  for (const project of Object.values(projects)) {
    for (const positions of [[0, 1, 4, 5, 12, 18, 21], [0, 0, 2, 3, 3], [5, 10, 11]]) {
      const model: SimModel = project.setup({ positions, phi: 20 });
      assert.deepEqual(parameterDomainViolations(model.system.exp, model.system.params), []);
      assert.deepEqual(project.settingsWarnings!(model.params), []);
    }
    for (const setting of project.settingsGenerator!()) {
      assert.deepEqual(parameterDomainViolations((project.setup({}) as SimModel).system.exp, setting), []);
    }
  }
  const general = colorProject.setup({ positions: [0, 1, 3, 4], phi: 4 }) as SimModel;
  assert.deepEqual(parameterDomainViolations(general.system.exp, general.system.params), []);
  const oddOnly = projects['standup-gathering-h-plus-one'].setup({ positions: [0, 1, 3, 4], phi: 4 }) as SimModel;
  assert.deepEqual(parameterDomainViolations(oddOnly.system.exp, oddOnly.system.params), ['positions']);
});

test('oblivious models have no lights and luminous robots always initialize to X', () => {
  for (const [name, project] of Object.entries(projects)) {
    const { system }: SimModel = project.setup({ initialLights: [true, true, true], crashes: false, crashNode: 1, crashSite: 7 });
    const initial = system.initial()[0].config;
    assert.deepEqual(system.exp.params.map(p => p.name), ['N', 'positions', 'phi']);
    if (name.endsWith('two-colors')) {
      assert.deepEqual(initial.world.lights, [false, false, false]);
      assert.ok(initial.agents.every(a => typeof a.f.slot === 'number'));
    } else {
      assert.equal('lights' in initial.world, false);
      assert.ok(initial.agents.every(a => !('slot' in a.f)));
      assert.equal(system.lay.actions.length, 0);
    }
  }
});

test('all visibility bounds warn on phi and remain executable below the paper assumptions', () => {
  const examples: [keyof typeof projects, number[], number, number][] = [
    ['standup-gathering-h-plus-three', [0, 1, 2], 3, 4],
    ['standup-gathering-h-plus-three', [0, 2, 4], 4, 5],
    ['standup-gathering-h-plus-one', [0, 1, 2], 3, 4],
    ['standup-gathering-h-plus-one', [0, 4, 8], 4, 5],
    ['standup-gathering-two-colors', [0, 2, 4], 1, 2],
    ['standup-gathering-two-colors', [0, 1, 2], 0, 1],
  ];
  for (const [name, positions, phi, required] of examples) {
    const project = projects[name];
    const model: SimModel = project.setup({ positions, phi });
    assert.deepEqual(parameterDomainViolations(model.system.exp, model.system.params), ['phi']);
    const warnings = project.settingsWarnings({ positions, phi });
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], new RegExp(`Visibility φ = ${phi}.*at least ${required}`));
    assert.doesNotMatch(warnings[0], /positions.*outside/);
    const execution = project.execute(model);
    assert.ok(execution.getChildrenCount([0]) > 0);
    assert.ok(execution.get([0, 0]));
    assert.deepEqual(project.settingsWarnings({ positions, phi: required }), []);
    assert.throws(() => project.setup({ positions, phi: -1 }), /nonnegative integer/);
  }
});

test('every nonnegative radius can evaluate guards without reading beyond the view', () => {
  for (const project of Object.values(projects)) {
    for (const phi of [0, 1, 2, 3, 4]) {
      for (const positions of [[0, 1, 2], [0, 2, 5]]) {
        const model: SimModel = project.setup({ positions, phi });
        const execution = project.execute(model);
        assert.ok(execution.getChildrenCount([0]) > 0);
        assert.ok(execution.get([0, 0]));
      }
    }
  }
});
