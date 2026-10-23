/**
 * TypeScript API for constructing IR independently of the `.sim` frontend.
 * Used by conformance and unit tests, including the hand-written standard
 * library counterparts in packages/stdlib/test/helpers (see packages/stdlib/README.md).
 *
 * Expressions are wrapped in proxies: reading a property builds a field
 * access (`a.pos`), and the methods below build builtin calls
 * (`agents(C).filter(b => b.pos.eq(C.world.site))`).
 */
import type {
  Action, Algorithm, Automorphisms, Component, Experiment, Expr, Field, Flag, Frames, Goal, Json, Model, Observation, Param,
  Sensor, Space, Task, Type,
} from './ir';
import { IR_VERSION } from './ir';
import { T } from './types';

export type Arg = X | boolean | number;

/** An expression under construction. Unknown properties are field accesses. */
export interface X {
  readonly ir: Expr;
  readonly [field: string]: any;
  // logic and comparison
  not(): X;
  and(...xs: Arg[]): X;
  or(...xs: Arg[]): X;
  implies(x: Arg): X;
  eq(x: Arg): X;
  ne(x: Arg): X;
  lt(x: Arg): X;
  le(x: Arg): X;
  gt(x: Arg): X;
  ge(x: Arg): X;
  // arithmetic
  add(x: Arg): X;
  sub(x: Arg): X;
  mul(x: Arg): X;
  div(x: Arg): X;
  mod(x: Arg): X;
  // options
  isSome(): X;
  isNone(): X;
  getD(d: Arg): X;
  // collections
  length(): X;
  isEmpty(): X;
  filter(f: (x: X) => Arg): X;
  map(f: (x: X) => Arg): X;
  any(f: (x: X) => Arg): X;
  all(f: (x: X) => Arg): X;
  count(f: (x: X) => Arg): X;
  sum(): X;
  has(x: Arg): X;
  at(i: Arg): X;
  append(x: Arg): X;
  diff(x: Arg): X;
  toMultiset(): X;
  toList(): X;
  dedup(): X;
  // records
  with(fields: Record<string, Arg>): X;
}

/** Nesting depth of lambdas under construction: parameter names depend only on it, so the IR is reproducible. */
let depth = 0;

export function ir(x: Arg): Expr {
  if (typeof x === 'boolean') return { e: 'lit', type: T.bool, value: x };
  if (typeof x === 'number') {
    if (!Number.isInteger(x)) throw new Error(`not an integer: ${x}`);
    return { e: 'lit', type: x < 0 ? T.int : T.nat, value: x };
  }
  return x.ir;
}

const call = (fn: string, ...args: Arg[]): X => wrap({ e: 'call', fn, args: args.map(ir) });

/** A lambda; parameter types are inferred by the checker. */
function lambda(arity: number, f: (...xs: X[]) => Arg): Expr {
  const params = Array.from({ length: arity }, (_, i) => ({ name: arity === 1 ? `x${depth}` : `x${depth}_${i}` }));
  depth++;
  try {
    return { e: 'fn', params, body: ir(f(...params.map(p => v(p.name)))) };
  } finally {
    depth--;
  }
}

const methods: Record<string, (self: Expr, ...args: any[]) => Expr> = {
  not: self => ({ e: 'call', fn: 'not', args: [self] }),
  and: (self, ...xs: Arg[]) => ({ e: 'call', fn: 'and', args: [self, ...xs.map(ir)] }),
  or: (self, ...xs: Arg[]) => ({ e: 'call', fn: 'or', args: [self, ...xs.map(ir)] }),
  length: self => ({ e: 'call', fn: 'length', args: [self] }),
  isEmpty: self => ({ e: 'call', fn: 'isEmpty', args: [self] }),
  isSome: self => ({ e: 'call', fn: 'isSome', args: [self] }),
  isNone: self => ({ e: 'call', fn: 'isNone', args: [self] }),
  sum: self => ({ e: 'call', fn: 'sum', args: [self] }),
  toMultiset: self => ({ e: 'call', fn: 'toMultiset', args: [self] }),
  toList: self => ({ e: 'call', fn: 'toList', args: [self] }),
  dedup: self => ({ e: 'call', fn: 'dedup', args: [self] }),
  has: (self, x: Arg) => ({ e: 'call', fn: 'mem', args: [ir(x), self] }),
  with: (self, fields: Record<string, Arg>) => ({ e: 'with', on: self, fields: mapValues(fields, ir) }),
};
for (const fn of ['implies', 'eq', 'ne', 'lt', 'le', 'gt', 'ge', 'add', 'sub', 'mul', 'div', 'mod', 'getD', 'at', 'append', 'diff']) {
  methods[fn] = (self, x: Arg) => ({ e: 'call', fn, args: [self, ir(x)] });
}
for (const fn of ['filter', 'map', 'any', 'all', 'count']) {
  methods[fn] = (self, f: (x: X) => Arg) => ({ e: 'call', fn, args: [self, lambda(1, f)] });
}

