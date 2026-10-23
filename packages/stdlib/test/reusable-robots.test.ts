import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { compile } from '@bramas/simulant-lang/elab/elaborate';
import { nodeHost } from '@bramas/simulant-lang/elab/node';
import { Program } from '@bramas/simulant-lang/elab/program';
import type { Experiment } from '@bramas/simulant-lang/ir';
import type { Automorphism } from '@bramas/simulant-engine/space';
import { equivarianceViolations } from '@bramas/simulant-engine/symmetry';
import { System } from '@bramas/simulant-engine/system';
import { generateModel } from '@bramas/simulant-lean-gen/model';

const host = nodeHost();
function experiment(source: string, name: string): Experiment {
  const out = compile(new Program({ ...host, read: p => p === '/mem/robots.sim' ? source : host.read(p) }, '/mem/robots.sim'));
  const r = out.experiments[name];
  assert.deepEqual([...out.diagnostics, ...(r?.diagnostics ?? [])].map(d => d.message), []);
  return r!.experiment!;
}

const cycling = (colors: number, request = 'some mem.next') => experiment(`
import "std/models.sim"
algorithm Cycle where
  Mem := { next : Nat }
  init i := { mem := { next := 1 } }
  step mem pub :=
    { move := here, setLight := ${request}, mem := { next := (mem.next + 1) % ${colors} } }
experiment cycling where
  model := agentsWithMemory (Graphs.Cycle N) (Observe.radius 1) Frames.identity [] (components := [Storage.Lights ${colors}])
  algorithm := Cycle
  task := Gathering
  param N : Nat in [4]
  agents := 2
  position i := pos i
`, 'cycling');

const lights = (config: { agents: { f: Record<string, unknown> }[] }) => config.agents.map(a => a.f.light);

test('lights support fixed palettes with more than two colors and no geometry inputs', () => {
  for (const colors of [1, 2, 3, 5]) {
    const exp = cycling(colors);
    assert.deepEqual(exp.params.map(p => p.name), ['N']);
    const system = new System(exp, { N: 4 });
    let config = system.initial()[0].config;
    assert.deepEqual(config.world, { colorCount: colors });
    assert.deepEqual(lights(config), [0, 0]);
    for (let round = 1; round <= colors * 2; round++) {
      config = system.successors(config)[0].config;
      assert.deepEqual(lights(config), [round % colors, round % colors]);
    }
    // The Lean model reuses the library's component.
    assert.match(generateModel(exp, 'Cycling'), /import Simulant.Library.Lights/);
  }
});

test('colors observes the color sets of a location in palette order, without multiplicity', () => {
  const exp = experiment(`
import "std/models.sim"
algorithm Report uses colors where
  Pub := { seen : List Nat }
  init i := { pub := { seen := [] } }
  step mem pub := { move := here, pub := { seen := colors here } }
experiment viewTest where
  model := obliviousRobots (Graphs.Cycle N) (Observe.radius 1) Frames.identity [colors] (components := [Storage.Lights 5])
  algorithm := Report
  task := Gathering
  param N : Nat in [8]
  agents := 4
  position i := pos 0
`, 'viewTest');
  const system = new System(exp, { N: 8 }, { sortAgents: false });
  const config = system.initial()[0].config;
  [4, 2, 0, 2].forEach((light, i) => { config.agents[i].f.light = light; });
  const [next] = system.successors(config);
  assert.deepEqual(next.config.agents.map(a => a.pub.seen), [[0, 2, 4], [0, 2, 4], [0, 2, 4], [0, 2, 4]]);
});

test('out-of-palette writes are ignored and none keeps the current color', () => {
  for (const request of ['some 7', 'none']) {
    const system = new System(cycling(3, request), { N: 4 }, { sortAgents: false });
    const initial = system.initial()[0].config;
    initial.agents[0].f.light = 1;
    initial.agents[1].f.light = 2;
    assert.deepEqual(lights(system.successors(initial)[0].config), [1, 2]);
  }
});

test('color-set observations and crashes at a position commute with translations of the line', () => {
  const fixture = JSON.parse(readFileSync(new URL('../../engine/conformance/lights.json', import.meta.url), 'utf8'));
  const system = new System(fixture.experiment, fixture.params);
  const translations: Automorphism[] = [2, -3].map(d => ({ label: `translation ${d}`, vertex: (v: number) => v + d, ports: [0, 1] }));
  assert.deepEqual(equivarianceViolations(system, fixture.states.slice(0, 6).map((s: { config: never }) => s.config), translations), []);
});
