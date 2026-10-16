/**
 * Translation of IR expressions to Lean terms (plan, Section 5.1).
 *
 * A deterministic expression becomes a plain term; an expression with a
 * choice becomes a term of type `ND T`, built with `do` and `←`, in the
 * interpreter's evaluation order, so that witnesses coincide. Choice labels
 * are only for display and are dropped.
 */
import { BUILTINS } from '@bramas/simulant-lang/builtins';
import type { Def, Expr, Json, Type } from '@bramas/simulant-lang/ir';
import { fieldType, isCollection, MOVES, resolvePub, showType, T, typeEq, VERDICTS } from '@bramas/simulant-lang/types';

export class GenError extends Error {}

export type Tr = { code: string; t: Type; nd: boolean };

const KEYWORDS = new Set([
  'at', 'by', 'do', 'else', 'end', 'fun', 'from', 'have', 'if', 'in', 'let', 'match', 'open', 'show', 'then', 'with',
  'where', 'structure', 'class', 'instance', 'def', 'theorem', 'namespace', 'section', 'variable', 'import', 'mut',
  'return', 'for', 'unless', 'try', 'catch', 'finally', 'break', 'continue', 'Type', 'Prop', 'Sort', 'local', 'deriving',
]);

export function ident(name: string): string {
  return KEYWORDS.has(name) || !/^[A-Za-z_][A-Za-z0-9_']*$/.test(name) ? `«${name}»` : name;
}

/** How generated code refers to the composition it is part of. */
export interface Env {
  /** Lean types of nodes and agents, the ring size and the number of agents. */
  node: string;
  agent: string;
  N: string;
  k: string;
  /** Name of a record or enum type. */
  typeName(t: Type): string;
  /** The Lean type of the algorithm's public state. */
  pub: string;
  /** `C.world.f`, given the code of the configuration. */
  worldField(config: string, field: string): string;
  agentFlag(agent: string, flag: string): string;
  agentField(agent: string, field: string): string;
  decisionAction(decision: string, action: string): string;
  /** Experiment parameters (initialisation and domains only). */
  param(name: string): string;
  paramType(name: string): Type;
  /** An effect, in a component's hook. */
  effect?(world: [string, string][], raise: [string, { pred?: string; set?: string }][]): string;
  /** Variables of the round available in hooks and sensors. */
  ts?: string;
  ds?: string;
  layout: {
    pub: Type; mem: Type; worldType: Type;
    flags: { name: string }[]; agentFields: { name: string; type: Type }[]; actions: { name: string; type: Type }[];
  };
  defs: Map<string, Def>;
  defName(name: string): string;
}

type Scope = { vars: Map<string, { code: string; t: Type }>; config?: string };

export class Translator {
  private fresh = 0;

  constructor(readonly env: Env) {}

  resolve(t: Type): Type {
    return resolvePub(t, this.env.layout.pub);
  }

  type(t: Type): string {
    const env = this.env;
    switch (t.k) {
      case 'unit': return 'Unit';
      case 'bool': case 'frame': return 'Bool';
      case 'nat': return 'Nat';
      case 'int': return 'Int';
      case 'string': return 'String';
      case 'node': return env.node;
      case 'agent': return env.agent;
      case 'move': return 'Move';
      case 'verdict': return 'Verdict';
      case 'pub': return env.pub;
      case 'option': return `Option (${this.type(t.of)})`;
      case 'list': case 'multiset': return `List (${this.type(t.of)})`;
      case 'enum': case 'record': return env.typeName(t);
      default: throw new GenError(`no Lean type for ${showType(t)}`);
    }
  }

  ctor(t: Type, c: string): string {
    if (t.k === 'move') return `Move.${c}`;
    if (t.k === 'verdict') return `Verdict.${c}`;
    if (t.k === 'enum') return `${this.env.typeName(t)}.${ident(c)}`;
    throw new GenError(`no constructors for ${showType(t)}`);
  }

  lit(v: Json, t: Type): string {
    t = this.resolve(t);
    switch (t.k) {
      case 'unit': return '()';
      case 'bool': case 'frame': return String(v);
      case 'nat': return String(v);
      case 'int': return `(${v} : Int)`;
      case 'string': return JSON.stringify(v);
      case 'node': return `(Fin.ofNat ${this.env.N} ${v})`;
      case 'move': case 'verdict': case 'enum': return this.ctor(t, v as string);
      case 'option': return v === null ? `(none : ${this.type(t)})` : `(some ${this.lit(v, t.of)})`;
      case 'list': case 'multiset': return `([${(v as Json[]).map(x => this.lit(x, t.of)).join(', ')}] : ${this.type(t)})`;
      case 'record': {
        const o = v as Record<string, Json>;
        return `({ ${t.fields.map(f => `${ident(f.name)} := ${this.lit(o[f.name], f.type)}`).join(', ')} } : ${this.type(t)})`;
      }
      default: throw new GenError(`no literals of type ${showType(t)}`);
    }
  }

  private name(prefix: string) {
    return `_${prefix}${++this.fresh}`;
  }

  /** The code of `tr` as a term of type `ND`. */
  nd(tr: Tr): string {
    return tr.nd ? tr.code : `(pure ${wrap(tr.code)})`;
  }

  /** Evaluates `parts` (in order) and combines their values; binds those with choices. */
  private seq(parts: Tr[], t: Type, build: (codes: string[]) => string): Tr {
    if (parts.every(p => !p.nd)) return { code: build(parts.map(p => p.code)), t, nd: false };
    const binds: string[] = [];
    const codes = parts.map(p => {
      if (!p.nd) return p.code;
      const n = this.name('v');
      binds.push(`let ${n} ← ${p.code}`);
      return n;
    });
    return { code: `(do ${binds.join('; ')}; pure ${wrap(build(codes))})`, t, nd: true };
  }

  root(e: Expr, vars: [string, string, Type][], config?: string): Tr {
    const scope: Scope = { vars: new Map(vars.map(([n, code, t]) => [n, { code, t: this.resolve(t) }])), config };
    return this.tr(e, scope);
  }

  tr(e: Expr, scope: Scope): Tr {
    const env = this.env;
    switch (e.e) {
      case 'lit':
        return { code: this.lit(e.value, e.type), t: this.resolve(e.type), nd: false };
      case 'var': {
        const v = scope.vars.get(e.name) ?? fail(`unknown variable ${e.name}`);
        return { code: v.code, t: v.t, nd: false };
      }
      case 'param':
        return { code: env.param(e.name), t: env.paramType(e.name), nd: false };
      case 'let': {
        const v = this.tr(e.value, scope);
        const n = ident(e.name);
        const inner: Scope = { vars: new Map(scope.vars).set(e.name, { code: n, t: v.t }), config: v.t.k === 'config' ? n : scope.config };
        const b = this.tr(e.body, inner);
        if (!v.nd) return { code: `(let ${n} := ${v.code}; ${b.code})`, t: b.t, nd: b.nd };
        return { code: `(do let ${n} ← ${v.code}; ${this.nd(b)})`, t: b.t, nd: true };
      }
      case 'if': {
        const [c, a, b] = [this.tr(e.cond, scope), this.tr(e.then, scope), this.tr(e.else, scope)];
        if (!c.nd && !a.nd && !b.nd) return { code: `(if ${c.code} then ${a.code} else ${b.code})`, t: a.t, nd: false };
        const body = (cond: string) => `if ${cond} then ${this.nd(a)} else ${this.nd(b)}`;
        if (!c.nd) return { code: `(${body(c.code)})`, t: a.t, nd: true };
        const n = this.name('c');
        return { code: `(do let ${n} ← ${c.code}; ${body(n)})`, t: a.t, nd: true };
      }
      case 'match': {
        const on = this.tr(e.on, scope);
        const cases = Object.entries(e.cases).map(([c, b]) => [c, this.tr(b, scope)] as const);
        const other = e.else ? this.tr(e.else, scope) : undefined;
        const branches = [...cases.map(([, b]) => b), ...(other ? [other] : [])];
        const nd = branches.some(b => b.nd);
        const code = (x: string) => `(match ${x} with ${cases.map(([c, b]) => `| ${this.ctor(on.t, c)} => ${nd ? this.nd(b) : b.code}`).join(' ')}${other ? ` | _ => ${nd ? this.nd(other) : other.code}` : ''})`;
        if (!on.nd) return { code: code(on.code), t: branches[0].t, nd };
        const n = this.name('m');
        return { code: `(do let ${n} ← ${on.code}; ${code(n)})`, t: branches[0].t, nd: true };
      }
      case 'fn':
        return fail('a function is only allowed as an argument of a builtin');
      case 'record': {
        const names = Object.keys(e.fields);
        const parts = names.map(n => this.tr(e.fields[n], scope));
        const t = T.record(names.map((name, i) => ({ name, type: parts[i].t })));
        return this.seq(parts, t, cs => `({ ${names.map((n, i) => `${ident(n)} := ${cs[i]}`).join(', ')} } : ${this.type(t)})`);
      }
      case 'with': {
        const on = this.tr(e.on, scope);
        const names = Object.keys(e.fields);
        const parts = [on, ...names.map(n => this.tr(e.fields[n], scope))];
        return this.seq(parts, on.t, ([o, ...cs]) => `{ ${wrap(o)} with ${names.map((n, i) => `${ident(n)} := ${cs[i]}`).join(', ')} }`);
      }
      case 'get':
        return this.get(e, scope);
      case 'choose': {
        const from = this.tr(e.from, scope);
        if (!isCollection(from.t)) fail('choose: expected a collection');
        const such = e.such ? this.lambda(e.such, [from.t.of], scope).code : undefined;
        const site = JSON.stringify(e.site);
        const pick = (l: string) => such ? `ND.chooseSuch ${site} ${wrap(l)} ${such}` : `ND.choose ${site} ${wrap(l)}`;
        if (!from.nd) return { code: `(${pick(from.code)})`, t: from.t.of, nd: true };
        const n = this.name('l');
        return { code: `(do let ${n} ← ${from.code}; ${pick(n)})`, t: from.t.of, nd: true };
      }
      case 'effect': {
        if (!env.effect) fail('effects are only generated in components');
        const world = Object.entries(e.world ?? {}).map(([n, x]) => [n, this.tr(x, scope)] as const);
        const raises = Object.entries(e.raise ?? {}).map(([flag, x]) => {
          if (x.e === 'fn') return [flag, { pred: this.lambda(x, [T.agent], scope).code }] as const;
          return [flag, { set: this.tr(x, scope) }] as const;
        });
        const parts = [...world.map(([, t]) => t), ...raises.flatMap(([, r]) => 'set' in r ? [r.set!] : [])];
        return this.seq(parts, T.effect, cs => {
          let j = world.length;
          return env.effect!(
            world.map(([n], i) => [n, cs[i]]),
            raises.map(([flag, r]) => [flag, 'pred' in r ? { pred: r.pred } : { set: cs[j++] }]),
          );
        });
      }
      case 'call':
        return BUILTINS[e.fn] ? this.builtin(e, scope) : this.callDef(e, scope);
    }
  }

  private get(e: Extract<Expr, { e: 'get' }>, scope: Scope): Tr {
    const env = this.env;
    // `C.world.f`
    if (e.on.e === 'get' && e.on.field === 'world') {
      const C = this.tr(e.on.on, scope);
      if (C.t.k === 'config') {
        const f = env.layout.worldType.k === 'record' ? fieldType(env.layout.worldType, e.field) : undefined;
        if (!f) fail(`unknown world field ${e.field}`);
        return this.seq([C], this.resolve(f), ([c]) => env.worldField(c, e.field));
      }
    }
    const on = this.tr(e.on, scope);
    switch (on.t.k) {
      case 'record': {
        const ft = fieldType(on.t, e.field) ?? fail(`${showType(on.t)} has no field ${e.field}`);
        return this.seq([on], ft, ([o]) => `${wrap(o)}.${ident(e.field)}`);
      }
      case 'config':
        if (e.field === 'agents') return { code: `(List.finRange ${env.k})`, t: T.multiset(T.agent), nd: false };
        return fail(`configurations have no field ${e.field} here`);
      case 'agent': {
        const C = scope.config ?? fail(`reading ${e.field} of an agent needs a configuration`);
        const at = (a: string) => `${C}.agents[${a}]`;
        const lay = env.layout;
        if (e.field === 'pos') return this.seq([on], T.node, ([a]) => `${at(a)}.pos`);
        if (e.field === 'pub') return this.seq([on], lay.pub, ([a]) => `${at(a)}.pub`);
        if (e.field === 'mem') return this.seq([on], lay.mem, ([a]) => `${at(a)}.mem`);
        if (lay.flags.some(f => f.name === e.field)) return this.seq([on], T.bool, ([a]) => env.agentFlag(at(a), e.field));
        const f = lay.agentFields.find(f => f.name === e.field) ?? fail(`agents have no field ${e.field}`);
        return this.seq([on], f.type, ([a]) => env.agentField(at(a), e.field));
      }
      case 'decision': {
        if (e.field === 'move' || e.field === 'decided') {
          return this.seq([on], e.field === 'move' ? T.move : T.bool, ([d]) => `${wrap(d)}.${e.field}`);
        }
        const a = env.layout.actions.find(a => a.name === e.field) ?? fail(`decisions have no action ${e.field}`);
        return this.seq([on], a.type, ([d]) => env.decisionAction(d, e.field));
      }
      default:
        return fail(`${showType(on.t)} has no fields`);
    }
  }

  /** A deterministic lambda, with typed parameters. */
  lambda(e: Expr, params: Type[], scope: Scope): { code: string; ret: Type } {
    if (e.e !== 'fn') fail('expected a function');
    const vars = new Map(scope.vars);
    const binders = e.params.map((p, i) => {
      const t = this.resolve(params[i]);
      const n = ident(p.name);
      vars.set(p.name, { code: n, t });
      return `(${n} : ${this.type(t)})`;
    });
    const body = this.tr(e.body, { vars, config: scope.config });
    if (body.nd) fail('a function passed to a builtin cannot contain choices');
    return { code: `(fun ${binders.join(' ')} => ${body.code})`, ret: body.t };
  }

  private callDef(e: Extract<Expr, { e: 'call' }>, scope: Scope): Tr {
    const def = this.env.defs.get(e.fn) ?? fail(`unknown function ${e.fn}`);
    const args = e.args.map(a => this.tr(a, scope));
    const ret = this.resolve(def.ret);
    const call = (cs: string[]) => `(${this.env.defName(e.fn)} ${cs.map(wrap).join(' ')})`;
    // Definitions are generated before their callers, which marks those with choices.
    if (!(def as Def & { nd?: boolean }).nd) return this.seq(args, ret, call);
    return this.bindSeq(args, ret, call);
  }

  /** Like `seq`, when the combination is itself a term of type `ND`. */
  private bindSeq(parts: Tr[], t: Type, build: (codes: string[]) => string): Tr {
    const binds: string[] = [];
    const codes = parts.map(p => {
      if (!p.nd) return p.code;
      const n = this.name('v');
      binds.push(`let ${n} ← ${p.code}`);
      return n;
    });
    return { code: binds.length ? `(do ${binds.join('; ')}; ${build(codes)})` : build(codes), t, nd: true };
  }

  private builtin(e: Extract<Expr, { e: 'call' }>, scope: Scope): Tr {
    const env = this.env;
    const sig = BUILTINS[e.fn];
    const types: Type[] = [];
    const parts: Tr[] = [];
    const lambdas: (string | undefined)[] = [];
    e.args.forEach((arg, i) => {
      const lam = sig.lambdas?.[i];
      if (lam) {
        const params = lam(types);
        if (typeof params === 'string') fail(params);
        const l = this.lambda(arg, params, scope);
        types.push(T.fn(params, l.ret));
        lambdas.push(l.code);
      } else {
        const p = this.tr(arg, scope);
        types.push(p.t);
        parts.push(p);
        lambdas.push(undefined);
      }
    });
    const ret = sig.ret(types);
    if (typeof ret === 'string') fail(ret);
    const C = scope.config;
    return this.seq(parts, ret, vals => {
      let j = 0;
      const a = lambdas.map(l => l ?? vals[j++]);
      const w = a.map(wrap);
      const t0 = types[0];
      switch (e.fn) {
        case 'not': return `(!${w[0]})`;
        case 'and': return `(${w.join(' && ')})`;
        case 'or': return `(${w.join(' || ')})`;
        case 'implies': return `(!${w[0]} || ${w[1]})`;
        case 'eq': return `(${w[0]} == ${w[1]})`;
        case 'ne': return `(${w[0]} != ${w[1]})`;
        case 'lt': return `(decide (${w[0]} < ${w[1]}))`;
        case 'le': return `(decide (${w[0]} ≤ ${w[1]}))`;
        case 'gt': return `(decide (${w[0]} > ${w[1]}))`;
        case 'ge': return `(decide (${w[0]} ≥ ${w[1]}))`;
        case 'add': return `(${w[0]} + ${w[1]})`;
        case 'sub': return `(${w[0]} - ${w[1]})`;
        case 'mul': return `(${w[0]} * ${w[1]})`;
        case 'div': return `(${w[0]} / ${w[1]})`;
        case 'mod': return `(${w[0]} % ${w[1]})`;
        case 'min': return `(min ${w[0]} ${w[1]})`;
        case 'max': return `(max ${w[0]} ${w[1]})`;
        case 'toInt': return `(Int.ofNat ${w[0]})`;
        case 'some': return `(some ${w[0]})`;
        case 'isSome': return `${w[0]}.isSome`;
        case 'isNone': return `${w[0]}.isNone`;
        case 'getD': return `(${w[0]}.getD ${w[1]})`;
        case 'length': return `${w[0]}.length`;
        case 'isEmpty': return `${w[0]}.isEmpty`;
        case 'filter': return `(${w[0]}.filter ${w[1]})`;
        case 'any': return `(${w[0]}.any ${w[1]})`;
        case 'all': return `(${w[0]}.all ${w[1]})`;
        case 'count': return `(${w[0]}.countP ${w[1]})`;
        case 'map': return `(${w[0]}.map ${w[1]})`;
        case 'sum': return `${w[0]}.sum`;
        case 'mem': return `(${w[1]}.contains ${w[0]})`;
        case 'range': return `(List.range ${w[0]})`;
        case 'toMultiset': return a[0];
        case 'subsets': case 'subsetsUpTo':
          if (t0.k === 'multiset' && (t0 as { of: Type }).of.k !== 'agent') {
            fail(`${e.fn} of a multiset of ${showType((t0 as { of: Type }).of)}: equal elements are not merged in Lean yet`);
          }
          return e.fn === 'subsets' ? `(B.subsets ${w[0]})` : `(B.subsetsUpTo ${w[1]} ${w[0]})`;
        case 'dedup': return `${w[0]}.eraseDups`;
        case 'diff': return `(B.diff ${w[0]} ${w[1]})`;
        case 'append': return `(${w[0]} ++ ${w[1]})`;
        case 'list': return `[${a.join(', ')}]`;
        case 'at': return `(${w[0]}[${a[1]}]!)`;
        case 'ofFn': return `(B.ofFn ${w[0]} ${w[1]})`;
        case 'agents': return `(List.finRange ${env.k})`;
        case 'nodes': return `(List.finRange ${env.N})`;
        case 'size': return env.N;
        case 'correct': return `(FlagSet.correct ${C ?? fail('correct needs a configuration')}.agents[${a[0]}].flags)`;
        case 'present': return `(FlagSet.present ${C ?? fail('present needs a configuration')}.agents[${a[0]}].flags)`;
        case 'decisionOf': return `(${env.ds ?? fail('decisionOf outside beforeMove')} ${w[0]})`;
        case 'target': return `(Ring.target ${w[0]} ${w[1]})`;
        case 'advance': return `(Ring.advance ${w[0]} ${w[1]} ${w[2]})`;
        case 'edgePresent': return `(Ring.canMove ${env.ts ?? fail('no topology state here')} ${w[0]} ${w[1]})`;
        case 'offset': return `(Ring.offset ${w[0]} ${w[1]} ${w[2]})`;
        case 'toGlobal': return `(toGlobal ${w[0]} ${w[1]})`;
        case 'opposite': return `(Move.flip ${w[0]})`;
        case 'frames': return '[false, true]';
        case 'node': return `(Fin.ofNat ${env.N} ${w[0]})`;
        default: return fail(`builtin ${e.fn} has no Lean translation`);
      }
    });
  }
}

export function fail(msg: string): never {
  throw new GenError(msg);
}

/** Parenthesizes a term unless it is atomic. */
export function wrap(code: string): string {
  return /^[A-Za-z0-9_.'«»!]+$/.test(code) || /^\(.*\)$/s.test(code) && balanced(code.slice(1, -1)) ? code : `(${code})`;
}

function balanced(s: string): boolean {
  let depth = 0;
  for (const ch of s) {
    if (ch === '(') depth++;
    else if (ch === ')' && --depth < 0) return false;
  }
  return depth === 0;
}

export { MOVES, VERDICTS, typeEq };
