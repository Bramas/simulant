/**
 * Typechecking and validation of an experiment's IR: types, inference of nondeterminism, field
 * ownership, where parameters may appear, the memory model, and what each piece may observe
 * (docs/core-redesign.md): sensors see only their Look and return no positions, agents or
 * locations; algorithms see only their Look and sensors, and keep no location across a round.
 */
import { BUILTINS, type Context } from './builtins';
import type { Component, Def, Experiment, Expr, Instant, Scheduler, Space, Type } from './ir';
import { IR_VERSION } from './ir';

const INSTANTS: Instant[] = ['look', 'compute', 'move'];
import { layout, type Layout } from './layout';
import { fieldType, graphOf, isCollection, isStorable, mentions, resolvePub, showType, T, typeEq, VERDICTS } from './types';

export type Inferred = { t: Type; nd: boolean };

/** An error, with the expression where it was found (when there is one). */
export type Diagnostic = { message: string; node?: Expr };

export type CheckResult = {
  errors: string[];
  diagnostics: Diagnostic[];
  layout: Layout;
  /** Definitions whose body contains a choice, directly or through a call. */
  nondeterministic: Set<string>;
  /** Definitions that read the Look (directly or through a call): callable only from algorithms. */
  algorithmLocal: Set<string>;
  /** Types found for literals of type `infer` (see `resolve.ts`). */
  resolutions: Map<Expr, Type>;
};

class CheckError extends Error {
  constructor(message: string, readonly node?: Expr) {
    super(message);
  }
}

/** A literal whose type is still to be inferred: `.ctor`, `none`, `[]`, a number (Nat unless an Int is expected). */
const isHole = (e: Expr) => e.e === 'lit' && e.type.k === 'infer';

type Unit = {
  ctx: Context;
  where: string;
  /** The component whose hook is checked: the only one whose fields an effect may write. */
  owner?: string;
  defs: Map<string, Def>;
  /** In a definition: set when its body reads the Look. */
  reads?: { look: boolean };
  /** Algorithm initial values and line tables run without a Look. */
  noLook?: boolean;
};

export class Checker {
  readonly lay: Layout;
  readonly errors: string[] = [];
  readonly diagnostics: Diagnostic[] = [];
  readonly nondeterministic = new Set<string>();
  readonly algorithmLocal = new Set<string>();
  readonly resolutions = new Map<Expr, Type>();
  private readonly defState = new Map<Def, 'checking' | Inferred>();
  /** The expressions being inferred, innermost last: errors point at the innermost. */
  private readonly stack: Expr[] = [];
  /** Enumerations mentioned anywhere in the experiment, for constructors without an expected type. */
  private readonly enums: Type[];
  /** The vertex type of the experiment's space (a graph), for `pos v`. */
  private readonly vertex?: Type;
  /** Whether the space has a finite vertex list. */
  private readonly finite: boolean;

  constructor(readonly exp: Experiment) {
    this.lay = layout(exp);
    for (const e of this.lay.errors) this.report(e);
    this.enums = [T.verdict, ...enumsIn(exp)];
    const g = graphOf(exp.model.space);
    this.vertex = g?.vertex;
    this.finite = !!g?.vertices;
  }

  private report(message: string, node?: Expr) {
    this.errors.push(message);
    this.diagnostics.push({ message, node });
  }

  private fail(unit: Unit, msg: string): never {
    throw new CheckError(`${unit.where}: ${msg}`, this.stack[this.stack.length - 1]);
  }

  /**
   * Checks a root expression; reports its first error. `hint` guides the
   * types of literals without requiring the result to have that type.
   */
  root(expr: Expr, scope: Record<string, Type>, unit: Unit, expected?: Type, hint?: Type): Inferred | undefined {
    try {
      const r = this.infer(expr, new Map(Object.entries(scope)), unit, expected ?? hint);
      if (expected) this.expect(r.t, expected, unit, 'result');
      return r;
    } catch (e) {
      if (!(e instanceof CheckError)) throw e;
      this.report(e.message, e.node ?? expr);
    }
  }

