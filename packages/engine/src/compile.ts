/**
 * Compiles IR expressions to JavaScript closures.
 *
 * A deterministic expression becomes `(frame) => value`. An expression that
 * contains a choice becomes `(frame, k) => void`, which calls `k` once per
 * outcome, in the order of the choices (continuation-passing style). While
 * `k` runs, `rt.witness` holds the choices that led to the outcome.
 *
 * Variables live in slots of a frame array, allocated statically. Because
 * evaluation is synchronous and continuations finish before the next outcome
 * is produced, a slot can simply be overwritten for each outcome.
 */
import { BUILTINS } from '@bramas/simulant-lang/builtins';
import type { Def, Expr, Type } from '@bramas/simulant-lang/ir';
import type { Layout } from '@bramas/simulant-lang/layout';
import type { Frames } from '@bramas/simulant-lang/ir';
import { fieldType, isCollection, resolvePub, showType, T } from '@bramas/simulant-lang/types';
import type { Presentation, SpaceRuntime, Vertex, View } from './space';
import { canonicalSort, encoder, equality, show, vertexKey, type V } from './values';

export type Choice = { site: string; index: number; label: string };

/**
 * An agent: its position (a vertex), its kept port permutation (local → space port, under
 * `.perRobot`), state and fields. `phase` counts the events of its current cycle it has taken
 * (absent between cycles); meanwhile `pending` is the decision of its last Look, not yet applied.
 */
export type AgentV = { pos: Vertex; frame?: number[]; pub: V; mem: V; f: Record<string, V>; phase?: number; pending?: DecisionV };
export type Config = { agents: AgentV[]; world: Record<string, V>; idx?: number[] };
/** A decision, as hooks see it: whether the agent decided, the position it moves to, and its actions. */
export type DecisionV = { decided: boolean; target: Vertex; pub: V; mem: V; [action: string]: V };
/** New values of world fields; per flag, which agents raise it; per agent, new values of the component's agent fields. */
export type Effect = { world: Record<string, V>; raise: Record<string, boolean[]>; agents?: (Record<string, V> | undefined)[] };

/** What an activated agent observes: its view, presented under one morphism of its frames. */
export class Look {
  /** The observer's location. */
  readonly here: number;
  private readonly distances = new Map<number, number[]>();

  constructor(readonly agent: number, readonly config: Config, readonly view: View, readonly pres: Presentation) {
    this.here = pres.order.indexOf(0);
  }

  get size() {
    return this.pres.order.length;
  }

  /** The vertex behind a location. */
  vertex(l: number): Vertex {
    if (!(l >= 0 && l < this.pres.order.length)) throw new Error(`location ${l} is not in the Look`);
    return this.view.vertices[this.pres.order[l]];
  }

  /** The location of a vertex of the view, if it is visible. */
  locationOf(v: Vertex): number | undefined {
    const i = this.view.index.get(vertexKey(v));
    return i === undefined ? undefined : this.pres.order.indexOf(i);
  }

  neighbors(l: number): number[] {
    return this.pres.nbrs[l] ?? (() => { throw new Error(`location ${l} is not in the Look`); })();
  }

  /** The distance within the visible domain (breadth-first over its edges). */
  distance(a: number, b: number): number {
    let d = this.distances.get(a);
    if (!d) {
      d = new Array(this.size).fill(Infinity);
      d[a] = 0;
      const queue = [a];
      for (let q = 0; q < queue.length; q++) {
        for (const w of this.pres.nbrs[queue[q]]) if (d[w] === Infinity) { d[w] = d[queue[q]] + 1; queue.push(w); }
      }
      this.distances.set(a, d);
    }
    return d[b];
  }

  /** The agents (by index) at the position behind a location. */
  occupants(l: number): number[] {
    const k = vertexKey(this.vertex(l));
    return agentIndices(this.config).filter(i => vertexKey(this.config.agents[i].pos) === k);
  }
}

/** The sensors of one Look: one environment, fixed for the activation. */
export type SensorEnv = Map<string, { value?: V; at?: (l: number) => V }>;

/** A call to a definition during a traced evaluation: its arguments, result and the line it returned from. */
export type TraceCall = { fn: string; args: string[]; result: string; line?: number; calls: TraceCall[] };
/**
 * A traced evaluation (explanations of a step, never during exploration): the line of the last
 * expression that produced a value (`Expr.at`), and the calls of each definition being evaluated.
 */
