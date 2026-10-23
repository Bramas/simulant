/**
 * Spaces, Looks and symmetry of the generic core (docs/core-redesign.md, sections 2, 3 and 7).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { explore } from '@bramas/simulant-engine/explorer';
import {
  isomorphicPresentation, portPresentation, rootedAutomorphisms, SpaceRuntime, viewAround, type Automorphism,
} from '@bramas/simulant-engine/space';
import { equivarianceViolations, Symmetry } from '@bramas/simulant-engine/symmetry';
import { System } from '@bramas/simulant-engine/system';
import { experimentOf, libraryExperiments } from './compile';

const cycle = (n: number, auto: 'computed' | 'dihedral' = 'computed') => new SpaceRuntime('cycle', Array.from({ length: n }, (_, i) => i),
  v => [(v + 1) % n, (v + n - 1) % n], auto === 'dihedral' ? { kind: 'dihedral', n } : { kind: 'computed' });
const line = new SpaceRuntime('line', undefined, v => [v + 1, v - 1], { kind: 'translationsAndReflection' });
const star = (k: number) => new SpaceRuntime('star', Array.from({ length: k + 1 }, (_, i) => i),
  v => v === 0 ? Array.from({ length: k }, (_, i) => i + 1) : [0], { kind: 'computed' });

test('edge presence requires a neighbor, including when no edges are missing', () => {
  const space = cycle(5);
  for (const state of [[], ['2|3|0']]) {
    assert.equal(space.edgePresent(state, 0, 0), false);
    assert.equal(space.edgePresent(state, 0, 2), false);
    assert.equal(space.edgePresent(state, 0, 1), true);
  }
  assert.equal(space.edgePresent(['0|1|0'], 0, 1), false);
  assert.equal(space.edgePresent(['0|1|0'], 1, 0), false);
  const parallel = cycle(2);
  assert.equal(parallel.edgePresent(['0|1|0'], 0, 1), true);
  assert.equal(parallel.edgePresent(['0|1|0', '0|1|1'], 0, 1), false);
});

test('edgeTo distinguishes neighbors from other visible locations in every dynamic branch', () => {
  const exp = libraryExperiments('conformance.sim').edgePresence;
  const system = new System(exp, { N: 5 });
  const initial = system.initial()[0].config;
  assert.deepEqual(system.successors(initial).map(s => s.config.agents[0].pub.edges), [
    [false, true, true, false, false],
    [false, false, true, false, false],
    [false, true, false, false, false],
  ]);
});

test('the r-hop view drops edges between positions both at distance r', () => {
  // In a triangle, radius 1 shows the observer joined to its two neighbors, not the edge between them.
  const triangle = viewAround(cycle(3), 0, 1);
  assert.deepEqual(triangle.vertices, [0, 1, 2]);
  assert.deepEqual(triangle.edges.map(es => es.length), [2, 1, 1]);
  // Hence the view of a triangle looks like the view of a longer cycle.
  assert.equal(rootedAutomorphisms(triangle).length, rootedAutomorphisms(viewAround(cycle(7), 3, 1)).length);
  // A full view of a cycle closes it; so does a radius r with 2r ≥ n.
  assert.deepEqual(viewAround(cycle(4), 0, 2).edges.map(es => es.length), [2, 2, 2, 2]);
  assert.deepEqual(viewAround(cycle(5), 0, 2).edges.map(es => es.length), [2, 2, 2, 1, 1]);
});

test('isomorphisms of a view fixing the observer: 2 on lines and cycles, k! at the center of a star', () => {
  assert.equal(rootedAutomorphisms(viewAround(line, 0, 3)).length, 2);
  assert.equal(rootedAutomorphisms(viewAround(cycle(6), 2, Infinity)).length, 2);
  assert.equal(rootedAutomorphisms(viewAround(star(3), 0, 1)).length, 6);
  assert.equal(rootedAutomorphisms(viewAround(star(3), 1, 2)).length, 2);
});

test('presentations: locations ordered by the reference ordering and a morphism, or by ports', () => {
  const view = viewAround(line, 10, 1);
  const [id, mirror] = rootedAutomorphisms(view).map((s, j) => isomorphicPresentation(view, s, String(j)));
  const vertexAt = (p: typeof id, l: number) => view.vertices[p.order[l]];
  // The identity lists the neighbors of the observer in vertex order; the mirror image, reversed.
  const here = (p: typeof id) => p.order.indexOf(0);
  assert.deepEqual(id.nbrs[here(id)].map(l => vertexAt(id, l)), [9, 11]);
  assert.deepEqual(mirror.nbrs[here(mirror)].map(l => vertexAt(mirror, l)), [11, 9]);
  // Under ports, the observer is location 0 and its neighbors follow its (permuted) ports.
  const ports = portPresentation(view, [1, 0], '');
  assert.equal(ports.order[0], 0);
  assert.deepEqual(ports.nbrs[0].map(l => vertexAt(ports, l)), [9, 11]);
});

test('the fast paths agree with the computed automorphisms of cycles, ports included', () => {
  const show = (g: Automorphism, vs: number[]) => `${vs.map(v => g.vertex(v)).join(',')}/${g.ports?.join('') ?? '-'}`;
  for (let n = 3; n <= 7; n++) {
    const vs = Array.from({ length: n }, (_, i) => i);
    const computed = cycle(n).group();
    const fast = cycle(n, 'dihedral').group();
    assert.ok(computed.kind === 'finite' && fast.kind === 'finite');
    assert.deepEqual(fast.elements.map(g => show(g, vs)).sort(), computed.elements.map(g => show(g, vs)).sort(), `n = ${n}`);
  }
  // The two-node cycle has two parallel edges: its reflection fixes both vertices and swaps the ports.
  const two = new SpaceRuntime('cycle', [0, 1], v => [(v + 1) % 2, (v + 1) % 2], { kind: 'dihedral', n: 2 }).group();
  assert.ok(two.kind === 'finite');
  assert.deepEqual(two.elements.map(g => show(g, [0, 1])), ['0,1/01', '1,0/01', '0,1/10', '1,0/10']);
});

test('the line has no vertex list: its group canonicalizes by translation and mirror image', () => {
  const lights = libraryExperiments('conformance.sim').lights;
  const system = new System(lights, { positions: [0, 0, 2], phi: 1, crashNode: 1 });
  const shifted = new System(lights, { positions: [7, 7, 9], phi: 1, crashNode: 8 });
  const mirrored = new System(lights, { positions: [-2, 0, 0], phi: 1, crashNode: -1 });
  const sym = new Symmetry(system);
  const key = (s: System) => sym.canonical(s.initial()[0].config).key;
  assert.equal(key(shifted), key(system));
  assert.equal(key(mirrored), key(system));
  assert.equal(sym.size, 2);
  // Translations commute with the round.
  const translations: Automorphism[] = [3, -5].map(d => ({ label: `translation ${d}`, vertex: (v: number) => v + d, ports: [0, 1] }));
  const configs = [system.initial()[0].config, ...system.successors(system.initial()[0].config).map(s => s.config)];
  assert.deepEqual(equivarianceViolations(system, configs, translations), []);
});

test('reduced and unreduced explorations agree on every conformance experiment', () => {
  const experiments = libraryExperiments('conformance.sim');
  const dir = new URL('../conformance/', import.meta.url);
  for (const file of ['black-hole-emerging', 'black-hole-crash-stop', 'black-hole-lossy', 'two-node-cycle', 'gathering-with-crash',
    'dynamic-ring', 'own-orientation', 'port-permutations', 'ssync', 'sequential', 'star-gathering', 'star-dispersion']) {
    const fixture = JSON.parse(readFileSync(new URL(`${file}.json`, dir), 'utf8'));
    const exp = experiments[Object.keys(experiments).find(n => fixture.experiment.name === n)!] ?? fixture.experiment;
    const limits = { maxStates: 20000 };
    const reduced = explore(new System(exp, fixture.params), limits);
    const unreduced = explore(new System(exp, fixture.params), { ...limits, symmetry: false });
    assert.equal(reduced.status, unreduced.status, file);
    assert.ok(reduced.stats.states <= unreduced.stats.states, `${file}: ${reduced.stats.states} ≤ ${unreduced.stats.states}`);
  }
  // On the infinite line, robots that drift apart reach infinitely many configurations even up to
  // translation; to a bounded depth, the reduced graph is smaller.
  const lights = JSON.parse(readFileSync(new URL('lights.json', dir), 'utf8'));
  const reduced = explore(new System(experiments.lights, lights.params), { maxDepth: 4 });
  const unreduced = explore(new System(experiments.lights, lights.params), { maxDepth: 4, symmetry: false });
  assert.deepEqual([reduced.status, unreduced.status], ['incomplete', 'incomplete']);
  assert.ok(reduced.stats.states < unreduced.stats.states, `${reduced.stats.states} < ${unreduced.stats.states}`);
});

test('the star witnesses: gathering at the center succeeds; dispersion has a lasso', () => {
  const experiments = libraryExperiments('conformance.sim');
  assert.equal(explore(new System(experiments.starGathering, { k: 4, start: [1, 3, 3] })).status, 'success');
  const r = explore(new System(experiments.starDispersion, { k: 3 }));
  assert.equal(r.status, 'failure');
  assert.equal(r.counterexample?.kind, 'lasso');
});

test('a move to a location that is not a neighbor is an error', () => {
  const exp = experimentOf(`import "std/models.sim"
algorithm Jump uses occupied where
  main :=
    move ((visible.filter fun l => distance here l = 2).at 0)
experiment e where
  model := obliviousRobots (Graphs.Cycle N) Observe.full Frames.isomorphisms [occupied]
  algorithm := Jump
  task := Gathering
  param N : Nat
  agents := 1
  position i := pos 0
`, 'e');
  const sys = new System(exp, { N: 6 });
  assert.throws(() => sys.successors(sys.initial()[0].config), /not a neighbor/);
});

test('per-robot port permutations are chosen at initialization and kept', () => {
  const own = libraryExperiments('conformance.sim').ownOrientation;
  const sys = new System(own, { N: 4, positions: [0, 1] });
  // Each robot's own orientation: 2 × 2 initial configurations, fewer up to the anonymity of agents.
  const initial = sys.initial();
  assert.ok(initial.length >= 3, String(initial.length));
  for (const s of initial) for (const a of s.config.agents) assert.ok(a.frame && a.frame.length === 2);
  const after = sys.successors(initial[0].config)[0].config;
  assert.deepEqual(after.agents.map(a => a.frame?.join('')).sort(), initial[0].config.agents.map(a => a.frame?.join('')).sort());
});
