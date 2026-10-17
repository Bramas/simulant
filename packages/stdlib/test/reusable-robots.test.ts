import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { compileSource } from '../../vite-plugin/src/index';
import { System } from '@bramas/simulant-engine/system';
import { runDet } from '@bramas/simulant-engine/system';
import { Compiler } from '@bramas/simulant-engine/compile';
import { equivarianceViolations } from '@bramas/simulant-engine/symmetry';

const source = (colors: number) => `
import "std/models.sim"
import "std/tasks.sim"
def lightsOnly : Model where
  components := [Storage.Lights ${colors}]
algorithm Cycle where
  Mem := { next : Nat }
  init i := { mem := { next := 1 } }
  step mem pub view :=
    { move := .stay, light := some mem.next, mem := { next := (mem.next + 1) % ${colors} } }
experiment cycling where
  model := lightsOnly
  algorithm := Cycle
  task := Gathering
  param N : Nat in [4]
  agents := 2
  position i := node i
`;
const file = new URL('../../../reusable-robots.sim', import.meta.url).pathname;

test('external lights support fixed palettes with more than two colors and no geometry inputs', () => {
  for (const colors of [1, 2, 3, 5]) {
    const module = compileSource(file, source(colors)).module;
    assert.deepEqual(module.diagnostics, []);
    const exp = module.experiments.cycling;
    assert.deepEqual(exp.params.map(p => p.name), ['N']);
    const system = new System(exp, { N: 4 });
    let config = system.initial()[0].config;
    assert.deepEqual(config.world, { colorCount: colors, lights: [] });
    for (let round = 1; round <= colors * 2; round++) {
      config = system.successors(config)[0].config;
      assert.deepEqual(config.world.lights, [round % colors, round % colors]);
    }
    const lean = module.lean?.cycling;
    assert.ok(lean && !('error' in lean));
    assert.match(lean.text, /import Simulant.Library.Lights/);
  }
});

test('colorView observes arbitrary color sets in palette order without multiplicity', () => {
  const module = compileSource(file, `
import "std/models.sim"
import "std/tasks.sim"
algorithm Idle where
  main :=
    stay
experiment viewTest where
  model := obliviousRing (view := colorView) (components := [Vision.Radius, Storage.Lights 5])
  algorithm := Idle
  task := Gathering
  param N : Nat in [8]
  param phi : Nat in [1]
  agents := 4
  position i := node 0
`).module;
  assert.deepEqual(module.diagnostics, []);
  const system = new System(module.experiments.viewTest, { N: 8, phi: 1 });
  const config = system.initial()[0].config;
  config.world.lights = [4, 2, 0, 2];
  const sensor = system.exp.model.sensors[0];
  const compiler = new Compiler(system.rt, system.lay, new Map(system.exp.params.map(p => [p.name, p.type])));
  const root = compiler.root(sensor.body, [['C', { k: 'config' }], ['me', { k: 'agent' }], ['frame', { k: 'frame' }]], new Map());
  assert.deepEqual(runDet(root, [config, 0, false]), [[], [0, 2, 4], []]);
});

test('out-of-palette writes are ignored and none keeps the current color', () => {
  for (const request of ['some 7', 'none']) {
    const module = compileSource(file, source(3).replace('some mem.next', request)).module;
    assert.deepEqual(module.diagnostics, []);
    const system = new System(module.experiments.cycling, { N: 4 });
    const initial = system.initial()[0].config;
    initial.world.lights = [1, 2];
    assert.deepEqual(system.successors(initial)[0].config.world.lights, [1, 2]);
  }
});

test('generic color-set observations and fixed-node crashes respect rotations and reflections', () => {
  const fixture = JSON.parse(readFileSync(new URL('../../engine/conformance/lights.json', import.meta.url), 'utf8'));
  const system = new System(fixture.experiment, fixture.params);
  assert.deepEqual(equivarianceViolations(system, fixture.states.slice(0, 6).map((s: any) => s.config), system.topo.automorphisms()), []);
});