  /** The type of a literal of type `infer`, from the expected type or a unique constructor. */
  private resolveHole(expr: Extract<Expr, { e: 'lit' }>, expected: Type | undefined, unit: Unit): Type {
    const v = expr.value;
    const ctorsOf = (t: Type) => t.k === 'enum' ? t.ctors : t.k === 'verdict' ? [...VERDICTS] : undefined;
    let t: Type | undefined = expected && expected.k !== 'infer' ? resolvePub(expected, this.lay.pub) : undefined;
    if (t) {
      const ok = typeof v === 'string' ? ctorsOf(t)?.includes(v)
        : typeof v === 'number' ? t.k === 'nat' || t.k === 'int'
        : v === null ? t.k === 'option' || t.k === 'unit'
        : Array.isArray(v) && v.length === 0 && isCollection(t);
      if (!ok) this.fail(unit, `${showHole(v)} is not a value of type ${showType(t)}`);
    } else if (typeof v === 'number') {
      t = T.nat;
    } else if (typeof v === 'string') {
      const candidates = this.enums.filter(e => ctorsOf(e)!.includes(v));
      const names = [...new Set(candidates.map(showType))];
      if (!names.length) this.fail(unit, `unknown constructor .${v}`);
      if (names.length > 1) this.fail(unit, `ambiguous constructor .${v}: it could be ${names.join(' or ')}; write ${names[0]}.${v}`);
      t = candidates[0];
    } else {
      this.fail(unit, `cannot infer the type of ${showHole(v)}; add a type ascription, as in (${showHole(v)} : ${v === null ? 'Option Nat' : 'List Nat'})`);
    }
    this.resolutions.set(expr, t);
    return t;
  }

  private expect(actual: Type, expected: Type, unit: Unit, what: string) {
    actual = resolvePub(actual, this.lay.pub);
    expected = resolvePub(expected, this.lay.pub);
    if (!typeEq(actual, expected)) this.fail(unit, `${what}: expected ${showType(expected)}, got ${showType(actual)}`);
  }

  private param(name: string, unit: Unit): Type {
    if (!['init', 'domain'].includes(unit.ctx)) this.fail(unit, `param ${name} is only allowed in initial values, domains and model arguments`);
    const p = this.exp.params.find(p => p.name === name);
    if (!p) this.fail(unit, `unknown parameter ${name}`);
    return p.type;
  }

  /** A read of the Look: in an algorithm, or in a definition, which becomes algorithm-local. */
  private readLook(unit: Unit, what: string) {
    if (unit.noLook) this.fail(unit, `${what}: initial values have no Look`);
    if (unit.ctx === 'def') { unit.reads!.look = true; return; }
    if (unit.ctx !== 'algorithm') this.fail(unit, `${what} is read by algorithms (sensors read their Look \`L\`)`);
  }

  infer(expr: Expr, scope: Map<string, Type>, unit: Unit, expected?: Type): Inferred {
    this.stack.push(expr);
    try {
      return this.inferIn(expr, scope, unit, expected);
    } finally {
      this.stack.pop();
    }
  }

  /** Infers the types of `exprs` in order, giving holes the type of the first other one (or `expected`). */
  private joined(exprs: Expr[], scope: Map<string, Type>, unit: Unit, expected?: Type): Inferred[] {
    const out: Inferred[] = new Array(exprs.length);
    let t = expected;
    const order = [...exprs.keys()].sort((a, b) => Number(isHole(exprs[a])) - Number(isHole(exprs[b])));
    for (const i of order) {
      out[i] = this.infer(exprs[i], scope, unit, t);
      t ??= out[i].t;
    }
    return out;
  }