export function wrap(expr: Expr): X {
  return new Proxy({ ir: expr } as X, {
    get(target, prop) {
      if (prop === 'ir') return expr;
      if (typeof prop !== 'string') return (target as any)[prop];
      const m = methods[prop];
      if (m) return (...args: unknown[]) => wrap(m(expr, ...args));
      return wrap({ e: 'get', on: expr, field: prop });
    },
  });
}

function mapValues<A, B>(o: Record<string, A>, f: (a: A) => B): Record<string, B> {
  return Object.fromEntries(Object.entries(o).map(([k, a]) => [k, f(a)]));
}

// ---------------------------------------------------------------------------
// Expressions

export const v = (name: string): X => wrap({ e: 'var', name });
export const lit = (type: Type, value: Json): X => wrap({ e: 'lit', type, value });
export const nat = (n: number) => lit(T.nat, n);
export const int = (n: number) => lit(T.int, n);
export const str = (s: string) => lit(T.string, s);
export const verdict = (s: 'success' | 'failure' | 'inProgress') => lit(T.verdict, s);
export const ctor = (type: Type, name: string) => lit(type, name);
export const none = (of: Type) => lit(T.option(of), null);
export const unit = () => lit(T.unit, null);
export const emptyList = (of: Type) => lit(T.list(of), []);
export const some = (x: Arg) => call('some', x);
export const param = (name: string): X => wrap({ e: 'param', name });

export const not = (x: Arg) => call('not', x);
export const and = (...xs: Arg[]) => call('and', ...xs);
export const or = (...xs: Arg[]) => call('or', ...xs);
export const min = (a: Arg, b: Arg) => call('min', a, b);
export const max = (a: Arg, b: Arg) => call('max', a, b);

export function ite(cond: Arg, then: Arg, otherwise: Arg): X {
  return wrap({ e: 'if', cond: ir(cond), then: ir(then), else: ir(otherwise) });
}

export function match(on: Arg, cases: Record<string, Arg>, otherwise?: Arg): X {
  return wrap({ e: 'match', on: ir(on), cases: mapValues(cases, ir), ...(otherwise === undefined ? {} : { else: ir(otherwise) }) });
}

/** `let name := value; body`. */
export function let_(name: string, value: Arg, body: (x: X) => Arg): X {
  return wrap({ e: 'let', name, value: ir(value), body: ir(body(v(name))) });
}

export function rec(fields: Record<string, Arg>): X {
  return wrap({ e: 'record', fields: mapValues(fields, ir) });
}

/** An adversary choice; `site` names it in witnesses. */
export function choose(site: string, from: Arg, opts: { such?: (x: X) => Arg; label?: (x: X) => Arg } = {}): X {
  return wrap({
    e: 'choose', site, from: ir(from),
    ...(opts.such ? { such: lambda(1, opts.such) } : {}),
    ...(opts.label ? { label: lambda(1, opts.label) } : {}),
  });
}

