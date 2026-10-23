import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateConfigGraph } from '../../core/src/lib/config-graph';
import { projects } from '../../../projects/black-hole-search/src/projects';
import { simProject, type SimModel } from '../src/sim/project';
import { distinguishing, distinguishingChoices } from '../src/sim/branches';
import * as algo1Sim from '../../../projects/black-hole-search/sim/algo1.sim';
import type { Snapshot } from '../src/sim/snapshot';

const project = projects['black-hole-search-algo1'] as any;

/** A canvas context that records calls (and checks that save and restore balance). */
function recorder() {
  const calls: string[] = [];
  let depth = 0;
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (target, prop: string) => {
      if (prop in target) return target[prop];
      return (...args: unknown[]) => {
        calls.push(`${prop}(${args.map(a => typeof a === 'number' ? Math.round(a) : a).join(',')})`);
        if (prop === 'save') depth++;
        if (prop === 'restore') depth--;
      };
    },
    set: (target, prop: string, value) => { target[prop] = value; return true; },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls, depth: () => depth };
}

test('settings come from the parameters; setup and execute run the new engine', () => {
  assert.deepEqual(project.editorSchema.fields.map((f: any) => [f.key, f.type, f.defaultValue]), [['N', 'number', 5], ['site', 'number', 0]]);
  assert.equal([...project.settingsGenerator()].length, 68);
  const model: SimModel = project.setup({ N: '6', site: '2' });
  assert.deepEqual(model.params, { N: 6, site: 2 });
  const execution = project.execute(model);
  const root: Snapshot = execution.get([0]);
  assert.deepEqual(root.agents.map(a => [a.id, a.pos]), [[0, 0], [1, 0], [2, 0], [3, 0]]);
  assert.equal(root.get(0).agents.length, 4);
  // The hole may emerge while nobody is on it: two successors, labelled by their witnesses.
  assert.equal(execution.getChildrenCount([0]), 2);
  assert.deepEqual([0, 1].map(i => execution.getEdgeLabel([0, i])), ['stays inactive', 'activates']);
  const next: Snapshot = execution.get([0, 0]);
  // Agents 0 and 1 moved clockwise, agents 2 and 3 counterclockwise.
  assert.deepEqual(next.agents.map(a => [a.id, a.pos]), [[0, 1], [1, 1], [2, 5], [3, 5]]);
  assert.equal(next.world.active, false);
});

test('initial settings warnings use defaults, coercion and aliases without blocking execution', () => {
  const source = simProject(algo1Sim, 'algo1', { aliases: { BH_node: 'site' } });
  assert.deepEqual(source.settingsWarnings!(null), []);
  assert.deepEqual(source.settingsWarnings!({ N: '6', BH_node: '5' }), []);
  assert.deepEqual(source.settingsWarnings!({ N: '6', BH_node: '6' }), ['site = 6 is outside its declared parameter domain.']);
  const outside = { N: 13, site: 2 };
  assert.deepEqual(source.settingsWarnings!(outside), ['N = 13 is outside its declared parameter domain.']);
  const model = source.setup(outside);
  assert.equal(source.execute(model).get([0, 0]).size, 13);
});

test('the default ring renderer draws within its placement and gives hit positions', () => {
  const model: SimModel = project.setup({ N: 5, site: 2 });
  const snapshot: Snapshot = project.execute(model).get([0, 0]);
  const { ctx, calls, depth } = recorder();
  project.drawConfig(ctx, snapshot, model, { centerX: 100, centerY: 100, radius: 50 });
  assert.equal(depth(), 0);
  assert.ok(calls.includes('fillText(u0,100,60)'), calls.slice(0, 20).join('\n'));
  assert.ok(!calls.some(c => c.startsWith('clearRect')));
  const hits = project.getAgentsRenderInfo(snapshot, model, 100, 100, 50);
  assert.deepEqual(hits.map((h: any) => h.agentId).sort(), [0, 1, 2, 3]);
});

