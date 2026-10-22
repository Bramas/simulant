import { KEYWORDS } from '../../lang/src/parse/lexer';

export const keywords = [...KEYWORDS, 'move', 'stay', 'halt', 'wait', 'repeat', 'while', 'do', 'main',
  'visible', 'hidden', 'acts', 'never', 'adversary', 'eventually', 'always', 'output'];

export const types = ['Nat', 'Int', 'Bool', 'String', 'Unit', 'Pos', 'Loc', 'Look', 'Agent', 'Config', 'Decision',
  'Verdict', 'Pub', 'Option', 'List', 'Multiset', 'Component', 'Model', 'Sensor', 'Space', 'Observation', 'Frames',
  'Round', 'Memory', 'Movement', 'Symmetries'];

/** Surface signatures, including method spellings that differ from the IR. */
export const builtins: Record<string, { signature: string; detail: string; params: string[] }> = {};
const add = (name: string, params: string[], result: string, detail: string) => {
  builtins[name] = { signature: `${name} ${params.map(p => `(${p})`).join(' ')} : ${result}`.replace('  :', ' :'), detail, params };
};
// Model level (docs/sim-language.md, "Two levels").
add('Graphs.Dynamic', ['base : Space', 'missing : Nat'], 'Space', 'The adversary removes up to `missing` edges of `base` each round.');
add('Observe.full', [], 'Observation', 'Every position and edge (finite spaces).');
add('Observe.radius', ['r : Nat'], 'Observation', 'The r-hop view: positions at distance ≤ r, edges with an endpoint closer than r.');
add('Frames.isomorphisms', [], 'Frames', 'Any isomorphism of the view fixing the observer, chosen at each Look.');
add('Frames.identity', [], 'Frames', 'The ports as they are (common chirality, port labels).');
add('Frames.portPermutations', ['when : .perLook | .perRobot'], 'Frames', 'The ports through a permutation, at each Look or fixed per robot (`among := .all` or `.symmetries`).');
add('Cycle.dihedral', ['n : Nat'], 'Automorphisms', 'Rotations and reflections of the cycle.');
// The Look, in algorithms and algorithm-local definitions.
add('here', [], 'Loc', 'The agent’s own location.');
add('visible', [], 'List Loc', 'The locations of the Look, in its order.');
add('neighbors', ['l : Loc'], 'List Loc', 'The neighbors of a location, in the Look’s order (ports, under port-based frames).');
add('distance', ['a : Loc', 'b : Loc'], 'Nat', 'The distance within the visible domain.');
// Positions, agents and configurations (sensors, components, tasks, initialization).
add('pos', ['v : Vertex'], 'Pos', 'The position of a vertex; available in experiments and model arguments.');
add('positions', [], 'List Pos', 'Every position of a finite space.');
add('present', ['a : Agent'], 'Bool', 'True when no hidden flag is raised.');
add('correct', ['a : Agent'], 'Bool', 'True when no fault flag is raised.');
add('decisionOf', ['a : Agent'], 'Decision', 'Reads an agent’s decision in beforeMove: `decided`, `target` and its actions.');
add('resolve', ['a : Agent', 'i : Nat'], 'Pos', 'The neighbor behind the agent’s port i, in its kept frame (written `C.resolve a i`).');
add('follow', ['a : Agent', 'i : Nat', 'k : Nat'], 'Pos', 'The position after k steps through the agent’s port i (written `C.follow a i k`).');
add('occupants', ['l : Loc'], 'Multiset Agent', 'The agents at a location (written `L.occupants l`).');
add('position', ['l : Loc'], 'Pos', 'The position behind a location, for sensors (written `L.position l`).');
add('edgePresent', ['a : Loc', 'b : Loc'], 'Bool', 'Whether the edge between two locations is present this round (written `L.edgePresent a b`).');
// Values.
add('range', ['n : Nat'], 'List Nat', 'The numbers from 0 to n − 1.');
add('ofFn', ['n : Nat', 'f : Nat → α'], 'List α', 'Evaluates f at each index below n.');
add('some', ['x : α'], 'Option α', 'An optional value.');
add('subsets', ['xs : Collection α'], 'List (Collection α)', 'All subcollections.');
add('subsetsUpTo', ['k : Nat', 'xs : Collection α'], 'List (Collection α)', 'Subcollections with at most k elements.');
add('show', ['x : α'], 'String', 'A display string for witness labels.');
add('toInt', ['n : Nat'], 'Int', 'Converts a natural number to an integer.');
add('toNat', ['n : Int'], 'Nat', 'Converts an integer to a natural number (0 below zero).');
for (const name of ['min', 'max']) add(name, ['a : Number', 'b : Number'], 'Number', `The ${name}imum of two numbers.`);
for (const name of ['filter', 'any', 'all', 'count', 'map']) {
  add(name, ['f : α → β'], name === 'filter' || name === 'map' ? 'Collection' : name === 'count' ? 'Nat' : 'Bool', 'A collection method; the receiver is written before the dot.');
}
for (const name of ['length', 'card', 'isEmpty', 'sum', 'dedup', 'toList', 'toMultiset']) {
  add(name, [], 'Value', 'A collection method; the receiver is written before the dot.');
}
for (const name of ['at', 'contains', 'diff']) add(name, ['x : Value'], 'Value', 'A collection method.');
for (const name of ['isSome', 'isNone']) add(name, [], 'Bool', 'Tests an optional value.');
add('getD', ['default : α'], 'α', 'Uses a default when an option is none.');

export const constructors = ['success', 'failure', 'inProgress', 'fsync', 'ssync', 'sequential',
  'persistent', 'oblivious', 'derived', 'none', 'perLook', 'perRobot', 'all', 'symmetries', 'alongEdges',
  'translationsAndReflection', 'computed'];