/** A hook's result: world fields, flags raised on agents (a collection or a predicate), and its own agent fields. */
export function effect(e: { world?: Record<string, Arg>; raise?: Record<string, X | ((a: X) => Arg)>; agents?: (a: X) => Arg } = {}): X {
  return wrap({
    e: 'effect',
    ...(e.world ? { world: mapValues(e.world, ir) } : {}),
    ...(e.raise ? { raise: mapValues(e.raise, r => typeof r === 'function' ? lambda(1, r as (a: X) => Arg) : ir(r as X)) } : {}),
    ...(e.agents ? { agents: lambda(1, e.agents) } : {}),
  });
}

export const nothing = () => effect();

/** A call to a definition of the model or of the piece. */
export const callDef = (name: string, ...args: Arg[]) => call(name, ...args);

// Builtins that are not methods
export const agents = (C: X) => call('agents', C);
export const correct = (a: X) => call('correct', a);
export const present = (a: X) => call('present', a);
export const decisionOf = (a: X) => call('decisionOf', a);
/** The position of a vertex (initial values and domains). */
export const pos = (v: Arg) => call('pos', v);
/** Every position of a finite space. */
export const positions = () => call('positions');
/** The neighbor of `a.pos` behind the agent's port `i`, and the position after `k` steps through it. */
export const resolve = (C: X, a: Arg, i: Arg) => call('resolve', C, a, i);
export const follow = (C: X, a: Arg, i: Arg, k: Arg) => call('follow', C, a, i, k);
// In sensors: the Look `L`.
export const occupants = (L: X, l: Arg) => call('occupants', L, l);
export const position = (L: X, l: Arg) => call('position', L, l);
export const edgePresent = (L: X, a: Arg, b: Arg) => call('edgePresent', L, a, b);
// In algorithms: the agent's Look.
export const here = () => call('here');
export const visible = () => call('visible');
export const neighbors = (l: Arg) => call('neighbors', l);
export const distance = (a: Arg, b: Arg) => call('distance', a, b);
/** A sensor read by the algorithm: once per Look, or at a location. */
export const sense = (sensor: string, at?: Arg) => wrap({ e: 'sense', sensor, ...(at === undefined ? {} : { loc: ir(at) }) });
export const range = (n: Arg) => call('range', n);
/** `[a, b, ...]` (at least one element; an empty list is `emptyList`). */
export const list = (...xs: Arg[]) => call('list', ...xs);
export const subsets = (l: Arg) => call('subsets', l);
export const subsetsUpTo = (l: Arg, k: Arg) => call('subsetsUpTo', l, k);
export const ofFn = (n: Arg, f: (i: X) => Arg) => wrap({ e: 'call', fn: 'ofFn', args: [ir(n), lambda(1, f)] });
export const show = (x: Arg) => call('show', x);
export const concat = (...xs: (Arg | string)[]) => call('concat', ...xs.map(x => typeof x === 'string' ? str(x) : x));

// ---------------------------------------------------------------------------
// Pieces

const fields = (o?: Record<string, Type>): Field[] | undefined =>
  o && Object.entries(o).map(([name, type]) => ({ name, type }));

export function flag(name: string, visibility: Flag['visibility'], acts: Flag['acts']): Flag {
  return { name, visibility, acts };
}

/** A sensor read once per Look: its Look `L` is in scope; `look` binds its Look-level part, which may choose. */
export function sensor(name: string, type: Type, body: (s: { L: X } & Record<string, X>) => Arg, look: Record<string, (s: { L: X } & Record<string, X>) => Arg> = {}): Sensor {
  return lookSensor(name, type, false, look, body);
}

/** A sensor read at a location: `L` and the location `l` are in scope; the body is deterministic. */
export function locationSensor(name: string, type: Type, body: (s: { L: X; l: X } & Record<string, X>) => Arg, look: Record<string, (s: { L: X } & Record<string, X>) => Arg> = {}): Sensor {
  return lookSensor(name, type, true, look, body as (s: { L: X } & Record<string, X>) => Arg);
}