export type Trace = { line?: number; stack: TraceCall[][]; count: number };
/** At most this many calls are recorded (definitions called in lambdas over a whole ring add up). */
const MAX_TRACED_CALLS = 2000;

export class Runtime {
  params: Record<string, V> = {};
  space!: SpaceRuntime;
  /** The edges missing this round (dynamic spaces). */
  spaceState: string[] = [];
  frames!: Frames;
  /** While an agent decides: its Look and its sensor environment. */
  look?: Look;
  env?: SensorEnv;
  decisions: DecisionV[] = [];
  witness: Choice[] = [];
  /** Set only while an explanation evaluates (by a compiler built with `traced`). */
  trace?: Trace;
  private readonly flagNames: string[];
  private readonly hiddenFlags: string[];
  private readonly neverFlags: string[];
  private readonly adversaryFlags: string[];

  constructor(readonly lay: Layout) {
    this.flagNames = lay.flags.map(f => f.name);
    this.hiddenFlags = lay.flags.filter(f => f.visibility === 'hidden').map(f => f.name);
    this.neverFlags = lay.flags.filter(f => f.acts === 'never').map(f => f.name);
    this.adversaryFlags = lay.flags.filter(f => f.acts === 'adversary').map(f => f.name);
  }

  correct(a: AgentV) {
    for (const f of this.flagNames) if (a.f[f]) return false;
    return true;
  }

  present(a: AgentV) {
    for (const f of this.hiddenFlags) if (a.f[f]) return false;
    return true;
  }

  /** Who decides for the agent: never > adversary > algorithm. */
  acts(a: AgentV): 'never' | 'adversary' | 'algorithm' {
    for (const f of this.neverFlags) if (a.f[f]) return 'never';
    for (const f of this.adversaryFlags) if (a.f[f]) return 'adversary';
    return 'algorithm';
  }
}

type Frame = V[];
export type Det = (fr: Frame) => V;
export type ND = (fr: Frame, k: (v: V) => void) => void;
type Compiled = { t: Type; det?: Det; nd?: ND };
type Scope = { vars: Map<string, { slot: number; t: Type }>; config?: number };
type Root = { n: number };

const toND = (c: Compiled): ND => c.nd ?? ((fr, k) => k(c.det!(fr)));

/** Evaluates expressions in order, possibly with choices, then calls `k` with their values. */
function sequence(cs: Compiled[]): (fr: Frame, k: (vs: V[]) => void) => void {
  const nds = cs.map(toND);
  const vals: V[] = new Array(cs.length);
  const step = (i: number, fr: Frame, k: (vs: V[]) => void): void => {
    if (i === nds.length) return k(vals.slice());
    nds[i](fr, v => { vals[i] = v; step(i + 1, fr, k); });
  };
  return (fr, k) => step(0, fr, k);
}

export class CompileError extends Error {}

/** A compiled root expression: a function of its variables, deterministic or not. */
export type RootFn = { t: Type; nslots: number; det?: Det; nd?: ND };

export class Compiler {
  private readonly defFns = new Map<Def, { t: Type; nslots: number; det?: Det; nd?: ND }>();

  constructor(
    readonly rt: Runtime,
    readonly lay: Layout,
    readonly paramTypes: Map<string, Type>,
    /** Records, in `rt.trace`, the lines of values and the calls of definitions (explanations only). */
    readonly traced = false,
  ) {}

  /** Compiles `expr` with variables in slots 0, 1, ... in the order given. */
  root(expr: Expr, vars: [string, Type][], defs: Map<string, Def>): RootFn {
    const rc: Root = { n: vars.length };
    const scope: Scope = { vars: new Map() };
    vars.forEach(([name, t], slot) => {
      scope.vars.set(name, { slot, t: this.resolve(t) });
      if (t.k === 'config') scope.config = slot;
    });
    const c = this.compile(expr, scope, rc, defs);
    return { t: c.t, nslots: rc.n, det: c.det, nd: c.nd };
  }

  private resolve(t: Type) {
    return resolvePub(t, this.lay.pub);
  }

  private fail(msg: string): never {
    throw new CompileError(msg);
  }

