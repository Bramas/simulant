/**
 * Signatures of the builtin functions of the IR. The engine implements the
 * same names (packages/engine/src/builtins.ts).
 */
import type { Type } from './ir';
import { isCollection, isData, mentions, showType, T, typeEq } from './types';

/** Where an expression is evaluated. `space`: vertex lists and neighbor functions of a space. */
export type Context = 'init' | 'domain' | 'sensor' | 'hook' | 'beforeMove' | 'task' | 'algorithm' | 'def' | 'space';

export type Signature = {
  /** Number of arguments; `undefined` means at least one. */
  arity?: number;
  /** Parameter types of the lambda passed at a position, from the arguments before it. */
  lambdas?: Record<number, (before: Type[]) => Type[] | string>;
  ret: (args: Type[]) => Type | string;
  /** Contexts where the builtin is allowed (default: all). */
  only?: Context[];
  /** Reads the configuration in scope. */
  config?: boolean;
  /** Reads the agent's Look: allowed in algorithms and algorithm-local definitions. */
  look?: boolean;
};

const err = (msg: string) => msg;

function same(name: string) {
  return ([a, b]: Type[]) => typeEq(a, b) ? (isData(a) ? T.bool : err(`${name}: cannot compare ${showType(a)}`))
    : err(`${name}: ${showType(a)} and ${showType(b)} differ`);
}

function numeric(name: string, ret?: Type) {
  return (args: Type[]) => {
    const t = args[0];
    if (t.k !== 'nat' && t.k !== 'int') return err(`${name}: expected Nat or Int, got ${showType(t)}`);
    if (!args.every(a => typeEq(a, t))) return err(`${name}: arguments must have the same type`);
    return ret ?? t;
  };
}

/** Numbers, or lists of Bool or Nat in lexicographic order (`false < true`, a prefix first), as in Lean. */
function ordered(name: string) {
  return (args: Type[]) => {
    const [a, b] = args;
    if (a.k === 'list' && (a.of.k === 'bool' || a.of.k === 'nat')) {
      return typeEq(a, b) ? T.bool : err(`${name}: ${showType(a)} and ${showType(b)} differ`);
    }
    return numeric(name, T.bool)(args);
  };
}

function bools(name: string) {
  return (args: Type[]) => args.every(a => a.k === 'bool') ? T.bool : err(`${name}: expected Bool arguments`);
}

function collection(name: string, t: Type) {
  return isCollection(t) ? undefined : err(`${name}: expected a List or Multiset, got ${showType(t)}`);
}

const elem = (name: string) => ([l]: Type[]) => collection(name, l) ?? [(l as { of: Type }).of];

function predicate(name: string, ret: (l: Type) => Type) {
  return {
    arity: 2,
    lambdas: { 1: elem(name) },
    ret: ([l, f]: Type[]) => collection(name, l)
      ?? (f.k === 'fn' && f.ret.k === 'bool' ? ret(l) : err(`${name}: expected a predicate`)),
  } satisfies Signature;
}

const CONFIG_CONTEXTS: Context[] = ['init', 'hook', 'beforeMove', 'task', 'def'];