function lookSensor(name: string, type: Type, perLocation: boolean, look: Record<string, (s: { L: X } & Record<string, X>) => Arg>, body: (s: { L: X } & Record<string, X>) => Arg): Sensor {
  const scope: { L: X } & Record<string, X> = { L: v('L'), ...(perLocation ? { l: v('l') } : {}) };
  const bindings = Object.entries(look).map(([n, f]) => {
    const value = ir(f(scope));
    scope[n] = v(n);
    return { name: n, value };
  });
  return { name, type, perLocation, ...(bindings.length ? { look: bindings } : {}), body: ir(body(scope)) };
}

export function def(name: string, params: Record<string, Type>, ret: Type, body: (args: Record<string, X>) => Arg) {
  const ps = fields(params)!;
  return { name, params: ps, ret, body: ir(body(Object.fromEntries(ps.map(p => [p.name, v(p.name)])))) };
}

/** The parameters of a component, as variables. */
export type Params = Record<string, X>;

export type ComponentSpec = {
  name: string;
  /** Parameters of the family, and their values in this instance. */
  params?: Record<string, Type>;
  args?: Record<string, Json>;
  world?: Record<string, Type>;
  agent?: Record<string, Type>;
  flags?: Flag[];
  sensors?: Sensor[];
  actions?: Action[];
  init?: { world?: Record<string, Arg | ((p: Params) => Arg)>; agent?: Record<string, (i: X, p: Params) => Arg> };
  beforeLook?: (C: X, p: Params) => Arg;
  onCompute?: (C: X, p: Params) => Arg;
  beforeMove?: (C: X, p: Params) => Arg;
  afterMove?: (C: X, p: Params) => Arg;
  defs?: Component['defs'];
  equivariant?: boolean;
};

export function component(spec: ComponentSpec): Component {
  const p: Params = Object.fromEntries(Object.keys(spec.params ?? {}).map(name => [name, v(name)]));
  const hook = (h?: (C: X, p: Params) => Arg) => h && ir(h(v('C'), p));
  const c: Component = {
    name: spec.name,
    params: fields(spec.params),
    args: spec.args,
    world: fields(spec.world),
    agent: fields(spec.agent),
    flags: spec.flags,
    sensors: spec.sensors,
    actions: spec.actions,
    init: spec.init && dropUndefined({
      world: spec.init.world && mapValues(spec.init.world, x => ir(typeof x === 'function' ? x(p) : x)),
      agent: spec.init.agent && mapValues(spec.init.agent, f => ir(f(v('i'), p))),
    }),
    beforeLook: hook(spec.beforeLook),
    onCompute: hook(spec.onCompute),
    beforeMove: hook(spec.beforeMove),
    afterMove: hook(spec.afterMove),
    defs: spec.defs,
    equivariant: spec.equivariant,
  };
  return dropUndefined(c);
}

export type ModelSpec = {
  name: string;
  space: Space;
  observation: Observation;
  frames: Frames;
  sensors: Sensor[];
  memory?: Model['memory'];
  round?: Model['round'];
  components?: Component[];
  symmetries?: Model['symmetries'];
  defs?: Model['defs'];
};

export function model(spec: ModelSpec): Model {
  return dropUndefined({
    name: spec.name,
    space: spec.space,
    observation: spec.observation,
    frames: spec.frames,
    sensors: spec.sensors,
    memory: spec.memory ?? 'persistent',
    round: spec.round ?? 'fsync',
    movement: 'alongEdges' as const,
    components: spec.components ?? [],
    symmetries: spec.symmetries ?? 'derived',
    defs: spec.defs,
  });
}

/** A graph space; `params` are its parameters, with their values as expressions over experiment parameters. */
export function graph(spec: {
  name: string; vertex: Type; params?: Record<string, { type: Type; value: Arg }>;
  vertices?: (p: Params) => Arg; neighbors: (v: X, p: Params) => Arg; automorphisms?: Automorphisms;
}): Space {
  const ps = Object.entries(spec.params ?? {});
  const p: Params = Object.fromEntries(ps.map(([name]) => [name, v(name)]));
  return dropUndefined({
    kind: 'graph' as const,
    name: spec.name,
    params: ps.length ? ps.map(([name, { type }]) => ({ name, type })) : undefined,
    args: ps.length ? Object.fromEntries(ps.map(([name, { value }]) => [name, ir(value)])) : undefined,
    vertex: spec.vertex,
    vertices: spec.vertices && ir(spec.vertices(p)),
    neighbors: { vertex: 'v', body: ir(spec.neighbors(v('v'), p)) },
    automorphisms: spec.automorphisms ?? { kind: 'computed' },
  });
}