  private compile(expr: Expr, scope: Scope, rc: Root, defs: Map<string, Def>): Compiled {
    const out = this.compileNode(expr, scope, rc, defs);
    const at = expr.at;
    // A traced value remembers where it came from; conditionals and lets pass on their branch's.
    if (!this.traced || at === undefined || expr.e === 'if' || expr.e === 'match' || expr.e === 'let') return out;
    const rt = this.rt;
    const { det, nd } = out;
    return {
      t: out.t,
      det: det && (fr => { const v = det(fr); if (rt.trace) rt.trace.line = at; return v; }),
      nd: nd && ((fr, k) => nd(fr, v => { if (rt.trace) rt.trace.line = at; k(v); })),
    };
  }

  private compileNode(expr: Expr, scope: Scope, rc: Root, defs: Map<string, Def>): Compiled {
    const rt = this.rt;
    const c = (e: Expr, s: Scope = scope) => this.compile(e, s, rc, defs);
    switch (expr.e) {
      case 'lit': {
        const t = this.resolve(expr.type);
        const value = t.k === 'multiset' ? canonicalSort(t.of)(expr.value as V[]) : expr.value;
        return { t, det: () => value };
      }
      case 'var': {
        const v = scope.vars.get(expr.name) ?? this.fail(`unknown variable ${expr.name}`);
        const slot = v.slot;
        return { t: v.t, det: fr => fr[slot] };
      }
      case 'param': {
        const t = this.paramTypes.get(expr.name) ?? this.fail(`unknown parameter ${expr.name}`);
        const name = expr.name;
        return { t, det: () => rt.params[name] };
      }
      case 'let': {
        const v = c(expr.value);
        const slot = rc.n++;
        const inner: Scope = { vars: new Map(scope.vars).set(expr.name, { slot, t: v.t }), config: v.t.k === 'config' ? slot : scope.config };
        const b = c(expr.body, inner);
        if (v.det && b.det) {
          const vd = v.det, bd = b.det;
          return { t: b.t, det: fr => { fr[slot] = vd(fr); return bd(fr); } };
        }
        const vn = toND(v), bn = toND(b);
        return { t: b.t, nd: (fr, k) => vn(fr, x => { fr[slot] = x; bn(fr, k); }) };
      }
      case 'if': {
        const [cond, a, b] = [c(expr.cond), c(expr.then), c(expr.else)];
        if (cond.det && a.det && b.det) {
          const cd = cond.det, ad = a.det, bd = b.det;
          return { t: a.t, det: fr => cd(fr) ? ad(fr) : bd(fr) };
        }
        const cn = toND(cond), an = toND(a), bn = toND(b);
        return { t: a.t, nd: (fr, k) => cn(fr, v => (v ? an : bn)(fr, k)) };
      }
      case 'match': {
        const on = c(expr.on);
        const cases = Object.fromEntries(Object.entries(expr.cases).map(([ctor, e]) => [ctor, c(e)]));
        const otherwise = expr.else ? c(expr.else) : undefined;
        const branches = [...Object.values(cases), ...(otherwise ? [otherwise] : [])];
        const t = branches[0].t;
        if (on.det && branches.every(b => b.det)) {
          const od = on.det;
          const table = new Map(Object.entries(cases).map(([ctor, b]) => [ctor, b.det!]));
          const dflt = otherwise?.det;
          return { t, det: fr => (table.get(od(fr)) ?? dflt!)(fr) };
        }
        const onN = toND(on);
        const table = new Map(Object.entries(cases).map(([ctor, b]) => [ctor, toND(b)]));
        const dflt = otherwise && toND(otherwise);
        return { t, nd: (fr, k) => onN(fr, v => (table.get(v) ?? dflt!)(fr, k)) };
      }
      case 'fn':
        return this.fail('a function is only allowed as an argument of a builtin');
      case 'record': {
        const names = Object.keys(expr.fields);
        const cs = names.map(n => c(expr.fields[n]));
        const t = T.record(names.map((name, i) => ({ name, type: cs[i].t })));
        const build = (vs: V[]) => {
          const o: Record<string, V> = {};
          for (let i = 0; i < names.length; i++) o[names[i]] = vs[i];
          return o;
        };
        return this.lift(t, cs, build);
      }
      case 'with': {
        const on = c(expr.on);
        const names = Object.keys(expr.fields);
        const cs = [on, ...names.map(n => c(expr.fields[n]))];
        return this.lift(on.t, cs, ([base, ...vs]) => {
          const o = { ...base };
          for (let i = 0; i < names.length; i++) o[names[i]] = vs[i];
          return o;
        });
      }
      case 'get':
        return this.get(c(expr.on), expr.field, scope);
      case 'choose':
        return this.choose(expr, scope, rc, defs);
      case 'effect':
        return this.effect(expr, scope, rc, defs);
      case 'sense':
        return this.sense(expr, scope, rc, defs);
      case 'call':
        return BUILTINS[expr.fn] ? this.builtin(expr, scope, rc, defs) : this.callDef(expr, scope, rc, defs);
    }
  }