  private inferIn(expr: Expr, scope: Map<string, Type>, unit: Unit, expected?: Type): Inferred {
    const det = (t: Type): Inferred => ({ t, nd: false });
    switch (expr.e) {
      case 'lit':
        if (expr.type.k === 'infer') return det(this.resolveHole(expr, expected, unit));
        if (['pos', 'loc', 'agent', 'look', 'config'].includes(expr.type.k)) this.fail(unit, `no literal of type ${showType(expr.type)}`);
        return det(expr.type);
      case 'var': {
        const t = scope.get(expr.name);
        if (!t) this.fail(unit, `unknown variable ${expr.name}`);
        return det(t);
      }
      case 'param':
        return det(this.param(expr.name, unit));
      case 'let': {
        const v = this.infer(expr.value, scope, unit);
        const b = this.infer(expr.body, new Map(scope).set(expr.name, v.t), unit, expected);
        return { t: b.t, nd: v.nd || b.nd };
      }
      case 'if': {
        const c = this.infer(expr.cond, scope, unit, T.bool);
        this.expect(c.t, T.bool, unit, 'condition');
        const [a, b] = this.joined([expr.then, expr.else], scope, unit, expected);
        this.expect(b.t, a.t, unit, 'else branch');
        return { t: a.t, nd: c.nd || a.nd || b.nd };
      }
      case 'match': {
        const on = this.infer(expr.on, scope, unit);
        const ctors = on.t.k === 'enum' ? on.t.ctors : on.t.k === 'verdict' ? [...VERDICTS]
          : this.fail(unit, `cannot match on ${showType(on.t)}`);
        for (const c of Object.keys(expr.cases)) if (!ctors.includes(c)) this.fail(unit, `unknown case ${c} of ${showType(on.t)}`);
        if (!expr.else && ctors.some(c => !(c in expr.cases))) this.fail(unit, `non-exhaustive match on ${showType(on.t)}`);
        const branches = this.joined([...Object.values(expr.cases), ...(expr.else ? [expr.else] : [])], scope, unit, expected);
        for (const b of branches.slice(1)) this.expect(b.t, branches[0].t, unit, 'match branch');
        return { t: branches[0].t, nd: on.nd || branches.some(b => b.nd) };
      }
      case 'fn':
        return this.fail(unit, 'a function is only allowed as an argument of a builtin');
      case 'record': {
        let nd = false;
        const target = expected && resolvePub(expected, this.lay.pub);
        const fields = Object.entries(expr.fields).map(([name, e]) => {
          const r = this.infer(e, scope, unit, target ? fieldType(target, name) : undefined);
          nd ||= r.nd;
          return { name, type: r.t };
        });
        return { t: T.record(fields), nd };
      }
      case 'with': {
        const on = this.infer(expr.on, scope, unit);
        let nd = on.nd;
        for (const [name, e] of Object.entries(expr.fields)) {
          const ft = fieldType(on.t, name) ?? this.fail(unit, `${showType(on.t)} has no field ${name}`);
          const r = this.infer(e, scope, unit, ft);
          this.expect(r.t, ft, unit, `field ${name}`);
          nd ||= r.nd;
        }
        return { t: on.t, nd };
      }
      case 'get': {
        // A component reads only its own world fields: `C.world.f`, never `C.world` as a whole.
        if (unit.owner && expr.on.e === 'get' && expr.on.field === 'world') {
          const inner = this.infer(expr.on.on, scope, unit);
          if (inner.t.k === 'config' || inner.t.k === 'look') {
            const f = this.lay.world.find(f => f.name === expr.field) ?? this.fail(unit, `unknown world field ${expr.field}`);
            if (f.owner !== unit.owner) this.fail(unit, `world field ${expr.field} belongs to ${f.owner}`);
            return { t: f.type, nd: inner.nd };
          }
        }
        const on = this.infer(expr.on, scope, unit);
        if (unit.owner && (on.t.k === 'config' || on.t.k === 'look') && expr.field === 'world') {
          this.fail(unit, 'a component reads world fields one by one (C.world.f)');
        }
        return { t: this.field(on.t, expr.field, unit), nd: on.nd };
      }
      case 'choose': {
        const where = ({ task: 'tasks', algorithm: 'algorithms', domain: 'parameter domains', space: 'spaces' } as Record<string, string>)[unit.ctx];
        if (where) this.fail(unit, `choices are not allowed in ${where}`);
        const from = this.infer(expr.from, scope, unit);
        if (!isCollection(from.t)) this.fail(unit, `choose: expected a List or Multiset, got ${showType(from.t)}`);
        const elem = from.t.of;
        if (expr.such) this.lambda(expr.such, [elem], T.bool, scope, unit, 'such');
        if (expr.label) this.lambda(expr.label, [elem], T.string, scope, unit, 'label');
        return { t: elem, nd: true };
      }
      case 'effect':
        return this.effect(expr, scope, unit);
      case 'sense':
        return this.sense(expr, scope, unit);
      case 'call':
        return this.call(expr, scope, unit, expected);
    }
  }

  private sense(expr: Extract<Expr, { e: 'sense' }>, scope: Map<string, Type>, unit: Unit): Inferred {
    this.readLook(unit, `sensor ${expr.sensor}`);
    const s = this.lay.used.find(s => s.name === expr.sensor);
    if (!s) {
      const provided = this.lay.sensors.some(x => x.name === expr.sensor);
      this.fail(unit, provided
        ? `the algorithm reads sensor ${expr.sensor} without using it: add it to \`uses\``
        : `sensor ${expr.sensor} is not provided by the model`);
    }
    if (s.perLocation && !expr.loc) this.fail(unit, `sensor ${expr.sensor} is read at a location: ${expr.sensor} l`);
    if (!s.perLocation && expr.loc) this.fail(unit, `sensor ${expr.sensor} is read once per Look, not at a location`);
    if (expr.loc) {
      const at = this.infer(expr.loc, scope, unit, T.loc);
      this.expect(at.t, T.loc, unit, `sensor ${expr.sensor}`);
      return { t: s.type, nd: at.nd };
    }
    return { t: s.type, nd: false };
  }

