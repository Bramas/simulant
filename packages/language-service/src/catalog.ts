import { KEYWORDS } from '../../lang/src/parse/lexer';

export const keywords = [...KEYWORDS, 'move', 'stay', 'halt', 'wait', 'repeat', 'while', 'do', 'main',
  'visible', 'hidden', 'acts', 'never', 'adversary', 'eventually', 'always', 'output'];

export const types = ['Nat', 'Int', 'Bool', 'String', 'Unit', 'Node', 'Agent', 'Move', 'Frame', 'Config',
  'Verdict', 'Pub', 'Option', 'List', 'Multiset', 'Component', 'Model', 'Sensor', 'Topology', 'FrameModel', 'Round', 'Memory'];

/** Surface signatures, including method spellings that differ from the IR. */
export const builtins: Record<string, { signature: string; detail: string; params: string[] }> = {};
const add = (name: string, params: string[], result: string, detail: string) => {
  builtins[name] = { signature: `${name} ${params.map(p => `(${p})`).join(' ')} : ${result}`.replace('  :', ' :'), detail, params };
};
add('Ring', [], 'Topology', 'A static ring of the experiment size.');
add('DynamicRing', ['k : Nat'], 'Topology', 'At most k edges can be absent each round.');
add('Frames.common', [], 'FrameModel', 'All agents share chirality.');
add('Frames.dynamicReflection', [], 'FrameModel', 'The adversary chooses each activated agent’s orientation.');
add('Frames.persistent', ['field : Frame'], 'FrameModel', 'Uses a persistent orientation field.');
add('range', ['n : Nat'], 'List Nat', 'The numbers from 0 to n − 1.');
add('node', ['n : Nat'], 'Node', 'An absolute node; available during initialization.');
add('ofFn', ['n : Nat', 'f : Nat → α'], 'List α', 'Evaluates f at each offset below n.');
add('some', ['x : α'], 'Option α', 'An optional value.');
add('present', ['a : Agent'], 'Bool', 'True when no hidden flag is raised.');
add('correct', ['a : Agent'], 'Bool', 'True when no fault flag is raised.');
add('decisionOf', ['a : Agent'], 'Decision', 'Reads an agent’s decision in beforeMove.');
add('target', ['p : Node', 'm : Move'], 'Node', 'The node reached by a global move.');
add('advance', ['p : Node', 'm : Move', 'i : Nat'], 'Node', 'Advances i steps in a global direction.');
add('offset', ['p : Node', 'frame : Frame', 'i : Nat'], 'Node', 'The node at a local offset in a frame.');
add('toGlobal', ['frame : Frame', 'm : Move'], 'Move', 'Maps a local move through a frame.');
add('edgePresent', ['p : Node', 'm : Move'], 'Bool', 'Whether the edge is present in this round.');
add('frames', [], 'List Frame', 'The ring’s two orientations.');
add('subsets', ['xs : Collection α'], 'List (Collection α)', 'All subcollections.');
add('subsetsUpTo', ['k : Nat', 'xs : Collection α'], 'List (Collection α)', 'Subcollections with at most k elements.');
add('show', ['x : α'], 'String', 'A display string for witness labels.');
add('toInt', ['n : Nat'], 'Int', 'Converts a natural number to an integer.');
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
add('opposite', [], 'Move', 'Reverses a local direction.');

export const constructors = ['cw', 'ccw', 'stay', 'success', 'failure', 'inProgress', 'fsync', 'ssync',
  'persistent', 'oblivious', 'derived', 'none'];
