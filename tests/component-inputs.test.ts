import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compileSource } from '../packages/vite-plugin/src/index';
import { System } from '@bramas/simulant-engine/system';

const file = new URL('../component-inputs.sim', import.meta.url).pathname;
const source = `
import "std/models.sim"
import "std/tasks.sim"
def FixedLights : Component where
  World := { lights : List Bool, positions : List Nat }
  init := { lights := (param positions).map (fun p => false), positions := param positions }
def testModel : Model where
  components := [FixedLights]
algorithm Idle where
  init i := {}
  step mem pub view := { move := .stay }
experiment fixedLights where
  model := testModel
  algorithm := Idle
  task := Gathering
  param N : Nat := [8]
  param positions : List Nat := [[0, 2, 4]]
  agents := positions.length
  position i := node (positions.at i)
`;

test('derived component initializers reuse directly known input types regardless of field order', () => {
  const module = compileSource(file, source).module;
  assert.deepEqual(module.diagnostics, []);
  const system = new System(module.experiments.fixedLights, { N: 8, positions: [0, 2, 4] });
  assert.deepEqual(system.initial()[0].config.world.lights, [false, false, false]);
  const lean = module.lean?.fixedLights;
  assert.ok(lean && !('error' in lean));
  assert.match(lean.text, /positions : List \(Nat\)/);
  assert.doesNotMatch(lean.text, /positions : List \(Bool\)/);
});

test('transformed inputs still explain missing types when no direct initializer determines them', () => {
  const module = compileSource(file, source
    .replace('lights : List Bool, positions : List Nat', 'lights : List Bool')
    .replace(', positions := param positions', '')).module;
  assert.deepEqual(module.diagnostics, []);
  const lean = module.lean?.fixedLights;
  assert.ok(lean && 'error' in lean);
  assert.match(lean.error, /type of parameter positions is not known/);
});