  private field(t: Type, name: string, unit: Unit): Type {
    switch (t.k) {
      case 'record':
        return fieldType(t, name) ?? this.fail(unit, `${showType(t)} has no field ${name}`);
      case 'config':
        if (name === 'world') return this.lay.worldType;
        if (name === 'agents') return T.multiset(T.agent);
        return this.fail(unit, `a configuration has no field ${name}`);
      case 'look':
        switch (name) {
          case 'me': return T.agent;
          case 'here': return T.loc;
          case 'visible': return T.list(T.loc);
          case 'visibleAgents': return T.multiset(T.agent);
          case 'world': return this.lay.worldType;
          case 'spaceSize':
            if (!this.finite) this.fail(unit, 'spaceSize: the space is infinite');
            return T.nat;
        }
        return this.fail(unit, `a Look has no field ${name} (me, here, visible, visibleAgents, world, spaceSize; occupants l, position l, edgePresent a b)`);
      case 'agent': {
        if (name === 'pos') return T.pos;
        if (name === 'phase') return T.nat;
        if (name === 'pub') return this.lay.pub;
        if (name === 'mem') {
          if (unit.ctx !== 'task') this.fail(unit, 'the private memory of an agent can only be read by a task');
          return this.lay.mem;
        }
        const flag = this.lay.flags.find(f => f.name === name);
        const f = flag ?? this.lay.agentFields.find(f => f.name === name) ?? this.fail(unit, `agents have no field ${name}`);
        // Components read their own flags and fields; others' only through `correct` and `present`.
        if (unit.owner && f.owner !== unit.owner) this.fail(unit, `${flag ? 'flag' : 'agent field'} ${name} belongs to ${f.owner}`);
        return flag ? T.bool : (f as { type: Type }).type;
      }
      case 'decision': {
        if (name === 'target') return T.pos;
        if (name === 'decided') return T.bool;
        const a = this.lay.actions.find(a => a.name === name);
        return a?.type ?? this.fail(unit, `decisions have no action ${name} (decided, target, or an action)`);
      }
      default:
        return this.fail(unit, `${showType(t)} has no fields`);
    }
  }

  private effect(expr: Extract<Expr, { e: 'effect' }>, scope: Map<string, Type>, unit: Unit): Inferred {
    if (!['hook', 'decisionHook', 'schedule', 'def'].includes(unit.ctx)) this.fail(unit, 'effects are only returned by hooks');
    let nd = false;
    for (const [name, e] of Object.entries(expr.world ?? {})) {
      const f = this.lay.world.find(f => f.name === name) ?? this.fail(unit, `unknown world field ${name}`);
      if (unit.owner && f.owner !== unit.owner) this.fail(unit, `world field ${name} belongs to ${f.owner}`);
      const r = this.infer(e, scope, unit, f.type);
      this.expect(r.t, f.type, unit, `world field ${name}`);
      nd ||= r.nd;
    }
    for (const [name, e] of Object.entries(expr.raise ?? {})) {
      const f = this.lay.flags.find(f => f.name === name) ?? this.fail(unit, `unknown flag ${name}`);
      if (unit.owner && f.owner !== unit.owner) this.fail(unit, `flag ${name} belongs to ${f.owner}`);
      if (e.e === 'fn') {
        this.lambda(e, [T.agent], T.bool, scope, unit, `raise ${name}`);
      } else {
        const r = this.infer(e, scope, unit);
        if (!(isCollection(r.t) && r.t.of.k === 'agent')) this.fail(unit, `raise ${name}: expected agents or a predicate on agents`);
        nd ||= r.nd;
      }
    }
    if (expr.activate) {
      if (unit.ctx !== 'schedule' && unit.ctx !== 'def') this.fail(unit, 'activate: only a scheduler\'s schedule activates agents');
      if (expr.activate.e === 'fn') {
        this.lambda(expr.activate, [T.agent], T.bool, scope, unit, 'activate');
      } else {
        const r = this.infer(expr.activate, scope, unit);
        if (!(isCollection(r.t) && r.t.of.k === 'agent')) this.fail(unit, 'activate: expected agents or a predicate on agents');
        nd ||= r.nd;
      }
    }
    if (expr.agents) {
      // New values of the component's own agent fields, agent by agent.
      const t = this.lambda(expr.agents, [T.agent], undefined, scope, unit, 'agents');
      if (t.k !== 'record') this.fail(unit, 'agents := fun a => { field := value, ... }');
      for (const f of t.fields) {
        const g = this.lay.agentFields.find(g => g.name === f.name) ?? this.fail(unit, `unknown agent field ${f.name}`);
        if (unit.owner && g.owner !== unit.owner) this.fail(unit, `agent field ${f.name} belongs to ${g.owner}`);
        this.expect(f.type, g.type, unit, `agent field ${f.name}`);
      }
    }
    return { t: T.effect, nd };
  }