  /** Applies a deterministic function to the values of `cs`, which may contain choices. */
  private lift(t: Type, cs: Compiled[], f: (vs: V[]) => V): Compiled {
    if (cs.every(x => x.det)) {
      const ds = cs.map(x => x.det!);
      if (ds.length === 1) { const d = ds[0]; return { t, det: fr => f([d(fr)]) }; }
      return { t, det: fr => f(ds.map(d => d(fr))) };
    }
    const seq = sequence(cs);
    return { t, nd: (fr, k) => seq(fr, vs => k(f(vs))) };
  }

  private configSlot(scope: Scope, what: string): number {
    if (scope.config === undefined) this.fail(`${what} needs a configuration in scope`);
    return scope.config;
  }

  private get(on: Compiled, field: string, scope: Scope): Compiled {
    const t = on.t;
    switch (t.k) {
      case 'record': {
        const ft = fieldType(t, field) ?? this.fail(`${showType(t)} has no field ${field}`);
        return this.lift(ft, [on], ([v]) => v[field]);
      }
      case 'config':
        if (field === 'world') return this.lift(this.lay.worldType, [on], ([C]) => C.world);
        if (field === 'agents') return this.lift(T.multiset(T.agent), [on], ([C]) => agentIndices(C));
        return this.fail(`a configuration has no field ${field}`);
      case 'agent': {
        const cs = this.configSlot(scope, `reading ${field} of an agent`);
        let ft: Type;
        let read: (a: AgentV) => V;
        if (field === 'pos') { ft = T.pos; read = a => a.pos; }
        else if (field === 'pub') { ft = this.lay.pub; read = a => a.pub; }
        else if (field === 'mem') { ft = this.lay.mem; read = a => a.mem; }
        else if (this.lay.flags.some(f => f.name === field)) { ft = T.bool; read = a => !!a.f[field]; }
        else {
          ft = this.lay.agentFields.find(f => f.name === field)?.type ?? this.fail(`agents have no field ${field}`);
          read = a => a.f[field];
        }
        if (on.det) {
          const d = on.det;
          return { t: ft, det: fr => read(fr[cs].agents[d(fr)]) };
        }
        const n = toND(on);
        return { t: ft, nd: (fr, k) => n(fr, i => k(read(fr[cs].agents[i]))) };
      }
      case 'decision': {
        const ft = field === 'target' ? T.pos : field === 'decided' ? T.bool
          : this.lay.actions.find(a => a.name === field)?.type ?? this.fail(`decisions have no action ${field}`);
        return this.lift(ft, [on], ([d]) => d[field]);
      }
      case 'look': {
        const rt = this.rt;
        const read: Record<string, [Type, (L: Look) => V]> = {
          me: [T.agent, L => L.agent],
          here: [T.loc, L => L.here],
          visible: [T.list(T.loc), L => range(L.size)],
          visibleAgents: [T.multiset(T.agent), L => agentIndices(L.config).filter(i => L.locationOf(L.config.agents[i].pos) !== undefined)],
          world: [this.lay.worldType, L => L.config.world],
          spaceSize: [T.nat, () => rt.space.vertices?.length ?? this.fail('spaceSize: the space is infinite')],
        };
        const [ft, f] = read[field] ?? this.fail(`a Look has no field ${field}`);
        return this.lift(ft, [on], ([L]) => f(L));
      }
      default:
        return this.fail(`${showType(t)} has no fields`);
    }
  }

  /** A deterministic lambda: `(fr, ...args) => value`. */
  private lambda(e: Expr, params: Type[], scope: Scope, rc: Root, defs: Map<string, Def>): { t: Type; fn: (fr: Frame, ...xs: V[]) => V } {
    if (e.e !== 'fn') this.fail('expected a function');
    const vars = new Map(scope.vars);
    const slots = e.params.map((p, i) => {
      const slot = rc.n++;
      vars.set(p.name, { slot, t: this.resolve(params[i]) });
      return slot;
    });
    const body = this.compile(e.body, { vars, config: scope.config }, rc, defs);
    if (!body.det) this.fail('a function passed to a builtin cannot contain choices');
    const d = body.det;
    if (slots.length === 1) {
      const s = slots[0];
      return { t: body.t, fn: (fr, x) => { fr[s] = x; return d(fr); } };
    }
    return { t: body.t, fn: (fr, ...xs) => { slots.forEach((s, i) => { fr[s] = xs[i]; }); return d(fr); } };
  }

