import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compileSource } from '../packages/vite-plugin/src/index';
import { parameterDefaults, parameterDomainViolations, parameterValues } from '@bramas/simulant-engine/system';

const source = `
import "std/models.sim"
algorithm Idle where
  main := stay
experiment generalDomain where
  model := obliviousRobots (Graphs.Cycle N) (Observe.radius phi) Frames.identity [occupied]
  algorithm := Idle
  task := Gathering
  param N : Nat where N ≥ 3
  param positions : List Nat where positions.length ≥ 2 ∧ positions.dedup.length % 2 = 1
  param phi : Nat where phi ≥ 1 ∧ phi < N
  agents := positions.length
  position i := pos (positions.at i)
`;
const file = new URL('../parameter-acceptance.sim', import.meta.url).pathname;
const out = compileSource(file, source).module;
const exp = out.experiments.generalDomain;
const finiteSource = source
  .replace('Nat where N ≥ 3', 'Nat in [1, 3, 4] where N ≥ 3')
  .replace('List Nat where', 'List Nat in [[0, 0], [0, 1]] where')
  .replace('Nat where phi ≥ 1', 'Nat in [1, 2] where phi ≥ 1');

test('predicate-only parameter domains accept arbitrary matching values and survive JSON', () => {
  assert.deepEqual(out.diagnostics, []);
  assert.ok(exp);
  const valid = { N: 20, positions: [1, 4, 8], phi: 12 };
  assert.deepEqual(parameterDomainViolations(exp, valid), []);
  assert.deepEqual(parameterDomainViolations(exp, { N: 2, positions: [0, 1], phi: 3 }), ['N', 'positions', 'phi']);
  assert.deepEqual(parameterDomainViolations(JSON.parse(JSON.stringify(exp)), valid), []);
  assert.throws(() => [...parameterValues(exp)], /N has no finite domain.*project.ts/);
});

test('finite domains stay exact with where refinements; enumeration and warnings agree', () => {
  const module = compileSource(file, finiteSource).module;
  assert.deepEqual(module.diagnostics, []);
  const finite = module.experiments.generalDomain;
  assert.deepEqual([...parameterValues(finite)], [
    { N: 3, positions: [0, 0], phi: 1 }, { N: 3, positions: [0, 0], phi: 2 },
    { N: 4, positions: [0, 0], phi: 1 }, { N: 4, positions: [0, 0], phi: 2 },
  ]);
  assert.deepEqual(parameterDomainViolations(finite, { N: 20, positions: [1, 4, 8], phi: 12 }), ['N', 'positions', 'phi']);
  for (const setting of parameterValues(finite)) assert.deepEqual(parameterDomainViolations(finite, setting), []);
});

test('the space of the current setting is available to domain predicates', () => {
  const module = compileSource(file, finiteSource.replace('N ≥ 3', 'N ≥ 3 ∧ pos (N - 1) ≠ pos 0')).module;
  assert.deepEqual(module.diagnostics, []);
  assert.equal([...parameterValues(module.experiments.generalDomain)].length, 4);
});

test('simulator defaults search matching values, backtrack finite domains and honor overrides', () => {
  const defaults = parameterDefaults(exp, { positions: [0, 0] });
  assert.deepEqual(defaults, { N: 3, positions: [0, 0], phi: 1 });
  assert.deepEqual(parameterDomainViolations(exp, defaults), []);
  const finite = compileSource(file, finiteSource.replace('where N ≥ 3', 'where N ≥ 1').replace('in [1, 2]', 'in [2]')).module.experiments.generalDomain;
  assert.deepEqual(parameterDefaults(finite), { N: 3, positions: [0, 0], phi: 2 });
  assert.deepEqual(parameterDefaults(exp, { N: 20, positions: [0, 2, 4], phi: 12 }), { N: 20, positions: [0, 2, 4], phi: 12 });
  // Explicit project defaults remain advisory even when outside the model domain.
  assert.equal(parameterDefaults(finite, { N: 20 }).N, 20);
});

test('complex or unsatisfied predicates fall back to editable typed values', () => {
  assert.deepEqual(parameterDefaults(exp), { N: 3, positions: [], phi: 1 });
  const hard = compileSource(file, source.replace('N ≥ 3', 'N ≥ 100000')).module.experiments.generalDomain;
  assert.deepEqual(parameterDefaults(hard), { N: 0, positions: [], phi: 0 });
});

test('default searches only use positions of the selected space', () => {
  const nodeSource = source.replace('param positions : List Nat', 'param site : Pos where site ≠ pos 0\n  param positions : List Nat');
  const module = compileSource(file, nodeSource).module;
  assert.deepEqual(module.diagnostics, []);
  assert.deepEqual(parameterDefaults(module.experiments.generalDomain, { positions: [0, 0] }), { N: 3, site: 1, positions: [0, 0], phi: 1 });
  const emptyNodeDomain = compileSource(file, nodeSource.replace('site ≠ pos 0', 'site ≠ pos 0 ∧ site ≠ pos 1 ∧ site ≠ pos 2')).module.experiments.generalDomain;
  // The three-vertex cycle has no matching position, so use the editable fallback.
  assert.equal(parameterDefaults(emptyNodeDomain, { N: 3, positions: [0, 0] }).site, 0);
});

test('domain predicates are Boolean, deterministic and cannot refer to later parameters', () => {
  for (const predicate of ['N + 1', 'choose [true, false]', 'phi > 0']) {
    const module = compileSource(file, source.replace('N ≥ 3', predicate)).module;
    assert.ok(module.diagnostics.length, predicate);
  }
});

test('Lean statements preserve predicate-only domains and finite-domain intersections', () => {
  const lean = out.lean?.generalDomain;
  assert.ok(lean && !('error' in lean));
  assert.match(lean.text, /def accepts_positions/);
  const statement = lean.text.slice(lean.text.indexOf('def Statement'));
  assert.match(statement, /accepts_N N = true →/);
  assert.match(statement, /accepts_positions N positions = true →/);
  assert.doesNotMatch(statement, /∈ domain_/);
  const finite = compileSource(file, finiteSource).module.lean?.generalDomain;
  assert.ok(finite && !('error' in finite));
  assert.match(finite.text.slice(finite.text.indexOf('def Statement')), /N ∈ domain_N\s+→ accepts_N N = true →/);
  assert.match(finite.text.slice(finite.text.indexOf('def Statement')), /positions ∈ domain_positions N → accepts_positions N positions = true →/);
});