  /** A deterministic lambda with the given parameter types. Returns its result type. */
  private lambda(e: Expr, params: Type[], ret: Type | undefined, scope: Map<string, Type>, unit: Unit, what: string): Type {
    if (e.e !== 'fn') this.fail(unit, `${what}: expected a function`);
    if (e.params.length !== params.length) this.fail(unit, `${what}: expected ${params.length} parameter(s)`);
    params = params.map(p => resolvePub(p, this.lay.pub));
    const inner = new Map(scope);
    e.params.forEach((p, i) => {
      if (p.type) this.expect(params[i], p.type, unit, `${what}, parameter ${p.name}`);
      inner.set(p.name, params[i]);
    });
    const body = this.infer(e.body, inner, unit);
    if (body.nd) this.fail(unit, `${what}: a function passed to a builtin cannot contain choices`);
    if (ret) this.expect(body.t, ret, unit, what);
    return body.t;
  }

  private call(expr: Extract<Expr, { e: 'call' }>, scope: Map<string, Type>, unit: Unit, expected?: Type): Inferred {
    const sig = BUILTINS[expr.fn];
    if (!sig) return this.callDef(expr, scope, unit);
    if (sig.arity !== undefined ? expr.args.length !== sig.arity : expr.args.length === 0) {
      this.fail(unit, `${expr.fn}: wrong number of arguments`);
    }
    if (sig.only && !sig.only.includes(unit.ctx)) this.fail(unit, `${expr.fn} is not allowed in ${showContext(unit.ctx)}`);
    if (sig.config && unit.ctx === 'algorithm') this.fail(unit, `${expr.fn}: an algorithm only knows its Look and its sensors`);
    if (sig.look) this.readLook(unit, expr.fn);
    if (expr.fn === 'positions' && !this.finite) this.fail(unit, 'positions: the space is infinite');
    const types: Type[] = [];
    let nd = false;
    // Expected types of arguments, from the other arguments or the expected result.
    const args = expr.args;
    const hinted = (i: number): Type | undefined => {
      const value = (j: number) => this.infer(args[j], scope, unit).t;
      switch (expr.fn) {
        case 'eq': case 'ne': case 'append': case 'diff':
          return isHole(args[i]) && !isHole(args[1 - i]) ? value(1 - i) : expr.fn === 'append' ? expected : undefined;
        case 'add': case 'sub': case 'mul': case 'div': case 'mod': case 'min': case 'max':
          return isHole(args[i]) && !isHole(args[1 - i]) ? value(1 - i) : expected;
        case 'lt': case 'le': case 'gt': case 'ge':
          return isHole(args[i]) && !isHole(args[1 - i]) ? value(1 - i) : undefined;
        case 'getD': return i === 1 ? optionOf(types[0]) : undefined;
        case 'mem': return i === 0 && isHole(args[0]) ? elementOf(value(1)) : undefined;
        case 'some': return optionOf(expected);
        case 'pos': return this.vertex;
        case 'list': {
          const other = args.findIndex(a => !isHole(a));
          return elementOf(expected) ?? (isHole(args[i]) && other >= 0 ? value(other) : undefined);
        }
        default: return undefined;
      }
    };
    args.forEach((arg, i) => {
      const lam = sig.lambdas?.[i];
      if (lam) {
        const params = lam(types);
        if (typeof params === 'string') this.fail(unit, params);
        const ret = this.lambda(arg, params, undefined, scope, unit, `${expr.fn}, argument ${i + 1}`);
        types.push(T.fn(params, ret));
      } else {
        const r = this.infer(arg, scope, unit, hinted(i));
        types.push(r.t);
        nd ||= r.nd;
      }
    });
    if (expr.fn === 'pos') {
      if (!this.vertex) this.fail(unit, 'pos: the space has no vertices');
      this.expect(types[0], this.vertex, unit, 'pos');
    }
    const t = sig.ret(types);
    if (typeof t === 'string') this.fail(unit, t);
    return { t, nd };
  }