  private choose(expr: Extract<Expr, { e: 'choose' }>, scope: Scope, rc: Root, defs: Map<string, Def>): Compiled {
    const rt = this.rt;
    const from = this.compile(expr.from, scope, rc, defs);
    if (!isCollection(from.t)) this.fail('choose: expected a collection');
    const elem = from.t.of;
    const such = expr.such && this.lambda(expr.such, [elem], scope, rc, defs).fn;
    const label = expr.label ? this.lambda(expr.label, [elem], scope, rc, defs).fn : undefined;
    const showElem = show(elem);
    const fromN = toND(from);
    const site = expr.site;
    return {
      t: elem,
      nd: (fr, k) => fromN(fr, (xs: V[]) => {
        for (let i = 0; i < xs.length; i++) {
          const x = xs[i];
          if (such && !such(fr, x)) continue;
          rt.witness.push({ site, index: i, label: label ? label(fr, x) : showElem(x) });
          k(x);
          rt.witness.pop();
        }
      }),
    };
  }

  /** A sensor read by the algorithm, in the sensor environment of its current Look. */
  private sense(expr: Extract<Expr, { e: 'sense' }>, scope: Scope, rc: Root, defs: Map<string, Def>): Compiled {
    const rt = this.rt;
    const sensor = this.lay.used.find(s => s.name === expr.sensor) ?? this.fail(`sensor ${expr.sensor} is not used`);
    const t = this.resolve(sensor.type);
    const name = expr.sensor;
    const entry = () => rt.env?.get(name) ?? this.fail(`sensor ${name} read outside a Look`);
    if (!expr.loc) return { t, det: () => entry().value };
    return this.lift(t, [this.compile(expr.loc, scope, rc, defs)], ([l]) => entry().at!(l));
  }

  private effect(expr: Extract<Expr, { e: 'effect' }>, scope: Scope, rc: Root, defs: Map<string, Def>): Compiled {
    const worldNames = Object.keys(expr.world ?? {});
    const world = worldNames.map(n => this.compile(expr.world![n], scope, rc, defs));
    const raiseNames = Object.keys(expr.raise ?? {});
    const cs = raiseNames.length || expr.agents ? this.configSlot(scope, 'an effect on agents') : -1;
    // New values of the component's agent fields, agent by agent.
    const update = expr.agents && this.lambda(expr.agents, [T.agent], scope, rc, defs).fn;
    // Each raise becomes a function from the frame to "which agents raise the flag".
    const raises: Compiled[] = raiseNames.map(n => {
      const e = expr.raise![n];
      if (e.e === 'fn') {
        const pred = this.lambda(e, [T.agent], scope, rc, defs).fn;
        return { t: T.unit, det: fr => fr[cs].agents.map((_: AgentV, i: number) => !!pred(fr, i)) };
      }
      return this.lift(T.unit, [this.compile(e, scope, rc, defs)], ([idx]) => indexMarks(idx));
    });
    const agents: Compiled[] = update ? [{ t: T.unit, det: fr => fr[cs].agents.map((_: AgentV, i: number) => update(fr, i)) }] : [];
    const all = [...world, ...raises, ...agents];
    return this.lift(T.effect, all, vs => {
      const eff: Effect = { world: {}, raise: {} };
      worldNames.forEach((n, i) => { eff.world[n] = vs[i]; });
      raiseNames.forEach((n, j) => { eff.raise[n] = vs[worldNames.length + j]; });
      if (update) eff.agents = vs[worldNames.length + raiseNames.length];
      return eff;
    });
  }

