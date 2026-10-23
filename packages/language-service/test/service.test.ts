import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { LanguageService } from '../src/service';

const root = 'memory:///project/', stdlib = 'memory:///stdlib/';
const directory = new URL('../../stdlib/sim/', import.meta.url);
const sources = Object.fromEntries(readdirSync(directory).filter(n => n.endsWith('.sim')).map(n => [stdlib + n, readFileSync(new URL(n, directory), 'utf8')]));
const main = `${root}main.sim`;
const example = `import "std/examples.sim"
experiment e where
  model := blackHoleRobots (Graphs.Cycle N) .initiallyPresent .unknown
  algorithm := CautiousPair
  task := IdentifyBlackHole
  param N : Nat in [5]
  param site : Pos in [pos 2]
  agents := 2
  position i := pos 0
`;

function project(files: Record<string, string>) {
  const texts = new Map([...Object.entries(sources), ...Object.entries(files).map(([name, text]) => [root + name, text] as const)]);
  const service = new LanguageService({ read: uri => texts.get(uri),
    resolve: (from, spec) => new URL(spec.startsWith('std/') ? spec.slice(4) : spec, spec.startsWith('std/') ? stdlib : from).href,
    files: () => texts.keys() }, stdlib);
  return { service, texts };
}
function position(text: string, needle: string, occurrence = 0) {
  let offset = -1;
  for (let i = 0; i <= occurrence; i++) offset = text.indexOf(needle, offset + 1);
  assert.ok(offset >= 0, needle);
  return TextDocument.create(main, 'simulant', 0, text).positionAt(offset + Math.min(1, needle.length));
}

test('compiler diagnostics use zero-based UTF-16 ranges and clear after an unsaved fix', () => {
  const { service } = project({ 'main.sim': example });
  assert.equal(service.analyze(main).diagnostics.size, 0);
  assert.equal(service.analyze(main).experiments.e.irVersion, 3);
  const invalid = example.replace('agents := 2', 'agents := true');
  service.setDocument(main, invalid, 1);
  const diagnostic = service.analyze(main).diagnostics.get(main)![0];
  assert.match(diagnostic.message, /Bool|Nat/);
  assert.equal(service.analyze(main).experiments.e, undefined);
  assert.deepEqual(diagnostic.range.start, { line: 7, character: 12 });
  service.setDocument(main, example, 2);
  assert.equal(service.analyze(main).diagnostics.size, 0);
  assert.equal(service.setDocument(main, invalid, 1), false);
  assert.equal(service.setDocument(main, invalid, 2), false);
  assert.equal(service.analyze(main).diagnostics.size, 0);
});

test('unsaved transitive imports are used by the same compiler and missing imports recover', () => {
  const { service, texts } = project({ 'main.sim': 'import "./models.sim"\n' + example,
    'models.sim': 'import "./helper.sim"\n' });
  assert.match([...service.analyze(main).diagnostics.values()].flat()[0].message, /cannot read module/);
  texts.set(root + 'helper.sim', 'def value : Nat := 1\n');
  service.invalidate();
  assert.equal(service.analyze(main).diagnostics.size, 0);
  service.setDocument(root + 'helper.sim', 'invalid syntax\n', 1);
  assert.ok(service.analyze(main).diagnostics.has(root + 'helper.sim'));
  service.closeDocument(root + 'helper.sim');
  assert.equal(service.analyze(main).diagnostics.size, 0);
});

test('completion and import navigation work while the current declaration is incomplete', () => {
  const text = 'import "std/models.sim"\ndef draft : Model := blackH';
  const { service } = project({ 'main.sim': text });
  const end = TextDocument.create(main, 'simulant', 0, text).positionAt(text.length);
  assert.ok(service.completion(main, end).some(c => c.label === 'blackHoleRobots'));
  const location = service.definition(main, position(text, 'std/models.sim'));
  assert.equal(location?.uri, stdlib + 'models.sim');
  service.setDocument(main, 'import "std/mo', 1);
  assert.ok(service.completion(main, { line: 0, character: 14 }).some(c => c.label === 'std/models.sim'));
});

test('hover and definition resolve standard-library functions without making them renameable', () => {
  const { service } = project({ 'main.sim': example });
  const cursor = position(example, 'blackHoleRobots');
  assert.equal(service.definition(main, cursor)?.uri, stdlib + 'models.sim');
  assert.match(JSON.stringify(service.hover(main, cursor)?.contents), /blackHoleRobots.*HolePolicy/);
  assert.equal(service.prepareRename(main, cursor), undefined);
  assert.throws(() => service.rename(main, cursor, 'changed'), /editable/);
  const item = service.completion(main, cursor).find(c => c.label === 'blackHoleRobots')!;
  assert.ok(item.textEdit && 'newText' in item.textEdit);
  const doc = TextDocument.create(main, 'simulant', 0, example);
  assert.equal(doc.getText(item.textEdit.range), 'blackHoleRobots');
});

test('references and rename cross imports, include unopened dependents, and carry document versions', () => {
  const model = 'def speed (x : Nat) : Nat := x + 1\n';
  const runner = 'import "./models.sim"\ndef runner (x : Nat) : Nat := speed x\n';
  const text = 'import "./runner.sim"\ndef run (x : Nat) : Nat := runner (speed x)\n';
  const { service } = project({ 'main.sim': text, 'models.sim': model, 'runner.sim': runner });
  service.setDocument(main, text, 7);
  const cursor = position(text, 'speed');
  assert.equal(service.definition(main, cursor)?.uri, root + 'models.sim');
  assert.equal(service.references(main, cursor).length, 3);
  const edit = service.rename(main, cursor, 'velocity');
  assert.equal(edit.documentChanges?.length, 3);
  assert.ok(edit.documentChanges?.some(d => 'textDocument' in d && d.textDocument.uri === main && d.textDocument.version === 7));
  assert.throws(() => service.rename(main, cursor, 'runner'), /conflict/);
});