  private callDef(expr: Extract<Expr, { e: 'call' }>, scope: Map<string, Type>, unit: Unit): Inferred {
    const def = unit.defs.get(expr.fn) ?? this.fail(unit, `unknown function ${expr.fn}`);
    if (expr.args.length !== def.params.length) this.fail(unit, `${expr.fn}: expected ${def.params.length} argument(s)`);
    let nd = false;
    expr.args.forEach((arg, i) => {
      const r = this.infer(arg, scope, unit, def.params[i].type);
      this.expect(r.t, def.params[i].type, unit, `${expr.fn}, argument ${def.params[i].name}`);
      nd ||= r.nd;
    });
    const body = this.checkDef(def, unit);
    if (body.nd && ['task', 'algorithm', 'domain', 'space'].includes(unit.ctx)) this.fail(unit, `${expr.fn} contains choices`);
    if (this.algorithmLocal.has(def.name)) this.readLook(unit, `${expr.fn} (it reads the Look)`);
    return { t: resolvePub(def.ret, this.lay.pub), nd: nd || body.nd };
  }

  private checkDef(def: Def, caller: Unit): Inferred {
    const state = this.defState.get(def);
    if (state === 'checking') this.fail(caller, `${def.name} is recursive`);
    if (state) return state;
    this.defState.set(def, 'checking');
    const reads = { look: false };
    const unit: Unit = { ctx: 'def', where: `def ${def.name}`, owner: caller.owner, defs: caller.defs, reads };
    const r = this.infer(def.body, new Map(def.params.map(p => [p.name, resolvePub(p.type, this.lay.pub)])), unit);
    this.expect(r.t, def.ret, unit, 'result');
    this.defState.set(def, r);
    if (r.nd) this.nondeterministic.add(def.name);
    if (reads.look) this.algorithmLocal.add(def.name);
    return r;
  }

  private space(s: Space, defs: Map<string, Def>, where = 'space') {
    const unit = (ctx: Context, w: string): Unit => ({ ctx, where: `${where}: ${w}`, defs });
    switch (s.kind) {
      case 'euclidean':
        this.report(`${where}: Euclidean spaces are not supported yet (Phase 0 defines only their interface)`);
        return;
      case 'dynamic':
        this.root(s.missing, {}, unit('domain', 'missing edges'), T.nat);
        if (s.base.kind !== 'graph') this.report(`${where}: a dynamic space wraps a graph`);
        this.space(s.base, defs, where);
        return;
      case 'graph': {
        const scope: Record<string, Type> = {};
        for (const p of s.params ?? []) {
          scope[p.name] = p.type;
          const arg = s.args?.[p.name];
          if (!arg) this.report(`${where}: no value for parameter ${p.name} of ${s.name}`);
          else this.root(arg, {}, unit('domain', `argument ${p.name}`), p.type);
        }
        if (!isVertexType(s.vertex)) this.report(`${where}: ${s.name}: vertices are Nat, Int or a structure of them, not ${showType(s.vertex)}`);
        if (s.vertices) this.root(s.vertices, scope, unit('space', `${s.name}.vertices`), T.list(s.vertex));
        this.root(s.neighbors.body, { ...scope, [s.neighbors.vertex]: s.vertex }, unit('space', `${s.name}.neighbors`), T.list(s.vertex));
        if (s.automorphisms.kind === 'dihedral') {
          if (s.vertex.k !== 'nat') this.report(`${where}: Cycle.dihedral acts on Nat vertices`);
          this.root(s.automorphisms.n, scope, unit('space', 'Cycle.dihedral'), T.nat);
        }
        if (s.automorphisms.kind === 'translationsAndReflection' && s.vertex.k !== 'int') {
          this.report(`${where}: translations and reflection act on Int vertices`);
        }
        if (!s.vertices && s.automorphisms.kind === 'computed') {
          this.report(`${where}: ${s.name} is infinite: give its automorphisms (they cannot be computed)`);
        }
      }
    }
  }