test('the algorithm view shows the source as written and where each agent is', () => {
  const source = simProject(algo1Sim, 'algo1') as any;
  const model: SimModel = source.setup({ N: 5, site: 2 });
  const snapshot: Snapshot = source.execute(model).get([0, 0]);
  const info = source.getAlgorithmViewInfo(snapshot);
  assert.equal(info.source.name, 'FourAgentEBS');
  assert.match(info.source.file, /algo1\.sim$/);
  // Every line of the definition, indentation and blank lines included, numbered as in the file.
  assert.deepEqual(info.source.lines[0], { number: 8, text: 'algorithm FourAgentEBS uses otherStates where' });
  assert.deepEqual(info.source.lines.find((l: any) => l.number === 32), { number: 32, text: '      move Ring.cw' });
  assert.ok(info.source.lines.some((l: any) => l.text === ''));
  assert.equal(info.source.lines.at(-1).text, '      cautiousWalk 2 3 Port.cw');
  // Agents 0 and 1 moved clockwise (line 32), agents 2 and 3 counterclockwise (line 35).
  assert.deepEqual(info.agents.map((s: any) => [s.agentId, s.line, s.calls]), [['a0', 32, []], ['a1', 32, []], ['a2', 35, []], ['a3', 35, []]]);
  // One round later they are inside cautiousWalk (lines 18 and 23), called at line 33 or 36.
  const inside = source.getAlgorithmViewInfo(source.execute(model).get([0, 0, 0]));
  assert.deepEqual(inside.agents.map((s: any) => [s.agentId, s.line, s.calls]), [['a0', 18, [33]], ['a1', 23, [33]], ['a2', 18, [36]], ['a3', 23, [36]]]);
  // The registry's agent names.
  const named = project.getAlgorithmViewInfo(project.execute(project.setup({ N: 5, site: 2 })).get([0, 0]));
  assert.deepEqual(named.agents.map((s: any) => [s.agentId, s.line]), [['a₍1₎', 32], ['a₍2₎', 32], ['a₍3₎', 35], ['a₍4₎', 35]]);
});

test('the state inspector gets the whole configuration as plain values', () => {
  const model: SimModel = project.setup({ N: 5, site: 1 });
  // The hole activates while agents 0 and 1 step on it.
  const state = project.inspect(project.execute(model).get([0, 1]), model);
  assert.deepEqual(state.world, { site: 1, active: true });
  assert.deepEqual(state.params, { N: 5, site: 1 });
  assert.deepEqual(state.agents.map((a: any) => [a.name, a.status]), [['a₍1₎', 'hidden'], ['a₍2₎', 'hidden'], ['a₍3₎', 'correct'], ['a₍4₎', 'correct']]);
  assert.deepEqual(state.agents[2].value, { position: 4, line: 35, flags: { dead: false }, pub: { id: 2, bh: null }, mem: { pc: 'move2' } });
  // A destroyed agent runs no line.
  assert.equal('line' in state.agents[0].value, false);
});

test("the verdict is the task's on the configuration, even under eventually always", () => {
  const model: SimModel = project.setup({ N: 10, site: 3 });
  const execution = project.execute(model);
  // The preset "Black hole at u3 round 7", then the first branch: the hole activates at round 7,
  // and from round 13 on the survivors claim it.
  let path = [0, 0, 0, 0, 0, 0, 0, 1];
  while (path.length < 15) path = [...path, 0];
  const verdicts = path.map((_, i) => project.verdict(execution.get(path.slice(0, i + 1)), model));
  assert.deepEqual(verdicts.map((v: any) => v.verdict), [...Array(7).fill('success'), ...Array(6).fill('inProgress'), 'success', 'success']);
  assert.equal(verdicts[0].goal, 'eventuallyAlways');
  // The checker of the graph goes on after a success under this goal.
  assert.equal(project.executionStatusChecker(execution.get(path), model), 'inProgress');
});

test('the configuration graph of the UI works through the adapter', () => {
  const result = generateConfigGraph(projects as any, {
    type: 'generate', projectName: 'black-hole-search-algo1', settings: { N: 5, site: 2 }, maxDepth: 4, horizontalSpacing: 0, verticalSpacing: 0,
  });
  assert.ok(result.nodes!.length > 4);
  assert.equal(result.stats!.failureNodes, 0);
});

test('a branch is named by the choices that distinguish it from the other branches of its step', () => {
  assert.deepEqual(distinguishing(['a0: as is; a1: as is; no crash', 'a0: as is; a1: as is; crash [a0]']), ['no crash', 'crash [a0]']);
  assert.deepEqual(distinguishing(['a0: as is; a1: mirrored', 'a0: mirrored; a1: mirrored']), ['a0: as is', 'a0: mirrored']);
  assert.deepEqual(distinguishing(['stays inactive', 'activates']), ['stays inactive', 'activates']);
  assert.deepEqual(distinguishing(['a0: as is']), ['a0: as is']);
});

