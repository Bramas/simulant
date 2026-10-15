/**
 * Signatures of the builtin functions of the IR. The engine implements the
 * same names (packages/engine/src/builtins.ts).
 */
import type { Type } from './ir';
import { isCollection, isData, showType, T, typeEq } from './types';

/** Where an expression is evaluated. */
export type Context = 'init' | 'domain' | 'sensor' | 'hook' | 'beforeMove' | 'task' | 'algorithm' | 'def';

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
  /** Breaks equivariance under rotations (absolute node numbers). */
  absolute?: boolean;
};

const err = (msg: string) => msg;

function mentionsAgent(t: Type): boolean {
  switch (t.k) {
    case 'agent': return true;
    case 'option': case 'list': case 'multiset': return mentionsAgent(t.of);
    case 'record': return t.fields.some(f => mentionsAgent(f.type));
    default: return false;
  }
}

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

const CONFIG_CONTEXTS: Context[] = ['init', 'sensor', 'hook', 'beforeMove', 'task', 'def'];

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
  /** The elements in canonical order; not for agents, which have no order. */
  toList: { arity: 1, ret: ([l]) => l.k !== 'multiset' ? err('toList: expected a Multiset') : mentionsAgent(l.of) ? err('toList: anonymous agents have no order') : T.list(l.of) },
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

  // Configurations and agents
  /** A multiset: anonymous agents have no order. */
  agents: { arity: 1, config: true, only: CONFIG_CONTEXTS, ret: ([c]) => c.k === 'config' ? T.multiset(T.agent) : err('agents: expected a Config') },
  nodes: { arity: 1, config: true, only: CONFIG_CONTEXTS, ret: ([c]) => c.k === 'config' ? T.list(T.node) : err('nodes: expected a Config') },
  size: { arity: 1, config: true, only: CONFIG_CONTEXTS, ret: ([c]) => c.k === 'config' ? T.nat : err('size: expected a Config') },
  /** No flag is raised. */
  correct: { arity: 1, config: true, ret: ([a]) => a.k === 'agent' ? T.bool : err('correct: expected an Agent') },
  /** No hidden flag is raised. */
  present: { arity: 1, config: true, ret: ([a]) => a.k === 'agent' ? T.bool : err('present: expected an Agent') },
  /** The decision of an agent this round; `decided` is false for agents that did not decide (then `move` is `stay`). */
  decisionOf: { arity: 1, config: true, only: ['beforeMove'], ret: ([a]) => a.k === 'agent' ? T.decision : err('decisionOf: expected an Agent') },

  // Topology
  /** The neighbour in a global direction (whether or not the edge is present). */
  target: { arity: 2, config: true, ret: ([n, m]) => n.k === 'node' && m.k === 'move' ? T.node : err('target: expected a Node and a Move') },
  /** The node reached from a node after `i` steps in a global direction (edges present or not). */
  advance: {
    arity: 3, config: true,
    ret: ([n, m, i]) => n.k === 'node' && m.k === 'move' && i.k === 'nat' ? T.node : err('advance: expected a Node, a Move and a Nat'),
  },
  /** Whether the edge from a node in a global direction is present in this round. */
  edgePresent: { arity: 2, config: true, ret: ([n, m]) => n.k === 'node' && m.k === 'move' ? T.bool : err('edgePresent: expected a Node and a Move') },
  /** The node seen at local offset `i` from a node, in a frame. */
  offset: {
    arity: 3, config: true,
    ret: ([n, f, i]) => n.k === 'node' && f.k === 'frame' && i.k === 'nat' ? T.node : err('offset: expected a Node, a Frame and a Nat'),
  },
  /** A local move, mapped to a global one through a frame. */
  toGlobal: { arity: 2, ret: ([f, m]) => f.k === 'frame' && m.k === 'move' ? T.move : err('toGlobal: expected a Frame and a Move') },
  opposite: { arity: 1, ret: ([m]) => m.k === 'move' ? T.move : err('opposite: expected a Move') },
  /** Every frame of the topology. */
  frames: { arity: 0, ret: () => T.list(T.frame) },
  /** Node number `n` (modulo the size). Only in initialisation. */
  node: { arity: 1, config: true, absolute: true, only: ['init', 'domain'], ret: ([n]) => n.k === 'nat' ? T.node : err('node: expected a Nat') },
};