  check(): CheckResult {
    const { exp, lay } = this;
    const { model, algorithm, task } = exp;
    const defsOf = (...lists: (Def[] | undefined)[]) => new Map(lists.flatMap(l => l ?? []).map(d => [d.name, d]));
    const modelDefs = defsOf(model.defs);
    const unit = (ctx: Context, where: string, defs = modelDefs, owner?: string): Unit => ({ ctx, where, defs, owner });

    for (const p of exp.params) {
      if (!isStorable(p.type)) this.report(`parameter ${p.name}: ${showType(p.type)} cannot be stored`);
      if (p.domain) this.root(p.domain, {}, unit('domain', `domain of ${p.name}`), T.list(p.type));
      if (p.accepts) this.root(p.accepts, {}, unit('domain', `acceptance of ${p.name}`), T.bool);
    }
    this.space(model.space, modelDefs);
    if (model.observation.kind === 'radius') this.root(model.observation.r, {}, unit('domain', 'observation radius'), T.nat);
    else if (!this.finite) this.report('Observe.full needs a finite space: use Observe.radius r');
    if (model.frames.kind === 'portPermutations' && model.frames.among === 'symmetries' && model.space.kind === 'euclidean') {
      this.report('port permutations need a graph');
    }
    this.root(exp.agents.count, {}, unit('init', 'agent count'), T.nat);
    this.root(exp.agents.pos, { i: T.nat }, unit('init', 'agent positions'), T.pos);

    const sensor = (s: Experiment['model']['sensors'][number], where: string, defs: Map<string, Def>, owner?: string, params: Record<string, Type> = {}) => {
      const u = unit('sensor', where, defs, owner);
      const scope: Record<string, Type> = { ...params, L: T.look, ...(s.perLocation ? { l: T.loc } : {}) };
      for (const b of s.look ?? []) {
        const r = this.root(b.value, scope, u);
        if (!r) return;
        scope[b.name] = r.t;
      }
      const t = resolvePub(s.type, algorithm.pub);
      for (const k of ['pos', 'agent', 'loc'] as const) {
        if (mentions(t, k)) this.report(`${where}: a sensor's result cannot contain ${showType({ k } as Type)} (got ${showType(t)})`);
      }
      const body = this.root(s.body, scope, u, s.type);
      if (body?.nd && s.perLocation) this.report(`${where}: a per-location sensor is deterministic; put its choices in its Look-level part (where x := choose ..., at (l : Loc) : T := ...)`);
    };
    for (const s of model.sensors) sensor(s, `sensor ${s.name}`, modelDefs);
    // Parameters, fields and initial values of a component or of the scheduler.
    const owner = (c: Component | Scheduler, defs: Map<string, Def>, params: Record<string, Type>) => {
      for (const p of c.params ?? []) {
        if (!isStorable(p.type)) this.report(`${c.name}: parameter ${p.name} cannot be stored`);
        if (!(p.name in (c.args ?? {}))) this.report(`${c.name}: no value for parameter ${p.name}`);
      }
      for (const f of c.world ?? []) {
        if (!isStorable(f.type)) this.report(`${c.name}: world field ${f.name} cannot be stored`);
        const init = c.init?.world?.[f.name];
        if (!init) this.report(`${c.name}: world field ${f.name} has no initial value`);
        else this.root(init, params, unit('init', `${c.name}.init.${f.name}`, defs, c.name), f.type);
      }
      for (const f of c.agent ?? []) {
        if (!isStorable(f.type)) this.report(`${c.name}: agent field ${f.name} cannot be stored`);
        const init = c.init?.agent?.[f.name];
        if (!init) this.report(`${c.name}: agent field ${f.name} has no initial value`);
        else this.root(init, { ...params, i: T.nat }, unit('init', `${c.name}.init.${f.name}`, defs, c.name), f.type);
      }
      for (const name of Object.keys(c.init?.world ?? {})) {
        if (!c.world?.some(f => f.name === name)) this.report(`${c.name}: initial value for unknown world field ${name}`);
      }
      for (const name of Object.keys(c.init?.agent ?? {})) {
        if (!c.agent?.some(f => f.name === name)) this.report(`${c.name}: initial value for unknown agent field ${name}`);
      }
    };
    for (const c of model.components) {
      const defs = defsOf(model.defs, c.defs);
      const params = Object.fromEntries((c.params ?? []).map(p => [p.name, p.type]));
      owner(c, defs, params);
      for (const s of c.sensors ?? []) sensor(s, `${c.name}.${s.name}`, defs, c.name, params);
      for (const hook of ['beforeLook', 'onCompute', 'beforeMove', 'afterMove'] as const) {
        const body = c[hook];
        const decisions = hook === 'onCompute' || hook === 'beforeMove';
        if (body) this.root(body, { ...params, C: T.config }, unit(decisions ? 'decisionHook' : 'hook', `${c.name}.${hook}`, defs, c.name), T.effect);
      }
    }
    {
      const sc = model.scheduler;
      const defs = defsOf(model.defs, sc.defs);
      const params = Object.fromEntries((sc.params ?? []).map(p => [p.name, p.type]));
      owner(sc, defs, params);
      const instants = sc.events.flat();
      if (sc.events.some(e => !e.length) || instants.length !== 3 || INSTANTS.some(i => instants.indexOf(i) !== INSTANTS.indexOf(i))) {
        this.report(`${sc.name}: events cut the cycle into nonempty groups that list look, compute and move once each, in this order`);
      }
      this.root(sc.schedule, { ...params, C: T.config }, unit('schedule', `${sc.name}.schedule`, defs, sc.name), T.effect);
    }

    // Algorithm: only its Look and sensors; deterministic; memory model; no positions.
    const algDefs = defsOf(model.defs, algorithm.defs);
    for (const [what, t] of [['public state', algorithm.pub], ['memory', algorithm.mem]] as const) {
      if (!isStorable(t)) this.report(`algorithm ${algorithm.name}: its ${what} cannot be stored${mentions(t, 'loc') ? ' (locations are valid for one activation: store a port index instead)' : ''}`);
      else if (mentions(t, 'pos')) this.report(`algorithm ${algorithm.name}: its ${what} cannot hold positions, which algorithms never see`);
    }
    if (model.memory === 'oblivious' && algorithm.mem.k !== 'unit') {
      this.report(`algorithm ${algorithm.name}: the model is oblivious, but the algorithm keeps memory of type ${showType(algorithm.mem)}`);
    }
    const init = (where: string): Unit => ({ ...unit('algorithm', where, algDefs), noLook: true });
    this.root(algorithm.init.pub, { i: T.nat }, init(`${algorithm.name}.init.pub`), algorithm.pub);
    this.root(algorithm.init.mem, { i: T.nat }, init(`${algorithm.name}.init.mem`), algorithm.mem);
    if (!algorithm.native) {
      // A step may omit actions (they keep their defaults): the decision type is only a hint.
      const step = this.root(algorithm.step, { mem: algorithm.mem, pub: algorithm.pub },
        unit('algorithm', `${algorithm.name}.step`, algDefs), undefined, lay.decision);
      if (step) this.checkDecision(step.t, `${algorithm.name}.step`);
    }
    if (algorithm.line) this.root(algorithm.line, { mem: algorithm.mem }, init(`${algorithm.name}.line`), T.nat);

    this.root(task.verdict, { C: T.config }, unit('task', `task ${task.name}`, defsOf(model.defs, task.defs)), T.verdict);

    return {
      errors: this.errors, diagnostics: this.diagnostics, layout: lay,
      nondeterministic: this.nondeterministic, algorithmLocal: this.algorithmLocal, resolutions: this.resolutions,
    };
  }