  private callDef(expr: Extract<Expr, { e: 'call' }>, scope: Scope, rc: Root, defs: Map<string, Def>): Compiled {
    const def = defs.get(expr.fn) ?? this.fail(`unknown function ${expr.fn}`);
    let fn = this.defFns.get(def);
    if (!fn) {
      fn = this.root(def.body, def.params.map(p => [p.name, p.type]), defs);
      this.defFns.set(def, fn);
    }
    const { nslots, det, nd } = fn;
    const args = expr.args.map(a => this.compile(a, scope, rc, defs));
    if (det && args.every(a => a.det)) {
      const ds = args.map(a => a.det!);
      const run = this.traced ? this.tracedCall(def.name, args.map(a => show(a.t, true)), show(this.resolve(def.ret), true), det) : det;
      return {
        t: this.resolve(def.ret),
        det: fr => {
          const f2 = new Array(nslots);
          for (let i = 0; i < ds.length; i++) f2[i] = ds[i](fr);
          return run(f2);
        },
      };
    }
    const seq = sequence(args);
    const body = nd ?? ((f2: Frame, k: (v: V) => void) => k(det!(f2)));
    return {
      t: this.resolve(def.ret),
      nd: (fr, k) => seq(fr, vs => {
        const f2 = new Array(nslots);
        vs.forEach((v, i) => { f2[i] = v; });
        body(f2, k);
      }),
    };
  }

  /** A definition's body that records its call in `rt.trace` (arguments, result, line it returned from). */
  private tracedCall(fn: string, showArgs: ((v: V) => string)[], showRet: (v: V) => string, body: Det): Det {
    const rt = this.rt;
    return f2 => {
      const trace = rt.trace;
      if (!trace) return body(f2);
      const call: TraceCall = { fn, args: showArgs.map((s, i) => s(f2[i])), result: '', calls: [] };
      trace.stack.push(call.calls);
      let v: V;
      try {
        v = body(f2);
      } finally {
        trace.stack.pop();
      }
      call.result = showRet(v);
      call.line = trace.line;
      if (trace.count++ < MAX_TRACED_CALLS) trace.stack[trace.stack.length - 1].push(call);
      return v;
    };
  }

  private builtin(expr: Extract<Expr, { e: 'call' }>, scope: Scope, rc: Root, defs: Map<string, Def>): Compiled {
    if (expr.fn === 'correct' || expr.fn === 'present') {
      // Like a field of the agent: read in the configuration in scope.
      const cs = this.configSlot(scope, expr.fn);
      const test = expr.fn === 'correct' ? (a: AgentV) => this.rt.correct(a) : (a: AgentV) => this.rt.present(a);
      const a = this.compile(expr.args[0], scope, rc, defs);
      if (a.det) { const d = a.det; return { t: T.bool, det: fr => test(fr[cs].agents[d(fr)]) }; }
      const n = toND(a);
      return { t: T.bool, nd: (fr, k) => n(fr, i => k(test(fr[cs].agents[i]))) };
    }
    const sig = BUILTINS[expr.fn];
    const types: Type[] = [];
    const parts: ({ kind: 'value'; c: Compiled } | { kind: 'fn'; fn: (fr: Frame, ...xs: V[]) => V })[] = [];
    expr.args.forEach((arg, i) => {
      const lam = sig.lambdas?.[i];
      if (lam) {
        const params = lam(types);
        if (typeof params === 'string') this.fail(params);
        const l = this.lambda(arg, params, scope, rc, defs);
        types.push(T.fn(params, l.t));
        parts.push({ kind: 'fn', fn: l.fn });
      } else {
        const c = this.compile(arg, scope, rc, defs);
        types.push(c.t);
        parts.push({ kind: 'value', c });
      }
    });
    const t = sig.ret(types);
    if (typeof t === 'string') this.fail(t);
    const impl = this.impl(expr.fn, types, t, scope);
    const values = parts.filter(p => p.kind === 'value').map(p => (p as { c: Compiled }).c);
    const fns = parts.map(p => p.kind === 'fn' ? p.fn : undefined);
    const hasFns = fns.some(f => f);
    // Lambdas receive the current frame; values are evaluated first, in order.
    const call = (fr: Frame, vs: V[]) => {
      if (!hasFns) return impl(vs);
      let j = 0;
      const args = fns.map(f => f ? (...xs: V[]) => f(fr, ...xs) : vs[j++]);
      return impl(args);
    };
    if (values.every(v => v.det)) {
      const ds = values.map(v => v.det!);
      if (expr.fn === 'and') return { t, det: fr => { for (const d of ds) if (!d(fr)) return false; return true; } };
      if (expr.fn === 'or') return { t, det: fr => { for (const d of ds) if (d(fr)) return true; return false; } };
      if (ds.length === 1) { const d = ds[0]; return { t, det: fr => call(fr, [d(fr)]) }; }
      if (ds.length === 2) { const [d0, d1] = ds; return { t, det: fr => call(fr, [d0(fr), d1(fr)]) }; }
      return { t, det: fr => call(fr, ds.map(d => d(fr))) };
    }
    const seq = sequence(values);
    return { t, nd: (fr, k) => seq(fr, vs => k(call(fr, vs))) };
  }