/** The cycle C_n of `Graphs.Cycle` (port 0 to v + 1, port 1 to v - 1), its size given by `size`. */
export const cycle = (size: Arg = param('N')): Space => graph({
  name: 'Graphs.Cycle', vertex: T.nat, params: { n: { type: T.nat, value: size } },
  vertices: p => range(p.n),
  neighbors: (x, p) => list(x.add(1).mod(p.n), x.add(p.n).sub(1).mod(p.n)),
  automorphisms: { kind: 'dihedral', n: v('n').ir },
});

export const dynamic = (base: Space, missing: Arg = 1): Space => ({ kind: 'dynamic', base, missing: ir(missing) });
export const full: Observation = { kind: 'full' };
export const radius = (r: Arg): Observation => ({ kind: 'radius', r: ir(r) });
export const frames = {
  isomorphisms: { kind: 'isomorphisms' } as Frames,
  identity: { kind: 'identity' } as Frames,
  portPermutations: (when: 'perLook' | 'perRobot', among: 'all' | 'symmetries' = 'all'): Frames => ({ kind: 'portPermutations', when, among }),
};

export type AlgorithmSpec = {
  name: string;
  uses: string[];
  pub: Type;
  mem?: Type;
  init: { pub: (i: X) => Arg; mem?: (i: X) => Arg };
  /** Returns `{ move, pub, mem, ...actions }`; missing `pub` and `mem` are kept unchanged, a missing `move` stays. */
  step?: (s: { mem: X; pub: X }) => Record<string, Arg>;
  line?: (mem: X) => Arg;
  native?: string;
  defs?: Algorithm['defs'];
};

export function algorithm(spec: AlgorithmSpec): Algorithm {
  const mem = spec.mem ?? T.unit;
  const s = { mem: v('mem'), pub: v('pub') };
  const step = { move: here(), ...(spec.step ? spec.step(s) : {}) };
  return dropUndefined({
    name: spec.name,
    uses: spec.uses,
    pub: spec.pub,
    mem,
    init: { pub: ir(spec.init.pub(v('i'))), mem: ir(spec.init.mem ? spec.init.mem(v('i')) : unit()) },
    step: rec({ pub: s.pub, mem: s.mem, ...step }).ir,
    line: spec.line && ir(spec.line(v('mem'))),
    native: spec.native,
    defs: spec.defs,
  });
}

export function task(spec: { name: string; goal: Goal; verdict: (C: X) => Arg; equivariant?: boolean; defs?: Task['defs'] }): Task {
  return dropUndefined({ name: spec.name, goal: spec.goal, verdict: ir(spec.verdict(v('C'))), equivariant: spec.equivariant, defs: spec.defs });
}

export function experiment(spec: {
  name: string; model: Model; algorithm: Algorithm; task: Task;
  params?: { name: string; type: Type; domain?: Arg; accepts?: Arg }[];
  agents: { count: Arg; pos: (i: X) => Arg };
  limits?: Experiment['limits'];
}): Experiment {
  const params: Param[] = (spec.params ?? []).map(p => dropUndefined({ name: p.name, type: p.type, domain: p.domain === undefined ? undefined : ir(p.domain), accepts: p.accepts === undefined ? undefined : ir(p.accepts) }));
  return dropUndefined({
    irVersion: IR_VERSION, name: spec.name, model: spec.model, algorithm: spec.algorithm, task: spec.task, params,
    agents: { count: ir(spec.agents.count), pos: ir(spec.agents.pos(v('i'))) },
    limits: spec.limits,
  });
}

/** Keeps the IR free of `undefined`, so that it round-trips through JSON unchanged. */
function dropUndefined<O extends object>(o: O): O {
  return Object.fromEntries(Object.entries(o).filter(([, x]) => x !== undefined)) as O;
}
