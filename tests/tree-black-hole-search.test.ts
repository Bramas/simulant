import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkSetting } from '@bramas/simulant-engine/check';
import { equivarianceViolations, Symmetry } from '@bramas/simulant-engine/symmetry';
import type { Config } from '@bramas/simulant-engine/system';
import type { SimModel } from '@bramas/simulant-ui/sim/project';
import { loadProject } from '../packages/cli/src/project-registry';
import { getPredefinedSettings, parentTrees, projects } from '../projects/public/tree-black-hole-search/src/projects';

const withHole = projects['tree-black-hole-search-two-agents'];
const withoutHole = projects['tree-black-hole-search-no-hole'];
const systemFor = (parents: number[], site = 1, hole = true) =>
  ((hole ? withHole : withoutHole).setup({ parents, site }) as SimModel).system;

test('P22 registries preserve a safe root, known tree and local face-to-face communication', async () => {
  for (const [name, project] of Object.entries(projects)) {
    assert.equal(await loadProject(name), project);
    for (const preset of getPredefinedSettings(name)) assert.deepEqual(project.settingsWarnings!(preset.settings), []);
  }
  const system = systemFor([0, 0, 0, 1]);
  assert.deepEqual(system.exp.model.sensors.map(s => s.name), ['otherStates', 'knownTree']);
  assert.equal(system.exp.task.goal, 'eventuallyAlways');
  assert.equal(system.scheduler.events.length, 1);
  const sameMap = systemFor([0, 0, 0, 1], 2);
  for (let i = 0; i < 2; i++) {
    assert.deepEqual(system.decisionsOf(system.initial()[0].config, i).map(d => d.decision),
      sameMap.decisionsOf(sameMap.initial()[0].config, i).map(d => d.decision), 'the hole location is hidden');
  }
  for (const parents of [[], [0], [1, 0], [0, 1], [0, 2, 1]]) {
    assert.ok(withHole.settingsWarnings!({ parents, site: 1 }).length);
  }
  assert.ok(withHole.settingsWarnings!({ parents: [0, 0], site: 0 }).length);
});

test('P22 split sends agents to distinct unknown edges; missing partner is checked after return', () => {
  const system = systemFor([0, 0, 0, 0, 0], 2);
  let C = system.initial()[0].config;
  C = system.successors(C)[0].config;
  assert.deepEqual(C.agents.map(a => a.pos).sort(), [1, 2]);
  assert.equal(C.agents.filter(a => a.f.dead).length, 1);
  assert.ok(C.agents.every(a => !(a.pub as { done: boolean }).done));
  C = system.successors(C)[0].config;
  const survivor = C.agents.find(a => !a.f.dead)!;
  assert.equal(survivor.pos, 0);
  assert.equal((survivor.pub as { done: boolean }).done, false);
  assert.equal(system.verdict(C), 'inProgress');
  C = system.successors(C)[0].config;
  assert.equal(system.verdict(C), 'success');
  assert.deepEqual(C.agents.find(a => !a.f.dead)!.pub, { role: 0, answer: 2, done: true });
  assert.equal(system.verdict(system.successors(C)[0].config), 'success');
});

test('P22 probe keeps one agent safe; a deeper detection returns through certified safe edges', () => {
  for (const site of [1, 3]) {
    const system = systemFor([0, 0, 1, 2], site);
    let C = system.initial()[0].config;
    let deathAt: Config | undefined;
    let moves = 0;
    for (; moves < 30 && system.verdict(C) !== 'success'; moves++) {
      C = system.successors(C)[0].config;
      if (C.agents.some(a => a.f.dead)) deathAt ??= C;
    }
    assert.ok(deathAt);
    assert.equal(deathAt.agents.filter(a => !a.f.dead).length, 1);
    assert.equal(deathAt.agents.find(a => !a.f.dead)!.pos, site - 1);
    assert.equal((deathAt.agents.find(a => !a.f.dead)!.pub as { done: boolean }).done, false);
    assert.equal(system.verdict(C), 'success');
    assert.equal(C.agents.find(a => !a.f.dead)!.pos, 0);
    assert.equal((C.agents.find(a => !a.f.dead)!.pub as { answer: number }).answer, site);
    if (site === 1) assert.equal(moves, 3, 'out, two-step deadline, then the reporting activation');
  }
});

test('P22 no-hole executions traverse every edge, return both agents and remain stopped', () => {
  const parents = [0, 0, 0, 1, 1, 2, 5];
  const system = systemFor(parents, 1, false);
  let C = system.initial()[0].config;
  const edges = new Set<string>();
  const vertices = new Set<number>([0]);
  for (let t = 0; t < 80 && system.verdict(C) !== 'success'; t++) {
    const next = system.successors(C)[0].config;
    for (const a of next.agents) {
      const before = C.agents.find(b => (b.pub as { role: number }).role === (a.pub as { role: number }).role)!;
      const x = Number(before.pos), y = Number(a.pos);
      vertices.add(y);
      if (x !== y) edges.add([x, y].sort((l, r) => l - r).join('-'));
    }
    C = next;
  }
  assert.equal(system.verdict(C), 'success');
  assert.equal(edges.size, parents.length - 1);
  assert.equal(vertices.size, parents.length);
  assert.ok(C.agents.every(a => a.pos === 0 && !a.f.dead && (a.pub as { answer: unknown }).answer === null));
  const stopped = system.successors(C)[0].config;
  assert.deepEqual(stopped.agents, C.agents);
  assert.deepEqual(stopped.world, C.world);
  const wrong: Config = { ...C, agents: C.agents.map(a => ({ ...a, pub: { ...(a.pub as object), answer: 1 } })) };
  assert.equal(system.verdict(wrong), 'failure');
  const away: Config = { ...C, agents: C.agents.map(a => ({ ...a, pos: 1 })) };
  assert.equal(system.verdict(away), 'inProgress', 'a report without actual return does not complete the task');
  const lost: Config = { ...C, agents: C.agents.map(a => ({ ...a, f: { ...a.f, dead: true } })) };
  assert.equal(system.verdict(lost), 'failure');
});

test('P22 every encoded tree through six nodes succeeds at every non-root hole site and with no hole', async () => {
  let trees = 0, settings = 0;
  for (let n = 2; n <= 6; n++) {
    for (const parents of parentTrees(n)) {
      trees++;
      for (let site = 0; site < n; site++) {
        const hasHole = site !== 0;
        const params = { parents, site: hasHole ? site : 1 };
        const project = hasHole ? withHole : withoutHole;
        assert.equal((await project.check!(params, { maxStates: 1000 })).status, 'success');
        const system = systemFor(parents, params.site, hasHole);
        assert.equal((await checkSetting(system.exp, params, { maxStates: 1000, symmetry: false })).status, 'success');
        settings++;
      }
    }
  }
  assert.equal(trees, 153);
  assert.equal(settings, 872);
});

test('P22 known-map labels, root marker, hazard and reports commute with kept graph symmetries', () => {
  // The two-node tree has a nontrivial port-preserving swap. The map's physical keys
  // and home move with it; map-relative scalar labels and answers must stay unchanged.
  const system = systemFor([0, 0]);
  const configs: Config[] = [system.initial()[0].config];
  for (let i = 0; i < 4; i++) configs.push(system.successors(configs.at(-1)!)[0].config);
  const symmetry = new Symmetry(system);
  assert.equal(symmetry.group.kind, 'finite');
  const group = symmetry.group.kind === 'finite' ? symmetry.group.elements : [];
  assert.equal(group.length, 2);
  assert.deepEqual(equivarianceViolations(system, configs, group), []);
});
