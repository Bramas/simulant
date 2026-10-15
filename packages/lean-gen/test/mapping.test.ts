import assert from 'node:assert/strict';
import { test } from 'node:test';
import { casesOnLines, generateMappedModel, generateModel } from '@bramas/simulant-lean-gen/model';
import { examples } from '@bramas/simulant-lean-gen/examples';

test('a root match is written one case per line, and nothing else changes', () => {
  assert.equal(casesOnLines('(match x with | A.a => (f "| b" (y || z)) | A.b => (match y with | c => 1 | d => 2))', '  '),
    '(match x with\n  | A.a => (f "| b" (y || z))\n  | A.b => (match y with | c => 1 | d => 2))');
  // Not a single parenthesized match: left as it is.
  assert.equal(casesOnLines('(match x with | a => 1) + (match y with | b => 2)', '  '), '(match x with | a => 1) + (match y with | b => 2)');
  assert.equal(casesOnLines('(if c then 1 else 2)', '  '), '(if c then 1 else 2)');
});

test('the generated model says which part of the experiment each region translates', () => {
  const exp = examples.Algo1;
  const { text, regions } = generateMappedModel(exp, 'Examples.Algo1');
  assert.equal(text, generateModel(exp, 'Examples.Algo1'));
  const lines = text.split('\n');
  const at = (r: { line: number }) => lines[r.line - 1];
  const find = (kind: string, name?: string) => regions.filter(r => r.origin.kind === kind && r.origin.name === name && !r.origin.pc);
  assert.match(at(find('algorithm', 'step')[0]), /^def step /);
  assert.match(at(find('task')[0]), /^def verdict /);
  assert.match(at(find('goal')[0]), /^def goal /);
  assert.match(at(find('sensor', 'otherStates')[0]), /^def sensor_otherStates /);
  assert.match(at(find('param', 'N')[0]), /^def domain_N /);
  // One region per case of the step, on its own line, named by the program counter it resumes at.
  const cases = regions.filter(r => r.origin.pc);
  const pcs = (exp.algorithm.mem as { fields: { name: string; type: { ctors: string[] } }[] }).fields.find(f => f.name === 'pc')!.type.ctors;
  assert.deepEqual(cases.map(r => r.origin.pc).sort(), [...pcs].sort());
  for (const r of cases) assert.match(at(r), new RegExp(`^\\s+\\| \\w+\\.${r.origin.pc} =>`));
  // Regions stay within the file and do not run past the end of their chunk.
  assert.ok(regions.every(r => r.line >= 1 && r.endLine >= r.line && r.endLine <= lines.length && lines[r.endLine - 1] !== ''));
});