  /** The implementation of a builtin, specialised to its argument types. */
  private impl(fn: string, types: Type[], ret: Type, scope: Scope): (args: V[]) => V {
    const rt = this.rt;
    const elemOf = (t: Type) => (t as { of: Type }).of;
    const isMultiset = types[0]?.k === 'multiset';
    const nat = types[0]?.k === 'nat';
    switch (fn) {
      case 'not': return ([x]) => !x;
      case 'and': return xs => xs.every(Boolean);
      case 'or': return xs => xs.some(Boolean);
      case 'implies': return ([a, b]) => !a || b;
      case 'eq': { const eq = equality(types[0]); return ([a, b]) => eq(a, b); }
      case 'ne': { const eq = equality(types[0]); return ([a, b]) => !eq(a, b); }
      case 'lt': return types[0].k === 'list' ? ([a, b]) => lexCompare(a, b) < 0 : ([a, b]) => a < b;
      case 'le': return types[0].k === 'list' ? ([a, b]) => lexCompare(a, b) <= 0 : ([a, b]) => a <= b;
      case 'gt': return types[0].k === 'list' ? ([a, b]) => lexCompare(a, b) > 0 : ([a, b]) => a > b;
      case 'ge': return types[0].k === 'list' ? ([a, b]) => lexCompare(a, b) >= 0 : ([a, b]) => a >= b;
      case 'add': return ([a, b]) => a + b;
      case 'sub': return nat ? ([a, b]) => Math.max(0, a - b) : ([a, b]) => a - b;
      case 'mul': return ([a, b]) => a * b;
      // Lean: division by zero is zero; on Int, `/` and `%` are Euclidean.
      case 'div': return nat ? ([a, b]) => b === 0 ? 0 : Math.floor(a / b) : ([a, b]) => b === 0 ? 0 : Math.sign(b) * Math.floor(a / Math.abs(b));
      case 'mod': return nat ? ([a, b]) => b === 0 ? a : a % b : ([a, b]) => b === 0 ? a : ((a % Math.abs(b)) + Math.abs(b)) % Math.abs(b);
      case 'min': return ([a, b]) => Math.min(a, b);
      case 'max': return ([a, b]) => Math.max(a, b);
      case 'toInt': return ([a]) => a;
      case 'toNat': return ([a]) => Math.max(0, a);
      case 'some': return ([x]) => x;
      case 'isSome': return ([o]) => o !== null;
      case 'isNone': return ([o]) => o === null;
      case 'getD': return ([o, d]) => o === null ? d : o;
      case 'length': return ([l]) => l.length;
      case 'isEmpty': return ([l]) => l.length === 0;
      case 'filter': return ([l, p]) => l.filter((x: V) => p(x));
      case 'any': return ([l, p]) => l.some((x: V) => p(x));
      case 'all': return ([l, p]) => l.every((x: V) => p(x));
      case 'count': return ([l, p]) => { let n = 0; for (const x of l) if (p(x)) n++; return n; };
      case 'map': {
        if (!isMultiset) return ([l, f]) => l.map((x: V) => f(x));
        const sort = canonicalSort(elemOf(ret));
        return ([l, f]) => sort(l.map((x: V) => f(x)));
      }
      case 'sum': return ([l]) => l.reduce((a: number, b: number) => a + b, 0);
      case 'mem': { const eq = equality(types[0]); return ([x, l]) => l.some((y: V) => eq(x, y)); }
      case 'range': return ([n]) => Array.from({ length: n }, (_, i) => i);
      case 'toMultiset': { const sort = canonicalSort(elemOf(types[0])); return ([l]) => sort(l); }
      case 'toList': return ([l]) => l.slice();
      case 'subsets': return ([l]) => subsetsOf(l, l.length, types[0]);
      case 'subsetsUpTo': return ([l, k]) => subsetsOf(l, k, types[0]);
      case 'dedup': {
        const enc = encoder(elemOf(types[0]));
        return ([l]) => { const seen = new Set<string>(); return l.filter((x: V) => { const e = enc(x); if (seen.has(e)) return false; seen.add(e); return true; }); };
      }
      case 'diff': {
        const enc = encoder(elemOf(types[0]));
        return ([a, b]) => {
          const remove = new Map<string, number>();
          for (const x of b) { const e = enc(x); remove.set(e, (remove.get(e) ?? 0) + 1); }
          return a.filter((x: V) => {
            const e = enc(x);
            const n = remove.get(e);
            if (!n) return true;
            remove.set(e, n - 1);
            return false;
          });
        };
      }
      case 'list': return xs => xs;
      case 'at': return ([l, i]) => { if (i >= l.length) throw new Error(`at: index ${i} out of range`); return l[i]; };
      case 'append': {
        if (!isMultiset) return ([a, b]) => a.concat(b);
        const sort = canonicalSort(elemOf(types[0]));
        return ([a, b]) => sort(a.concat(b));
      }
      case 'ofFn': return ([n, f]) => Array.from({ length: n }, (_, i) => f(i));
      case 'show': { const s = show(types[0]); return ([x]) => s(x); }
      case 'concat': return xs => xs.join('');
      case 'agents': return ([C]) => agentIndices(C);
      case 'decisionOf': return ([a]) => rt.decisions[a];
      case 'pos': return ([v]) => {
        if (!rt.space) this.fail('pos: no space yet (a parameter of the space is not fixed)');
        if (!rt.space.has(v)) throw new Error(`pos: ${vertexKey(v)} is not a vertex of ${rt.space.name}`);
        return v;
      };
      case 'positions': return () => rt.space?.vertices ?? this.fail('positions: the space is infinite or not fixed yet');
      case 'resolve': return ([C, a, i]) => follow(rt, C.agents[a], i, 1);
      case 'follow': return ([C, a, i, k]) => follow(rt, C.agents[a], i, k);
      case 'occupants': return ([L, l]) => (L as Look).occupants(l);
      case 'position': return ([L, l]) => (L as Look).vertex(l);
      case 'edgePresent': return ([L, a, b]) => rt.space.edgePresent(rt.spaceState, (L as Look).vertex(a), (L as Look).vertex(b));
      case 'here': return () => current(rt).here;
      case 'visible': return () => range(current(rt).size);
      case 'neighbors': return ([l]) => current(rt).neighbors(l);
      case 'distance': return ([a, b]) => current(rt).distance(a, b);
    }
    return this.fail(`builtin ${fn} is not implemented`);
  }

}