test('local binding scopes distinguish shadowing and prevent capture during rename', () => {
  const text = 'def f (x : Nat) : Nat :=\n  let y := x\n  let x := y + 1\n  x + y\n';
  const { service } = project({ 'main.sim': text });
  const original = service.definition(main, position(text, 'x', 1));
  const shadow = service.definition(main, position(text, 'x + y'));
  assert.equal(original?.range.start.line, 0);
  assert.equal(shadow?.range.start.line, 2);
  assert.equal(service.references(main, position(text, 'x + y')).length, 2);
  assert.throws(() => service.rename(main, position(text, 'x + y'), 'y'), /conflict/);
  assert.throws(() => service.rename(main, position(text, 'x + y'), 'move'), /reserved/);
});

test('typed record members, enums and qualified constructors support navigation', () => {
  const text = 'structure Point where\n  size : Nat\ninductive Status | running | stopped\ndef value (p : Point) : Nat := p.size\ndef status : Status := Status.stopped\n';
  const { service } = project({ 'main.sim': text });
  assert.equal(service.definition(main, position(text, 'size', 1))?.range.start.line, 1);
  assert.equal(service.references(main, position(text, 'stopped', 1)).length, 2);
  assert.equal(service.references(main, position(text, 'Status')).length, 3);
  const memberCursor = TextDocument.create(main, 'simulant', 0, text).positionAt(text.indexOf('p.size') + 2);
  assert.ok(service.completion(main, memberCursor).some(c => c.label === 'size'));
  assert.equal(service.prepareRename(main, position(text, 'size', 1)), undefined);
});

test('sensor references in uses and in the step are included in rename', () => {
  const text = 'sensor observation (L : Look) : Nat := 1\nalgorithm A uses observation where\n  step mem pub := { move := if observation = 1 then here else here, pub := pub, mem := mem }\n';
  const { service } = project({ 'main.sim': text });
  assert.equal(service.references(main, position(text, 'observation')).length, 3);
});

test('hover includes declaration documentation and ambiguous constructor renames are rejected', () => {
  const text = '/-- A documented helper. -/\ndef helper (x : Nat) : Nat := x\ninductive A | stopped\ninductive B | stopped\ndef a : A := .stopped\n';
  const { service } = project({ 'main.sim': text });
  assert.match(JSON.stringify(service.hover(main, position(text, 'helper', 1))?.contents), /documented helper/);
  assert.throws(() => service.rename(main, position(text, 'stopped'), 'finished'), /ambiguous/);
});

test('outlines, folding and signatures work through a portable in-memory host', () => {
  const text = 'def add (x : Nat) (y : Nat) : Nat :=\n  x + y\ndef result : Nat := add 1 2\n';
  const { service } = project({ 'main.sim': text });
  assert.deepEqual(service.documentSymbols(main).map(s => s.name), ['add', 'result']);
  assert.ok(service.foldingRanges(main).some(r => r.startLine === 0 && r.endLine === 1));
  assert.ok(service.workspaceSymbols('res').some(s => s.name === 'result'));
  const signature = service.signatureHelp(main, position(text, '2'));
  assert.equal(signature?.signatures[0].parameters?.length, 2);
  assert.equal(signature?.activeParameter, 1);
});

test('unsaved untitled documents support references and rename', () => {
  const { service } = project({});
  const uri = 'untitled:Untitled-1', text = 'def f (x : Nat) : Nat := x + 1\n';
  service.setDocument(uri, text, 1);
  const cursor = { line: 0, character: 7 };
  assert.equal(service.references(uri, cursor).length, 2);
  const edit = service.rename(uri, cursor, 'value');
  assert.equal(edit.documentChanges?.length, 1);
  assert.ok(edit.documentChanges?.some(d => 'textDocument' in d && d.textDocument.uri === uri));
});

test('rename includes named arguments and preserves qualified enum namespaces', () => {
  const text = 'def family (n : Nat) : Component where\n  World := { value : Nat }\n  init := { value := n }\ndef result : Component := family (n := 2)\ninductive Theme.Status | stopped\ndef status : Theme.Status := Theme.Status.stopped\n';
  const { service } = project({ 'main.sim': text });
  assert.equal(service.references(main, { line: 0, character: 12 }).length, 3);
  const edit = service.rename(main, position(text, 'Status'), 'State');
  const doc = TextDocument.create(main, 'simulant', 0, text);
  const changes = edit.documentChanges?.flatMap(d => 'edits' in d ? d.edits : []) ?? [];
  assert.equal(changes.length, 3);
  assert.ok(changes.every(e => doc.getText(e.range) === 'Status'));
});

test('fixed schema names, entry points and implicitly read experiment parameters are protected', () => {
  const text = 'algorithm A where\n  Pub := { id : Nat }\n  main :=\n    stay\nexperiment e where\n  param N : Nat in [5]\n';
  const { service } = project({ 'main.sim': text });
  for (const name of ['Pub', 'main', 'N']) assert.equal(service.prepareRename(main, position(text, name)), undefined);
});