export const BUILTINS: Record<string, Signature> = {
  // Logic and comparison
  not: { arity: 1, ret: bools('not') },
  and: { ret: bools('and') },
  or: { ret: bools('or') },
  implies: { arity: 2, ret: bools('implies') },
  eq: { arity: 2, ret: same('eq') },
  ne: { arity: 2, ret: same('ne') },
  lt: { arity: 2, ret: ordered('lt') },
  le: { arity: 2, ret: ordered('le') },
  gt: { arity: 2, ret: ordered('gt') },
  ge: { arity: 2, ret: ordered('ge') },

  // Arithmetic, following Lean: subtraction and division on Nat are truncated.
  add: { arity: 2, ret: numeric('add') },
  sub: { arity: 2, ret: numeric('sub') },
  mul: { arity: 2, ret: numeric('mul') },
  div: { arity: 2, ret: numeric('div') },
  mod: { arity: 2, ret: numeric('mod') },
  min: { arity: 2, ret: numeric('min') },
  max: { arity: 2, ret: numeric('max') },
  toInt: { arity: 1, ret: ([a]) => a.k === 'nat' ? T.int : err('toInt: expected Nat') },

  // Options
  some: { arity: 1, ret: ([a]) => T.option(a) },
  isSome: { arity: 1, ret: ([o]) => o.k === 'option' ? T.bool : err('isSome: expected an Option') },
  isNone: { arity: 1, ret: ([o]) => o.k === 'option' ? T.bool : err('isNone: expected an Option') },
  getD: {
    arity: 2,
    ret: ([o, d]) => o.k === 'option' && typeEq(o.of, d) ? d : err('getD: expected an Option and a default of its type'),
  },

  // Collections (List and Multiset)
  length: { arity: 1, ret: ([l]) => collection('length', l) ?? T.nat },
  isEmpty: { arity: 1, ret: ([l]) => collection('isEmpty', l) ?? T.bool },
  filter: predicate('filter', l => l),
  any: predicate('any', () => T.bool),
  all: predicate('all', () => T.bool),
  count: predicate('count', () => T.nat),
  map: {
    arity: 2,
    lambdas: { 1: elem('map') },
    ret: ([l, f]) => collection('map', l) ?? (f.k === 'fn' ? { k: (l as { k: 'list' | 'multiset' }).k, of: f.ret } as Type : err('map: expected a function')),
  },
  sum: { arity: 1, ret: ([l]) => isCollection(l) && l.of.k === 'nat' ? T.nat : err('sum: expected a collection of Nat') },
  mem: { arity: 2, ret: ([x, l]) => collection('mem', l) ?? (typeEq(x, (l as { of: Type }).of) ? T.bool : err('mem: element type differs')) },
  range: { arity: 1, ret: ([n]) => n.k === 'nat' ? T.list(T.nat) : err('range: expected Nat') },
  toMultiset: { arity: 1, ret: ([l]) => l.k === 'list' ? T.multiset(l.of) : err('toMultiset: expected a List') },
  /** The elements in canonical order; not for agents, which have no order, nor locations, ordered only by the Look. */
  toList: {
    arity: 1,
    ret: ([l]) => l.k !== 'multiset' ? err('toList: expected a Multiset')
      : mentions(l.of, 'agent') ? err('toList: anonymous agents have no order')
      : mentions(l.of, 'loc') ? err('toList: locations are ordered only by the Look (visible, neighbors)')
      : T.list(l.of),
  },
  /** All sub-collections, smallest first. */
  subsets: { arity: 1, ret: ([l]) => collection('subsets', l) ?? T.list(l) },
  /** Sub-collections with at most `k` elements. */
  subsetsUpTo: {
    arity: 2,
    ret: ([l, k]) => collection('subsetsUpTo', l) ?? (k.k === 'nat' ? T.list(l) : err('subsetsUpTo: expected a Nat bound')),
  },
  /** Removes repeated elements. */
  dedup: { arity: 1, ret: ([l]) => collection('dedup', l) ?? l },
  /** Multiset difference. */
  diff: { arity: 2, ret: ([a, b]) => a.k === 'multiset' && typeEq(a, b) ? a : err('diff: expected two Multisets of the same type') },
  /** `[a, b, c]` (an empty list is a literal). */
  list: { ret: args => args.every(a => typeEq(a, args[0])) ? T.list(args[0]) : err('list: elements of different types') },
  at: { arity: 2, ret: ([l, i]) => l.k === 'list' && i.k === 'nat' ? l.of : err('at: expected a List and a Nat') },
  append: { arity: 2, ret: ([a, b]) => isCollection(a) && typeEq(a, b) ? a : err('append: expected two collections of the same type') },
  ofFn: {
    arity: 2,
    lambdas: { 1: () => [T.nat] },
    ret: ([n, f]) => n.k === 'nat' && f.k === 'fn' ? T.list(f.ret) : err('ofFn: expected a Nat and a function'),
  },

  // Labels
  show: { arity: 1, ret: () => T.string },
  concat: { ret: args => args.every(a => a.k === 'string') ? T.string : err('concat: expected strings') },

  toNat: { arity: 1, ret: ([a]) => a.k === 'int' ? T.nat : err('toNat: expected Int') },

  // Configurations and agents
  /** A multiset: anonymous agents have no order. */
  agents: { arity: 1, config: true, only: CONFIG_CONTEXTS, ret: ([c]) => c.k === 'config' ? T.multiset(T.agent) : err('agents: expected a Config') },
  /** No flag is raised. */
  correct: { arity: 1, config: true, ret: ([a]) => a.k === 'agent' ? T.bool : err('correct: expected an Agent') },
  /** No hidden flag is raised. */
  present: { arity: 1, config: true, ret: ([a]) => a.k === 'agent' ? T.bool : err('present: expected an Agent') },
  /** The decision of an agent this round; `decided` is false for agents that did not decide (then `target` is its position). */
  decisionOf: { arity: 1, config: true, only: ['beforeMove', 'def'], ret: ([a]) => a.k === 'agent' ? T.decision : err('decisionOf: expected an Agent') },
  /** The neighbor of `a.pos` behind the agent's port `i`, in its kept frame (Frames.identity, .perRobot). */
  resolve: {
    arity: 3, config: true, only: CONFIG_CONTEXTS,
    ret: ([c, a, i]) => c.k === 'config' && a.k === 'agent' && i.k === 'nat' ? T.pos : err('resolve: expected an Agent and a port'),
  },
  /** The position reached from `a.pos` by taking the agent's port `i` `k` times, in its kept frame. */
  follow: {
    arity: 4, config: true, only: CONFIG_CONTEXTS,
    ret: ([c, a, i, k]) => c.k === 'config' && a.k === 'agent' && i.k === 'nat' && k.k === 'nat' ? T.pos : err('follow: expected an Agent, a port and a number of steps'),
  },

  // Positions (experiments and spaces only build them; others compare and pass them)
  /** The position of a vertex of the space. Only in initial values and domains. */
  pos: { arity: 1, only: ['init', 'domain'], ret: () => T.pos },
  /** Every position of a finite space, in vertex order. */
  positions: { arity: 0, only: [...CONFIG_CONTEXTS, 'domain'], ret: () => T.list(T.pos) },

  // The Look, inside sensors
  /** The agents at the position behind a location. */
  occupants: { arity: 2, only: ['sensor', 'def'], ret: ([L, l]) => L.k === 'look' && l.k === 'loc' ? T.multiset(T.agent) : err('occupants: expected a location') },
  /** The position behind a location: only inside sensors, whose results contain no position. */
  position: { arity: 2, only: ['sensor', 'def'], ret: ([L, l]) => L.k === 'look' && l.k === 'loc' ? T.pos : err('position: expected a location') },
  /** Whether the edge between two locations is present this round (dynamic spaces). */
  edgePresent: {
    arity: 3, only: ['sensor', 'def'],
    ret: ([L, a, b]) => L.k === 'look' && a.k === 'loc' && b.k === 'loc' ? T.bool : err('edgePresent: expected two locations'),
  },

  // The Look, inside algorithms
  /** The observing agent's location. */
  here: { arity: 0, look: true, only: ['algorithm', 'def'], ret: () => T.loc },
  /** The visible locations, in the order of the reference ordering and the morphism. */
  visible: { arity: 0, look: true, only: ['algorithm', 'def'], ret: () => T.list(T.loc) },
  /** The neighbors of a location in the visible domain (in port order at `here` when the frames keep ports). */
  neighbors: { arity: 1, look: true, only: ['algorithm', 'def'], ret: ([l]) => l.k === 'loc' ? T.list(T.loc) : err('neighbors: expected a location') },
  /** The distance between two locations within the visible domain. */
  distance: { arity: 2, look: true, only: ['algorithm', 'def'], ret: ([a, b]) => a.k === 'loc' && b.k === 'loc' ? T.nat : err('distance: expected two locations') },
};
