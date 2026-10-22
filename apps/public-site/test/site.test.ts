/**
 * The documentation pages read the standard library and compile code in the browser;
 * these tests run the same code under Node, so library changes cannot silently break them.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  analyze, build, byName, components, isCustom, locate, models, newDraft, outputTypes, sensorArgs, spaceOptions, syntaxError, tasks, useOf, viewSensors, withCustom,
  type Draft,
} from '../src/builder';
import { compileText } from '../src/compile';
import { completeFiles } from '../src/guide-examples';
import { readLibrary } from '../src/stdlib';

const dir = fileURLToPath(new URL('../../../packages/stdlib/sim/', import.meta.url));
const sources = Object.fromEntries(readdirSync(dir).filter((f) => f.endsWith('.sim')).map((f) => [`std/${f}`, readFileSync(dir + f, 'utf8')]));
const librarySources = Object.fromEntries(Object.entries(sources).filter(([path]) => path !== 'std/conformance.sim'));
const library = readLibrary(librarySources);

/** Adds the components the draft's sensors and task need, as the builder's "Add it" does. */
function complete(draft: Draft): Draft {
  for (const warning of analyze(library, draft).warnings) {
    if (!warning.fix) continue;
    draft.lists[warning.fix.list] = [...draft.lists[warning.fix.list], useOf(library, byName(library, warning.fix.component)!)];
  }
  return draft;
}

function assertCompiles(draft: Draft, label: string) {
  const built = build(library, sources, draft);
  assert.deepEqual(built.compiled.diagnostics, [], `${label}\n${built.text}`);
  assert.ok(built.experiment, label);
  return built;
}

test('the library catalog documents every public piece', () => {
  for (const kind of ['model', 'component', 'sensor', 'task'] as const) {
    const entries = library.entries.filter((e) => e.kind === kind);
    assert.ok(entries.length, `no ${kind}`);
    for (const e of entries) assert.ok(e.doc, `${e.name} has no doc comment`);
  }
  assert.deepEqual(byName(library, 'colors')?.requires, ['Storage.Lights']);
  assert.deepEqual(byName(library, 'ownLight')?.requires, ['Storage.Lights']);
  assert.deepEqual(byName(library, 'Faults.CrashAt')?.reads, [{ name: 'crashNode', type: 'Pos' }]);
  assert.deepEqual(library.entries.filter((e) => e.kind === 'space').map((e) => e.name), ['Graphs.Cycle', 'Graphs.Line', 'Graphs.Star']);
  assert.deepEqual(byName(library, 'IdentifyEmergingBlackHole')?.outputs, ['claim']);
  assert.equal(byName(library, 'Gathering')?.goal, 'eventually');
});

test('every output a library task reads has a type in the builder', () => {
  for (const task of tasks(library)) {
    for (const output of task.outputs ?? []) {
      assert.ok(outputTypes[output.replace(/^pub\./, '')], `${task.name} reads ${output}`);
    }
  }
});

test('the builder compiles every model family with every task', () => {
  for (const model of models(library)) {
    for (const task of tasks(library)) {
      assertCompiles(complete({ ...newDraft(library, model.name), task: task.name }), `${model.name} / ${task.name}`);
    }
  }
});

test('the builder compiles every component and view sensor, with what they need', () => {
  for (const model of models(library)) {
    const list = model.params.find((p) => p.type === 'List Component')!.name;
    for (const component of components(library).filter((c) => !model.includes?.includes(c.name))) {
      const draft = newDraft(library, model.name);
      draft.lists[list] = [useOf(library, component)];
      assertCompiles(complete(draft), `${model.name} with ${component.name}`);
    }
    // A family takes one sensor (blackHoleRobots' view) or a list of them (robots).
    const view = model.params.find((p) => p.type === 'Sensor' || p.type === 'List Sensor')!;
    for (const sensor of viewSensors(library)) {
      const draft = newDraft(library, model.name);
      if (view.type === 'Sensor') draft.args[view.name] = [sensor.name, ...sensorArgs(sensor).map(() => '1')].join(' ');
      else draft.lists[view.name] = [{ name: sensor.name, args: sensorArgs(sensor).map(() => '1') }];
      const built = assertCompiles(complete(draft), `${model.name} viewing ${sensor.name}`);
      assert.match(built.text, new RegExp(`uses .*${sensor.implements ?? sensor.name}`));
    }
  }
});

test('the builder writes positions the space accepts', () => {
  for (const space of spaceOptions(library)) {
    const draft = complete({ ...newDraft(library, 'robots'), task: 'Gathering', placement: 'spread' });
    draft.args.space = space.value;
    draft.lists.components = [useOf(library, byName(library, 'Faults.CrashAt')!)];
    const built = assertCompiles(draft, space.value);
    assert.match(built.text, space.value === 'Graphs.Line' ? /position i := pos \(toInt i\)/ : /position i := pos i/);
  }
});