/** Lexicographic order on lists of Bool or Nat (`false < true`, a prefix first), as Lean's `List.lt`. */
function lexCompare(a: (boolean | number)[], b: (boolean | number)[]): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return a.length - b.length;
}

function agentIndices(C: Config): number[] {
  return C.idx ??= C.agents.map((_, i) => i);
}

function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

function current(rt: Runtime): Look {
  return rt.look ?? (() => { throw new Error('the Look is read outside an activation'); })();
}

/** From an agent's position, `k` times through its local port `i`, in its kept frame. */
function follow(rt: Runtime, a: AgentV, i: number, k: number): Vertex {
  if (rt.frames.kind === 'isomorphisms' || (rt.frames.kind === 'portPermutations' && rt.frames.when === 'perLook')) {
    throw new Error('resolve and follow need a kept frame (Frames.identity, Frames.portPermutations .perRobot)');
  }
  const port = a.frame ? a.frame[i] : i;
  let v = a.pos;
  for (let s = 0; s < k; s++) {
    const ns = rt.space.neighbors(v);
    if (port === undefined || port >= ns.length) throw new Error(`port ${i} does not exist at u${vertexKey(v)}`);
    v = ns[port];
  }
  return v;
}

function indexMarks(idx: number[]): boolean[] {
  const marks: boolean[] = [];
  for (const i of idx) marks[i] = true;
  return marks;
}

/** Sub-collections with at most `k` elements, smallest first, then in index order. */
function subsetsOf(l: V[], k: number, t: Type): V[][] {
  const out: V[][] = [];
  const pick = (size: number, from: number, current: V[]) => {
    if (current.length === size) { out.push(current.slice()); return; }
    for (let i = from; i < l.length; i++) {
      current.push(l[i]);
      pick(size, i + 1, current);
      current.pop();
    }
  };
  for (let size = 0; size <= Math.min(k, l.length); size++) pick(size, 0, []);
  if (t.k !== 'multiset') return out;
  // Equal elements of a multiset give equal sub-multisets: keep one of each.
  const enc = encoder(t);
  const seen = new Set<string>();
  return out.filter(s => { const e = enc(s); if (seen.has(e)) return false; seen.add(e); return true; });
}