  /** A step returns `move`, `pub` and `mem`, and possibly some actions. */
  private checkDecision(t: Type, where: string) {
    if (t.k !== 'record') {
      this.report(`${where}: expected a decision record, got ${showType(t)}`);
      return;
    }
    const expected = this.lay.decision as Extract<Type, { k: 'record' }>;
    for (const f of t.fields) {
      const e = expected.fields.find(g => g.name === f.name);
      if (!e) this.report(`${where}: unknown decision field ${f.name}`);
      else if (!typeEq(e.type, f.type)) this.report(`${where}: decision field ${f.name}: expected ${showType(e.type)}, got ${showType(f.type)}`);
    }
    for (const name of ['move', 'pub', 'mem']) {
      if (!t.fields.some(f => f.name === name)) this.report(`${where}: the decision has no ${name}`);
    }
  }
}

export function check(exp: Experiment): CheckResult {
  if (exp.irVersion !== IR_VERSION) {
    const message = `unsupported IR version ${exp.irVersion} (expected ${IR_VERSION})`;
    return { errors: [message], diagnostics: [{ message }], layout: layout(exp), nondeterministic: new Set(), algorithmLocal: new Set(), resolutions: new Map() };
  }
  return new Checker(exp).check();
}

function isVertexType(t: Type): boolean {
  return t.k === 'nat' || t.k === 'int' || (t.k === 'record' && t.fields.every(f => f.type.k === 'nat' || f.type.k === 'int'));
}

function showContext(ctx: Context): string {
  return ({
    init: 'initial values', domain: 'parameter domains and model arguments', sensor: 'a sensor', hook: 'a hook',
    decisionHook: 'a hook', task: 'a task', algorithm: 'an algorithm', def: 'a definition', space: 'a space',
  } as Record<Context, string>)[ctx];
}

function showHole(v: unknown) {
  return typeof v === 'string' ? `.${v}` : typeof v === 'number' ? String(v) : v === null ? 'none' : '[]';
}

function optionOf(t: Type | undefined): Type | undefined {
  return t?.k === 'option' ? t.of : undefined;
}

function elementOf(t: Type | undefined): Type | undefined {
  return t && isCollection(t) ? t.of : undefined;
}

/** Every enumeration type mentioned in the experiment. */
function enumsIn(exp: Experiment): Type[] {
  const found = new Map<string, Type>();
  const visit = (x: unknown): void => {
    if (!x || typeof x !== 'object') return;
    if (Array.isArray(x)) { x.forEach(visit); return; }
    const o = x as Record<string, unknown>;
    if (o.k === 'enum') found.set(JSON.stringify(o), o as Type);
    for (const v of Object.values(o)) visit(v);
  };
  visit(exp);
  return [...found.values()];
}