test('the builder reports the compiler diagnostics of a rejected combination', () => {
  const draft = newDraft(library, 'robots');
  draft.lists.views = [{ name: 'colors', args: [] }];
  assert.equal(analyze(library, draft).warnings[0]?.fix?.component, 'Storage.Lights');
  const built = build(library, sources, draft);
  assert.equal(built.experiment, undefined);
  assert.ok(built.compiled.diagnostics.length);
});

test('the guide examples compile', () => {
  for (const [name, text] of Object.entries(completeFiles)) {
    const compiled = compileText(text, sources);
    assert.deepEqual(compiled.diagnostics, [], name);
    assert.equal(Object.keys(compiled.experiments).length, 1, name);
  }
});

/** A custom sensor and component, from the guide's "Your own pieces" example. */
const custom = completeFiles.custom.slice(completeFiles.custom.indexOf('/-- Whether'), completeFiles.custom.indexOf('/-- Every robot'));

test('the builder offers custom components and sensors, and compiles a draft that uses them', () => {
  const lib = withCustom(librarySources, custom)!;
  assert.ok(lib, 'the custom code parses');
  const trap = components(lib).find((c) => c.name === 'Hazards.Trap');
  assert.ok(trap && isCustom(trap), 'the component picker lists Hazards.Trap');
  assert.deepEqual(trap.reads, [{ name: 'trap', type: 'Pos' }]);
  assert.ok(viewSensors(lib).some((s) => s.name === 'notAlone' && isCustom(s)), 'the view selector lists notAlone');

  const draft: Draft = {
    ...newDraft(lib, 'robots'),
    custom,
    body: 'main :=\n  if notAlone then\n    stay\n  else\n    move Ring.cw',
  };
  draft.lists.views = [{ name: 'notAlone', args: [] }];
  draft.lists.components = [useOf(lib, trap)];
  // The page keeps its state in `#draft=`: the shared link restores the same file.
  const shared = JSON.parse(decodeURIComponent(encodeURIComponent(JSON.stringify(draft)))) as Draft;
  const built = build(withCustom(librarySources, shared.custom)!, sources, shared);
  assert.deepEqual(built.compiled.diagnostics, [], built.text);
  assert.match(built.text, /algorithm MyAlgorithm uses notAlone where\n {2}main :=\n {4}if notAlone then/);
  assert.match(built.text, /param trap : Pos in \(range N\)\.map pos/);
  assert.deepEqual(built.experiment?.model.sensors.map((s) => s.name), ['notAlone']);
  assert.deepEqual(built.experiment?.model.components.map((c) => c.name), ['Trap']);

  // Diagnostics point at the line of the file and at the line of the text area.
  const broken = { ...draft, custom: custom.replace('a.pos = C.world.trap', 'a.where = C.world.trap') };
  const failed = build(lib, sources, broken);
  const [problem] = failed.compiled.diagnostics;
  assert.match(problem.message, /no field where/);
  const line = broken.custom.split('\n').findIndex((l) => l.includes('a.where')) + 1;
  assert.equal(failed.text.split('\n')[problem.line! - 1], broken.custom.split('\n')[line - 1]);
  assert.deepEqual(locate(failed.regions, problem), { region: 'custom', line, column: problem.column });

  // An unclosed bracket is noticed by the whole file at the generated code after it,
  // and by the declarations alone at their own last line.
  const unclosed = `${custom}\ndef Broken : Component where\n  World := {`;
  assert.equal(withCustom(librarySources, unclosed), undefined);
  assert.equal(syntaxError(unclosed)?.line, unclosed.split('\n').length);
});

test('the algorithm body may replace the generated public state', () => {
  const draft = { ...newDraft(library, 'blackHoleRobots'), task: 'IdentifyBlackHole' };
  draft.args.policy = '.initiallyPresent';
  draft.body = [
    'Pub := { id : Nat, bh : Option Nat }',
    'output claim := pub.bh',
    'init i := { pub := { id := i, bh := none } }',
    '',
    'main :=',
    '  if pub.id = 0 then',
    '    move Ring.cw',
    '  else',
    '    stay',
    '  pub := { pub with bh := some Port.cw }',
  ].join('\n');
  const built = build(library, sources, draft);
  assert.deepEqual(built.compiled.diagnostics, [], built.text);
  assert.equal(built.text.match(/Pub :=/g)?.length, 1);

  const typo = build(library, sources, { ...draft, body: draft.body.replace('pub.id = 0', 'pub.idx = 0') });
  const mine = typo.compiled.diagnostics.map((d) => locate(typo.regions, d)).find(Boolean);
  assert.equal(mine?.region, 'algorithm');
  assert.equal(mine?.line, 6);
});