test('a branch is named by its choices that differ from the other branches and are not the first option', () => {
  const frame = (a: number, m: boolean) => ({ site: 'frame', index: m ? 1 : 0, label: `a${a}: ${m ? 'mirrored' : 'as is'}` });
  const crash = (c: boolean) => ({ site: 'CrashAtNode.S', index: c ? 1 : 0, label: c ? 'crash [a0]' : 'no crash' });
  assert.deepEqual(distinguishingChoices([
    [frame(0, false), frame(1, false), crash(false)],
    [frame(0, false), frame(1, true), crash(false)],
    [frame(0, true), frame(1, true), crash(true)],
  ]), ['default choices', 'a1: mirrored', 'a0: mirrored; a1: mirrored; crash [a0]']);
  const hole = (i: number) => [{ site: 'BlackHole.active', index: i, label: i ? 'activates' : 'stays inactive' }];
  assert.deepEqual(distinguishingChoices([hole(0), hole(1)]), ['stays inactive', 'activates']);
});

test('the model view describes the experiment and shows the declarations it uses, as written', () => {
  const d = project.describe() as import('../../core/src/types/project').ModelDescription;
  assert.equal(d.experiment, 'algo1');
  assert.ok(d.summary.includes('sensor: otherStates'));
  assert.match(d.about!, /^Algorithm 1 of the black-hole-search paper/);
  assert.deepEqual(d.sources.map(s => `${s.kind} ${s.name}`), [
    'experiment algo1', 'model blackHoleSearch', 'model agentsWithMemory', 'space Graphs.Cycle', 'sensor otherStates',
    'component Hazards.BlackHole', 'scheduler Schedulers.FSync', 'algorithm FourAgentEBS', 'task IdentifyEmergingBlackHole', 'goal IdentifyEmergingBlackHole',
    'definition Port.cw', 'definition port', 'definition Ring.cw', 'definition Ring.ccw', 'definition Port.opposite',
  ]);
  // A declaration comes with its doc comment and attributes.
  const hole = d.sources.find(s => s.kind === 'component')!;
  assert.match(hole.lines[0].text, /^\/-- A black hole/);
  assert.ok(hole.lines.some(l => l.text === '@[equivariant]'));
  assert.match(hole.lines.at(-1)!.text, /raise dead/);
  const fact = (section: string, label: string) => d.sections.find(s => s.title.startsWith(section))!.facts.find(f => f.label === label)!;
  assert.equal(fact('Experiment', 'param N').value, '(range 13).filter (· ≥ 5)');
  assert.equal(fact('Experiment', 'Settings checked').value, String([5, 6, 7, 8, 9, 10, 11, 12].reduce((n, N) => n + N, 0)));
  assert.equal(fact('Model', 'Scheduler').value, 'FSync');
  assert.equal(fact('Components', 'BlackHole').value, 'BlackHole (policy := .mayEmerge)');
  assert.equal(fact('Task', 'Goal').value, '◇□ success');
  // Every reference names a shown declaration.
  const keys = new Set(d.sources.map(s => `${s.kind} ${s.name}`));
  assert.ok(d.sections.every(s => s.facts.every(f => (f.refs ?? []).every(r => keys.has(r.source)))));
  // A parameter points at its line in the experiment.
  const at = fact('Experiment', 'param N').refs![0];
  assert.equal(d.sources.find(s => s.kind === 'experiment')!.lines.find(l => l.number === at.line)!.text.trim(), 'param N : Nat in (range 13).filter (· ≥ 5)');
  // The adversary chooses whether the hole activates, after the moves.
  assert.deepEqual(d.step.find(p => p.phase === 'afterMove')!.choices, ['BlackHole.active']);
});

test('the model view links each case of the Lean step to the statement it resumes after', () => {
  const lean = project.describe().lean as Extract<import('../../core/src/types/project').LeanDescription, { blocks: unknown }>;
  assert.equal(lean.module, 'Algo1');
  assert.match(lean.text, /^import Simulant\nimport Simulant\.Library\.BlackHole/);
  assert.deepEqual(lean.library.map(l => [l.module, l.refs[0].source]), [['Simulant.Library.BlackHole', 'component Hazards.BlackHole']]);
  const lines = lean.text.split('\n');
  const move1 = lean.blocks.find(b => /\| FourAgentEBSPC\.move1 =>/.test(lines[b.line - 1]))!;
  assert.equal(move1.label, 'resumes after line 32');
  assert.deepEqual(move1.refs, [{ source: 'algorithm FourAgentEBS', line: 32 }]);
  const domain = lean.blocks.find(b => lines[b.line - 1].startsWith('def domain_N'))!;
  assert.deepEqual(domain.refs, [{ source: 'experiment algo1', line: 43 }]);
});
