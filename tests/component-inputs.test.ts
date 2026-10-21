import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compileSource } from '../packages/vite-plugin/src/index';
import { System } from '@bramas/simulant-engine/system';

const file = new URL('../component-inputs.sim', import.meta.url).pathname;
const source = `
import "std/models.sim"
def FixedLights : Component where
  World := { lights : List Bool, positions : List Nat }
  init := { lights := (param positions).map (fun p => false), positions := param positions }
algorithm Idle where
  main := stay
experiment fixedLights where
  model := robots (Graphs.Cycle N) (Observe.radius 1) Frames.identity [] (components := [FixedLights])
  algorithm := Idle
  task := Gathering
  param N : Nat in [8]
  param positions : List Nat in [[0, 2, 4]]
  agents := positions.length
  position i := pos (positions.at i)
`;

test('derived component initializers reuse directly known input types regardless of field order', () => {
  const module = compileSource(file, source).module;
  assert.deepEqual(module.diagnostics, []);
  const system = new System(module.experiments.fixedLights, { N: 8, positions: [0, 2, 4] });
  assert.deepEqual(system.initial()[0].config.world.lights, [false, false, false]);
});

const lean = { skip: 'the Lean generator is ported in Phase 0 step 6' };

test('Lean statements type component inputs from their direct initializers', lean, () => {
  const out = compileSource(file, source).module.lean?.fixedLights;
  assert.ok(out && !('error' in out));
  assert.match(out.text, /positions : List \(Nat\)/);
  assert.doesNotMatch(out.text, /positions : List \(Bool\)/);
});

test('transformed inputs still explain missing types when no direct initializer determines them', lean, () => {
  const module = compileSource(file, source
    .replace('lights : List Bool, positions : List Nat', 'lights : List Bool')
    .replace(', positions := param positions', '')).module;
  assert.deepEqual(module.diagnostics, []);
  const out = module.lean?.fixedLights;
  assert.ok(out && 'error' in out);
  assert.match(out.error, /type of parameter positions is not known/);
});
