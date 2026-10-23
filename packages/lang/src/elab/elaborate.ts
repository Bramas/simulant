/**
 * Elaboration of `.sim` declarations to IR (docs/sim-language.md, docs/core-redesign.md).
 *
 * Two levels:
 * - definitions whose type is a model piece (`Component`, `Model`, `Sensor`, `Space`,
 *   `Observation`, `Frames`, `Round`, `Memory`, or lists of them) are evaluated at compile
 *   time, with their arguments: model families are functions. Experiment parameters in their
 *   arguments (`Graphs.Cycle N`, `Observe.radius (param phi)`) stay symbolic: they are IR
 *   expressions, evaluated per setting;
 * - expressions inside hooks, sensors, tasks, algorithms, initial values and
 *   parameter domains are translated to IR expressions. A component's
 *   parameters stay symbolic in its expressions.
 *
 * Constructors, `none` and `[]` become literals of type `infer`, resolved by
 * the checker once the experiment is assembled (`resolve.ts`).
 */
import { BUILTINS } from '../builtins';
import { check, type Diagnostic as CheckDiagnostic } from '../check';
import type {
  Action, Algorithm, Automorphisms, Component, DeclSource, Def, Experiment, Expr, Fairness, Field, Flag, Frames, Goal, Instant, Json,
  Model, Observation, Param, Scheduler, Sensor, Space, Task, Type,
} from '../ir';
import { IR_VERSION } from '../ir';
import type { SArg, SDecl, SExpr, SRecordItem, SType, SWhereItem } from '../parse/ast';
import type { Span } from '../parse/lexer';
import { Parser } from '../parse/parser';
import { fillActionDefaults, lower, type Procedure } from './lower';
import { resolveTypes } from '../resolve';
import { T } from '../types';
import type { Diagnostic } from './program';
import { Program } from './program';

export class ElabError extends Error {
  constructor(message: string, readonly span?: Span) {
    super(message);
  }
}

const fail = (msg: string, span?: Span): never => { throw new ElabError(msg, span); };

// ---------------------------------------------------------------------------
// Meta values

type MV =
  | { m: 'nat'; v: number }
  | { m: 'bool'; v: boolean }
  | { m: 'str'; v: string }
  | { m: 'enum'; type: Type & { k: 'enum' }; ctor: string }
  | { m: 'list'; items: MV[] }
  | { m: 'option'; value?: MV }
  | { m: 'component'; ir: Component }
  | { m: 'scheduler'; ir: Scheduler }
  | { m: 'model'; ir: Model }
  | { m: 'sensor'; ir: Sensor }
  | { m: 'space'; ir: Space }
  | { m: 'observation'; ir: Observation }
  | { m: 'frames'; ir: Frames }
  | { m: 'automorphisms'; ir: Automorphisms }
  /** An object-level expression over experiment parameters (`N`, `param phi`), evaluated per setting. */
  | { m: 'expr'; e: Expr };

const metaEnum = (name: string, ctors: string[]) => T.enum(name, ctors) as Type & { k: 'enum' };
const INSTANT = metaEnum('Instant', ['look', 'compute', 'move']);
const FAIRNESS = metaEnum('Fairness', ['activation', 'none']);
const MEMORY = metaEnum('Memory', ['persistent', 'oblivious']);
const SYMMETRIES = metaEnum('Symmetries', ['derived', 'none']);
const MOVEMENT = metaEnum('Movement', ['alongEdges']);
const PERSISTENCE = metaEnum('Persistence', ['perLook', 'perRobot']);
const PORT_PERMUTATIONS = metaEnum('PortPermutations', ['all', 'symmetries']);
const AUTOMORPHISMS = metaEnum('Automorphisms', ['computed', 'translationsAndReflection']);
const META_ENUMS = [INSTANT, FAIRNESS, MEMORY, SYMMETRIES, MOVEMENT, PERSISTENCE, PORT_PERMUTATIONS, AUTOMORPHISMS];
const META_TYPES = new Set(['Component', 'Scheduler', 'Model', 'Sensor', 'Space', 'Observation', 'Frames', ...META_ENUMS.map(e => e.name)]);

function isMetaType(t: SType | undefined): boolean {
  if (!t || t.t !== 'name') return false;
  return META_TYPES.has(t.name) || (t.name === 'List' && isMetaType(t.args[0]));
}

/** A function on values (`def f (x : T) : R := e`), as opposed to a model-level definition. */
function isObjectDef(d: SDecl | undefined): d is Extract<SDecl, { d: 'def' }> {
  return !!d && d.d === 'def' && !!d.body && !!d.type && !isMetaType(d.type);
}

const COLLECTION_METHODS_WITH_FN = new Set(['filter', 'map', 'any', 'all', 'count']);
const BUILTIN_FUNCTIONS = new Set([
  'present', 'correct', 'decisionOf', 'pos', 'neighbors', 'distance', 'range', 'subsets', 'nonemptySubsets', 'subsetsUpTo', 'ofFn', 'show', 'min',
  'max', 'some', 'toInt', 'toNat',
]);
/** Builtins written as names, without arguments. */
const BUILTIN_NAMES = new Set(['here', 'visible', 'positions']);
/** Builtins whose arguments at these positions are functions. */
const FUNCTION_ARGS: Record<string, number[]> = { filter: [1], map: [1], any: [1], all: [1], count: [1], ofFn: [1] };

const BINOPS: Record<string, string> = {
  '=': 'eq', '≠': 'ne', '<': 'lt', '>': 'gt', '≤': 'le', '≥': 'ge', '+': 'add', '-': 'sub', '*': 'mul', '/': 'div', '%': 'mod',
};

/** Where an object-level expression is translated. */
type OCtx = {
  /** Surface names of local variables, and their IR names. */
  scope: Map<string, string>;
  /** Experiment parameters referred to by name (domains, initial values). */
  params: Set<string>;
  /** The component or sensor whose choices this expression makes (witness sites). */
  owner: string;
  /** The innermost `let` (or initialised field), naming choices. */
  letName?: string;
  /** In a hook: records in tail position are effects. */
  effects?: boolean;
  /** In a step: records in tail position are decisions, with `pub` and `mem` kept by default. */
  decision?: { pub: string; mem: string };
  /** Parameters of a sensor family, replaced by their values. */
  constants?: Map<string, Expr>;
  /** Nesting depth of lambdas: generated parameter names depend only on it, so IR is reproducible. */
  depth?: number;
  /** In a task: the algorithm's outputs, read as fields of agents (`a.claim`). */
  outputs?: Map<string, SExpr>;
};

export type ElabResult = { experiment?: Experiment; diagnostics: Diagnostic[] };

/** What a declaration is, in `Experiment.source` (model-level definitions by their type). */
function declKind(d: SDecl): DeclSource['kind'] | undefined {
  switch (d.d) {
    case 'experiment': case 'algorithm': case 'task': case 'sensor': return d.d;
    case 'def': {
      const t = d.type?.t === 'name' ? d.type.name : undefined;
      return t === 'Component' ? 'component' : t === 'Scheduler' ? 'scheduler' : t === 'Model' ? 'model' : t === 'Sensor' ? 'sensor'
        : t === 'Space' ? 'space' : 'definition';
    }
  }
  return undefined;
}

export class Elaborator {
  /** Source spans of IR expressions, for diagnostics. */
  readonly spans = new WeakMap<Expr, Span>();
  readonly diagnostics: Diagnostic[] = [];
  private readonly globals = new Map<string, SDecl>();
  private readonly enums = new Map<string, Type & { k: 'enum' }>();
  private readonly structures = new Map<string, Extract<SDecl, { d: 'structure' }>>();
  private readonly goals = new Map<string, { goal: Goal; span: Span }>();
  /** Object-level definitions, elaborated once, in dependency order, with the definitions they call. */
  private readonly objectDefs = new Map<string, { def?: Def; deps: Set<string>; span?: Span }>();
  /** The definitions called by what is being elaborated (they go with it into the IR). */
  private calledDefs?: Set<string>;
  /** The declarations the experiment being built uses, for `Experiment.source` (display only). */
  private uses?: Map<string, DeclSource>;
  /** The names algorithms read sensors by: a sensor's own name, or the one it implements. */
  private readonly sensorNames = new Set<string>();

  constructor(readonly program: Program) {
    this.diagnostics.push(...program.diagnostics);
    for (const d of program.decls()) {
      if (d.d === 'import') continue;
      if (d.d === 'goal') { this.goals.set(d.name, { goal: d.goal, span: d.span }); continue; }
      if (this.globals.has(d.name)) {
        this.diagnostics.push({ message: `${d.name} is declared twice`, span: d.span });
        continue;
      }
      this.globals.set(d.name, d);
      if (d.d === 'inductive') this.enums.set(d.name, T.enum(d.name, d.ctors) as Type & { k: 'enum' });
      if (d.d === 'structure') this.structures.set(d.name, d);
      if (d.d === 'sensor') {
        this.sensorNames.add(d.name.split('.').pop()!);
        const implemented = d.attrs.find(a => a.name === 'implements')?.args[0];
        if (implemented) this.sensorNames.add(implemented);
      }
    }
  }

  /** Evaluates a model-level expression, such as `Hazards.BlackHole .mayEmerge`. */
  evaluate(text: string): Component | Model | Sensor {
    const v = this.meval(new Parser(text, '<expression>').expr(), new Map());
    if (v.m === 'component' || v.m === 'model' || v.m === 'sensor') return v.ir;
    return fail(`${text} is not a component, a model or a sensor`);
  }

  /** The experiments declared in the entry module. */
  experiments(): string[] {
    const entry = this.program.modules.get(this.program.entry);
    return (entry?.decls ?? []).filter(d => d.d === 'experiment').map(d => (d as { name: string }).name);
  }

  // -------------------------------------------------------------------------
  // Types

  type(t: SType): Type {
    if (t.t === 'record') return T.record(t.fields.map(f => ({ name: f.name, type: this.type(f.type) })));
    const arg = (i = 0) => t.args[i] ? this.type(t.args[i]) : fail(`${t.name} needs a type argument`, t.span);
    switch (t.name) {
      case 'Nat': return T.nat;
      case 'Int': return T.int;
      case 'Bool': return T.bool;
      case 'String': return T.string;
      case 'Unit': return T.unit;
      case 'Pos': return T.pos;
      case 'Loc': return T.loc;
      case 'Look': return T.look;
      case 'Agent': return T.agent;
      case 'Config': return T.config;
      case 'Node': return fail('Node is gone: positions have type Pos (docs/core-redesign.md)', t.span);
      case 'Move': return fail('Move is gone: an algorithm moves to a location (move l), and stores a port index (Nat)', t.span);
      case 'Frame': return fail('Frame is gone: frames are declared by the model (Frames.isomorphisms, Frames.identity, ...)', t.span);
      case 'Verdict': return T.verdict;
      case 'Pub': return T.pub;
      case 'Option': return T.option(arg());
      case 'List': return T.list(arg());
      case 'Multiset': return T.multiset(arg());
    }
    const e = this.enums.get(t.name);
    if (e) return e;
    const s = this.structures.get(t.name);
    if (s) return T.record(s.fields.map(f => ({ name: f.name, type: this.type(f.type) })));
    return fail(`unknown type ${t.name}`, t.span);
  }

  private enumType(t: SType | undefined): (Type & { k: 'enum' }) | undefined {
    if (!t || t.t !== 'name') return undefined;
    return META_ENUMS.find(e => e.name === t.name) ?? this.enums.get(t.name);
  }

  // -------------------------------------------------------------------------
  // Meta level

  private meval(e: SExpr, env: Map<string, MV>, expected?: SType): MV {
    switch (e.t) {
      case 'num': return { m: 'nat', v: e.value };
      case 'bool': return { m: 'bool', v: e.value };
      case 'str': return { m: 'str', v: e.value };
      case 'ctor': {
        const t = this.enumType(expected) ?? this.uniqueEnum(e.name, e.span);
        if (!t.ctors.includes(e.name)) fail(`.${e.name} is not a constructor of ${t.name}`, e.span);
        return { m: 'enum', type: t, ctor: e.name };
      }
      case 'list': {
        const elem = expected?.t === 'name' && expected.name === 'List' ? expected.args[0] : undefined;
        return { m: 'list', items: e.items.map(i => this.meval(i, env, elem)) };
      }
      case 'binop': {
        if (e.op === '++') {
          const [a, b] = [this.meval(e.l, env, expected), this.meval(e.r, env, expected)];
          if (a.m !== 'list' || b.m !== 'list') fail('++ joins lists', e.span);
          return { m: 'list', items: [...(a as { items: MV[] }).items, ...(b as { items: MV[] }).items] };
        }
        if (e.op === '=' || e.op === '≠') {
          const a = this.meval(e.l, env);
          const b = this.meval(e.r, env, a.m === 'enum' ? { t: 'name', name: a.type.name, args: [], span: e.span } : undefined);
          const same = JSON.stringify(stripType(a)) === JSON.stringify(stripType(b));
          return { m: 'bool', v: e.op === '=' ? same : !same };
        }
        if (e.op === '∧' || e.op === '∨') {
          const a = this.bool(this.meval(e.l, env), e.l.span), b = this.bool(this.meval(e.r, env), e.r.span);
          return { m: 'bool', v: e.op === '∧' ? a && b : a || b };
        }
        return fail(`${e.op} cannot be evaluated when building a model`, e.span);
      }
      case 'if':
        return this.bool(this.meval(e.cond, env), e.cond.span) ? this.meval(e.then, env, expected) : this.meval(e.else, env, expected);
      case 'ascribe':
        return this.meval(e.e, env, e.type);
      case 'param':
        return { m: 'expr', e: this.mark({ e: 'param', name: e.name }, e.span) };
      case 'name':
        if (e.name === 'none' && expected?.t === 'name' && expected.name === 'Option') return { m: 'option' };
        return env.get(e.name) ?? this.metaCall(e.name, [], e.span, env);
      case 'app': {
        if (e.fn.t === 'name' && e.fn.name === 'some' && expected?.t === 'name' && expected.name === 'Option' && e.args.length === 1) {
          return { m: 'option', value: this.meval(e.args[0].value, env, expected.args[0]) };
        }
        if (e.fn.t !== 'name') fail('expected the name of a definition', e.fn.span);
        return this.metaCall((e.fn as { name: string }).name, e.args, e.span, env);
      }
      default:
        return fail('this expression cannot be evaluated when building a model', e.span);
    }
  }

  private bool(v: MV, span: Span): boolean {
    return v.m === 'bool' ? v.v : fail('expected a Bool', span);
  }

  private uniqueEnum(ctor: string, span: Span): Type & { k: 'enum' } {
    const all = [...this.enums.values(), ...META_ENUMS].filter(t => t.ctors.includes(ctor));
    if (all.length === 1) return all[0];
    return fail(all.length ? `ambiguous constructor .${ctor}: ${all.map(t => t.name).join(' or ')}` : `unknown constructor .${ctor}`, span);
  }

  /** Calls a definition, a sensor, or a builtin of the model level. */
  private metaCall(name: string, args: SArg[], span: Span, env: Map<string, MV>): MV {
    const arg = (i: number, n: string): SExpr | undefined => args.find(a => a.name === n)?.value ?? args.filter(a => !a.name)[i]?.value;
    const required = (i: number, n: string): SExpr => arg(i, n) ?? fail(`${name}: missing argument ${n}`, span);
    const nat = (x: SExpr) => this.exprOf(this.meval(x, env), x.span, T.nat);
    switch (name) {
      case 'Graphs.Dynamic': {
        const base = this.meval(required(0, 'base'), env);
        if (base.m !== 'space') fail('Graphs.Dynamic takes a space and a number of missing edges', span);
        return { m: 'space', ir: { kind: 'dynamic', base: (base as { ir: Space }).ir, missing: nat(required(1, 'missing')) } };
      }
      case 'Euclidean.Plane': return { m: 'space', ir: { kind: 'euclidean', dim: 2 } };
      case 'Observe.full': return { m: 'observation', ir: { kind: 'full' } };
      case 'Observe.radius': return { m: 'observation', ir: { kind: 'radius', r: nat(required(0, 'r')) } };
      case 'Frames.isomorphisms': return { m: 'frames', ir: { kind: 'isomorphisms' } };
      case 'Frames.identity': return { m: 'frames', ir: { kind: 'identity' } };
      case 'Frames.portPermutations': {
        const ctor = (x: SExpr | undefined, t: Type & { k: 'enum' }, d: string) => {
          if (!x) return d;
          const v = this.meval(x, env, { t: 'name', name: t.name, args: [], span: x.span });
          return v.m === 'enum' && v.type === t ? v.ctor : fail(`expected a ${t.name}`, x.span);
        };
        return {
          m: 'frames',
          ir: {
            kind: 'portPermutations',
            when: ctor(required(0, 'when'), PERSISTENCE, 'perLook') as 'perLook' | 'perRobot',
            among: ctor(arg(1, 'among'), PORT_PERMUTATIONS, 'all') as 'all' | 'symmetries',
          },
        };
      }
      case 'Cycle.dihedral': return { m: 'automorphisms', ir: { kind: 'dihedral', n: nat(required(0, 'n')) } };
      case 'Ring': case 'DynamicRing': return fail(`${name} is gone: use Graphs.Cycle N (or Graphs.Dynamic (Graphs.Cycle N) k)`, span);
      case 'Frames.common': case 'Frames.dynamicReflection': case 'Frames.persistent':
        return fail(`${name} is gone: use Frames.identity, Frames.isomorphisms or Frames.portPermutations .perRobot`, span);
    }
    const decl = this.globals.get(name) ?? fail(`unknown name ${name}`, span);
    this.use(decl);
    if (decl.d === 'sensor') return { m: 'sensor', ir: this.sensor(decl, this.bindArgs(decl.params.filter(p => !runtimeBinder(p.type)), args, env, span)) };
    if (decl.d !== 'def' || !isMetaType(decl.type)) return fail(`${name} cannot be used when building a model`, span);
    const bound = this.bindArgs(decl.params, args, env, span);
    const t = decl.type as Extract<SType, { t: 'name' }>;
    if (decl.body) return this.meval(decl.body, bound, decl.type);
    if (t.name === 'Component') return { m: 'component', ir: this.component(decl, bound) };
    if (t.name === 'Scheduler') return { m: 'scheduler', ir: this.scheduler(decl, bound) };
    if (t.name === 'Model') return { m: 'model', ir: this.model(decl, bound) };
    if (t.name === 'Space') return { m: 'space', ir: this.space(decl, bound) };
    return fail(`a ${t.name} is defined by a value (:=), not a where block`, decl.span);
  }

  /** A model-level value as an object-level expression: a literal, or a symbolic parameter expression. */
  private exprOf(v: MV, span: Span, type: Type): Expr {
    if (v.m === 'expr') return v.e;
    if (v.m === 'enum') return this.lit(v.type, v.ctor, span);
    return this.lit(type, this.json(v, span), span);
  }

  private bindArgs(params: { name: string; type: SType; default?: SExpr; span: Span }[], args: SArg[], env: Map<string, MV>, span: Span) {
    const bound = new Map<string, MV>();
    const positional = args.filter(a => !a.name);
    let next = 0;
    for (const p of params) {
      const named = args.find(a => a.name === p.name);
      const arg = named?.value ?? positional[next++]?.value;
      if (arg) bound.set(p.name, this.meval(arg, env, p.type));
      else if (p.default) bound.set(p.name, this.meval(p.default, bound, p.type));
      else fail(`missing argument ${p.name}`, span);
    }
    if (next < positional.length) fail('too many arguments', span);
    for (const a of args) if (a.name && !params.some(p => p.name === a.name)) fail(`no parameter named ${a.name}`, a.value.span);
    return bound;
  }

  /** A meta value as an IR literal (component arguments, sensor parameters). */
  private json(v: MV, span: Span): Json {
    switch (v.m) {
      case 'nat': case 'bool': case 'str': return v.v;
      case 'enum': return v.ctor;
      case 'list': return v.items.map(i => this.json(i, span));
      case 'option': return v.value ? this.json(v.value, span) : null;
      default: return fail('expected a value', span);
    }
  }

  /** `@[equivariant]`: a claim relative to the automorphisms that the model's frames keep. */
  private equivariant(d: SDecl): true | undefined {
    const a = d.attrs.find(a => a.name === 'equivariant');
    if (a?.args.length) fail('write @[equivariant]: the claim is relative to the automorphisms that the frames keep', d.span);
    return a ? true : undefined;
  }

  // -------------------------------------------------------------------------
  // Components, sensors, models

  /** What components and schedulers share: parameters, `World` and `Agent` fields, initial values and hooks. */
  private parts(decl: Extract<SDecl, { d: 'def' }>, args: Map<string, MV>) {
    const name = decl.name.split('.').pop()!;
    const items = new Map(decl.items!.map(i => [i.name + (i.args.length ? '/' + i.args.length : ''), i]));
    const typeItem = (n: string) => {
      const i = items.get(n);
      if (!i) return undefined;
      if (i.value.t !== 'typeValue' || i.value.type.t !== 'record') fail(`${n} is a record type: { f : T, ... }`, i.span);
      return (i.value as { type: Extract<SType, { t: 'record' }> }).type.fields.map(f => ({ name: f.name, type: this.type(f.type) }));
    };
    // Model-level parameters (a scheduler's events) are used when the piece is built, not at run time.
    const params: Field[] = decl.params.filter(p => !isMetaType(p.type)).map(p => ({ name: p.name, type: this.type(p.type) }));
    const scope = new Map(params.map(p => [p.name, p.name]));
    const ctx = (extra: [string, string][] = []): OCtx => ({ scope: new Map([...scope, ...extra]), params: new Set(), owner: name });
    const initRecord = (item: SWhereItem | undefined, extra: [string, string][]) => {
      if (!item) return undefined;
      if (item.value.t !== 'record' || item.value.base) fail('init is a record of initial values: { f := e, ... }', item.value.span);
      const out: Record<string, Expr> = {};
      for (const it of (item.value as { items: SRecordItem[] }).items) {
        if (it.t !== 'field') fail('unexpected raise in init', it.span);
        const f = it as { name: string; value?: SExpr; span: Span };
        out[f.name] = this.tr(f.value ?? { t: 'name', name: f.name, span: f.span }, { ...ctx(extra), letName: f.name });
      }
      return out;
    };
    const agentInit = items.get('init/1');
    const hook = (n: string) => {
      const i = [...items.values()].find(i => i.name === n);
      if (!i) return undefined;
      if (i.args.length !== 1) fail(`${n} takes the configuration: ${n} C := ...`, i.span);
      return this.tr(i.value, { ...ctx([[i.args[0], 'C']]), effects: true });
    };
    const known = (what: string, names: string[]) => {
      for (const i of decl.items!) {
        if (!names.includes(i.name)) fail(`unknown ${what} field ${i.name} (expected one of ${names.join(', ')})`, i.span);
      }
    };
    return {
      name, items, scope, known, hook,
      common: dropUndefined({
        params: params.length ? params : undefined,
        args: params.length ? Object.fromEntries(params.map(p => [p.name, this.json(args.get(p.name)!, decl.span)])) : undefined,
        world: typeItem('World'),
        agent: typeItem('Agent'),
        init: dropUndefined({
          world: initRecord(items.get('init'), []),
          agent: agentInit && initRecord(agentInit, [[agentInit.args[0], 'i']]),
        }),
        equivariant: this.equivariant(decl),
      }),
    };
  }

  private component(decl: Extract<SDecl, { d: 'def' }>, args: Map<string, MV>): Component {
    const { name, items, scope, known, hook, common } = this.parts(decl, args);
    const listItem = <X>(n: string, f: (e: SExpr) => X): X[] => {
      const i = items.get(n);
      if (!i) return [];
      if (i.value.t !== 'list') fail(`${n} is a list`, i.value.span);
      return (i.value as { items: SExpr[] }).items.map(f);
    };
    const flags: Flag[] = listItem('flags', e => e.t === 'flag'
      ? { name: e.name, visibility: e.visibility, acts: e.acts }
      : fail('expected `flag name visible|hidden, acts never|adversary`', e.span));
    const actions: Action[] = listItem('actions', e => {
      if (e.t !== 'action') return fail('expected `action name : Type := default`', e.span);
      const type = this.type(e.type);
      const d = this.meval(e.default, new Map(), e.type);
      return { name: e.name, type, default: this.json(d, e.default.span) };
    });
    const sensors: Sensor[] = listItem('sensors', e => {
      if (e.t !== 'name') return fail('expected the name of a sensor', e.span);
      const full = this.globals.has(`${decl.name}.${e.name}`) ? `${decl.name}.${e.name}` : e.name;
      const s = this.globals.get(full);
      if (!s || s.d !== 'sensor') return fail(`unknown sensor ${e.name}`, e.span);
      this.use(s);
      return this.sensor(s, new Map(), { owner: name, scope });
    });
    known('component', ['World', 'Agent', 'flags', 'actions', 'sensors', 'init', 'beforeLook', 'onCompute', 'beforeMove', 'afterMove']);
    const c: Component = {
      name,
      ...common,
      flags: flags.length ? flags : undefined,
      sensors: sensors.length ? sensors : undefined,
      actions: actions.length ? actions : undefined,
      beforeLook: hook('beforeLook'),
      onCompute: hook('onCompute'),
      beforeMove: hook('beforeMove'),
      afterMove: hook('afterMove'),
    };
    if (c.init && !c.init.world && !c.init.agent) delete c.init;
    return dropUndefined(c);
  }

  /** A scheduler: like a component, with its cut of the cycle, its fairness, and `schedule C := { activate := ..., ... }`. */
  private scheduler(decl: Extract<SDecl, { d: 'def' }>, args: Map<string, MV>): Scheduler {
    const { name, items, known, hook, common } = this.parts(decl, args);
    known('scheduler', ['World', 'Agent', 'init', 'events', 'fairness', 'schedule']);
    const named = (n: string, ...targs: SType[]): SType => ({ t: 'name', name: n, args: targs, span: decl.span });
    const eventsItem = items.get('events');
    let events: Instant[][] = [['look', 'compute', 'move']];
    if (eventsItem) {
      const v = this.meval(eventsItem.value, args, named('List', named('List', named('Instant'))));
      const groups = v.m === 'list' ? v.items : fail('events is a list of events, each a list of instants: [[.look, .compute], [.move]]', eventsItem.span);
      events = groups.map(g => g.m === 'list' && g.items.every(i => i.m === 'enum' && i.type === INSTANT)
        ? g.items.map(i => (i as { ctor: string }).ctor as Instant)
        : fail('each event is a list of instants (.look, .compute, .move)', eventsItem.span));
    }
    const fairnessItem = items.get('fairness');
    const fairnessValue = fairnessItem && this.meval(fairnessItem.value, args, named('Fairness'));
    if (fairnessValue && !(fairnessValue.m === 'enum' && fairnessValue.type === FAIRNESS)) fail('fairness is .activation or .none', fairnessItem!.span);
    const schedule = hook('schedule') ?? fail('a scheduler needs `schedule C := { activate := ... }`', decl.span);
    const sc: Scheduler = {
      name,
      ...common,
      events,
      fairness: (fairnessValue as { ctor?: Fairness } | undefined)?.ctor ?? 'activation',
      schedule,
    };
    if (sc.init && !sc.init.world && !sc.init.agent) delete sc.init;
    return dropUndefined(sc);
  }

  /**
   * A sensor: binders of type `Look` and `Loc` are the observer's Look and the location queried;
   * the others are parameters of the family, fixed by `args`. A Look-level part (`where x := e`)
   * is evaluated once per Look and may contain choices.
   */
  private sensor(decl: Extract<SDecl, { d: 'sensor' }>, args: Map<string, MV>, component?: { owner: string; scope: Map<string, string> }): Sensor {
    const scope = new Map(component?.scope ?? []);
    const constants = new Map<string, Expr>();
    let perLocation = false;
    for (const p of decl.params) {
      const runtime = runtimeBinder(p.type);
      if (p.type.t === 'name' && ['Config', 'Agent', 'Frame'].includes(p.type.name)) {
        fail(`a sensor receives its Look: sensor ${decl.name} (L : Look) [(l : Loc)] : T := ... (${p.type.name} is not available)`, p.span);
      } else if (runtime) {
        scope.set(p.name, runtime);
        if (runtime === 'l') perLocation = true;
      } else {
        const v = args.get(p.name) ?? fail(`missing argument ${p.name} of sensor ${decl.name}`, decl.span);
        constants.set(p.name, { e: 'lit', type: this.type(p.type), value: this.json(v, decl.span) });
      }
    }
    if (![...scope.values()].includes('L')) fail(`a sensor receives its Look: sensor ${decl.name} (L : Look) ...`, decl.span);
    if (decl.attrs.some(a => a.name === 'equivariant')) fail('sensors read only their Look: they need no @[equivariant] claim', decl.span);
    const implemented = decl.attrs.find(a => a.name === 'implements')?.args[0];
    const name = implemented ?? decl.name.split('.').pop()!;
    const owner = component?.owner ?? decl.name.split('.').pop()!;
    const look: { name: string; value: Expr }[] = [];
    for (const b of decl.look ?? []) {
      look.push({ name: b.name, value: this.tr(b.value, { scope: new Map(scope), params: new Set(), owner, constants, letName: b.name }) });
      scope.set(b.name, b.name);
    }
    if (decl.at) {
      if (decl.at.type.t !== 'name' || decl.at.type.name !== 'Loc') fail('at takes a location: at (l : Loc)', decl.at.span);
      scope.set(decl.at.name, 'l');
      perLocation = true;
    }
    const body = this.tr(decl.body, { scope, params: new Set(), owner, constants });
    return dropUndefined({ name, type: this.type(decl.type), perLocation, look: look.length ? look : undefined, body });
  }

  /** A graph space: `Vertex := T`, `vertices := e` (omitted: infinite), `neighbors v := e`, `automorphisms := ...`. */
  private space(decl: Extract<SDecl, { d: 'def' }>, args: Map<string, MV>): Space {
    const items = new Map(decl.items!.map(i => [i.name, i]));
    for (const i of decl.items!) {
      const known = ['Vertex', 'vertices', 'neighbors', 'automorphisms'];
      if (!known.includes(i.name)) fail(`unknown space field ${i.name} (expected one of ${known.join(', ')})`, i.span);
    }
    const params: Field[] = decl.params.map(p => ({ name: p.name, type: this.type(p.type) }));
    const scope = new Map(params.map(p => [p.name, p.name]));
    const ctx = (extra: [string, string][] = []): OCtx => ({ scope: new Map([...scope, ...extra]), params: new Set(), owner: decl.name });
    const vertexItem = items.get('Vertex') ?? fail('a space needs `Vertex := T`', decl.span);
    if (vertexItem.value.t !== 'typeValue') fail('Vertex is a type', vertexItem.span);
    const vertex = this.type((vertexItem.value as { type: SType }).type);
    const neighbors = items.get('neighbors') ?? fail('a space needs `neighbors v := [...]`', decl.span);
    if (neighbors.args.length !== 1) fail('neighbors takes a vertex: neighbors v := [...]', neighbors.span);
    const vertices = items.get('vertices');
    const auto = items.get('automorphisms');
    let automorphisms: Automorphisms = { kind: 'computed' };
    if (auto) {
      const env = new Map<string, MV>([...params.map(p => [p.name, { m: 'expr', e: { e: 'var', name: p.name } } as MV] as const)]);
      const v = this.meval(auto.value, env, { t: 'name', name: 'Automorphisms', args: [], span: auto.span });
      automorphisms = v.m === 'automorphisms' ? v.ir
        : v.m === 'enum' && v.type === AUTOMORPHISMS ? { kind: v.ctor as 'computed' | 'translationsAndReflection' }
        : fail('expected .computed, .translationsAndReflection or Cycle.dihedral n', auto.span);
    }
    const argExprs = Object.fromEntries(params.map(p => [p.name, this.exprOf(args.get(p.name)!, decl.span, p.type)]));
    return dropUndefined({
      kind: 'graph' as const,
      name: decl.name,
      params: params.length ? params : undefined,
      args: params.length ? argExprs : undefined,
      vertex,
      vertices: vertices && this.tr(vertices.value, ctx()),
      neighbors: { vertex: neighbors.args[0], body: this.tr(neighbors.value, ctx([[neighbors.args[0], neighbors.args[0]]])) },
      automorphisms,
    });
  }

  private model(decl: Extract<SDecl, { d: 'def' }>, env: Map<string, MV>): Model {
    const meta = (n: string) => ({ t: 'name', name: n, args: [], span: decl.span }) as SType;
    const expected: Record<string, SType> = {
      memory: meta('Memory'), symmetries: meta('Symmetries'), movement: meta('Movement'),
    };
    const v = (n: string) => {
      const i = decl.items!.find(i => i.name === n);
      return i && this.meval(i.value, env, expected[n]);
    };
    const known = ['space', 'observation', 'frames', 'sensors', 'memory', 'movement', 'scheduler', 'components', 'symmetries'];
    for (const i of decl.items!) {
      if (i.name === 'topology' || i.name === 'frame') fail(`${i.name} is gone: a model has space, observation and frames`, i.span);
      if (i.name === 'round') fail('round is gone: a model has a scheduler (Schedulers.FSync, Schedulers.SSync, Schedulers.Sequential, ...)', i.span);
      if (!known.includes(i.name)) fail(`unknown model field ${i.name} (expected one of ${known.join(', ')})`, i.span);
    }
    const list = (x: MV | undefined, m: string, span: Span) => !x ? [] : x.m === 'list'
      ? x.items.map(i => i.m === m ? (i as { ir: unknown }).ir : fail(`expected a list of ${m}s`, span))
      : fail(`expected a list of ${m}s`, span);
    const piece = <M extends MV['m']>(n: string, m: M): Extract<MV, { m: M }> => {
      const x = v(n) ?? fail(`a model needs \`${n} := ...\``, decl.span);
      return x.m === m ? x as Extract<MV, { m: M }> : fail(`${n}: expected ${m === 'observation' ? 'an' : 'a'} ${m}`, decl.span);
    };
    const ctor = (n: string, d: string) => (v(n) as { ctor?: string } | undefined)?.ctor ?? d;
    const args = [...env.values()].filter(x => x.m === 'enum' || x.m === 'nat').map(x => x.m === 'enum' ? x.ctor : (x as { v: number }).v);
    return dropUndefined({
      name: `${decl.name}${args.length ? `(${args.join(', ')})` : ''}`,
      space: piece('space', 'space').ir,
      observation: piece('observation', 'observation').ir,
      frames: piece('frames', 'frames').ir,
      sensors: list(v('sensors'), 'sensor', decl.span) as Sensor[],
      memory: ctor('memory', 'persistent') as Model['memory'],
      movement: ctor('movement', 'alongEdges') as Model['movement'],
      scheduler: piece('scheduler', 'scheduler').ir,
      components: list(v('components'), 'component', decl.span) as Component[],
      symmetries: ctor('symmetries', 'derived') as Model['symmetries'],
    });
  }

  // -------------------------------------------------------------------------
  // Algorithms, tasks, experiments

  private algorithm(decl: Extract<SDecl, { d: 'algorithm' }>, memory: Model['memory'] = 'persistent'): Algorithm {
    if (decl.items.some(i => i.proc)) return this.structured(decl, memory);
    const item = (n: string) => decl.items.find(i => i.name === n);
    const typeOf = (n: string) => {
      const i = item(n);
      if (!i) return T.unit;
      if (i.value.t !== 'typeValue') fail(`${n} is a type`, i.span);
      return this.type((i.value as { type: SType }).type);
    };
    const owner = decl.name;
    const init = item('init') ?? fail('an algorithm needs `init i := { pub := ..., mem := ... }`', decl.span);
    const iName = init.args[0] ?? 'i';
    const fields = init.value.t === 'record' ? init.value.items : fail('init is a record { pub := ..., mem := ... }', init.value.span);
    const initOf = (n: string) => {
      const f = fields.find(f => f.t === 'field' && f.name === n) as { value?: SExpr } | undefined;
      return f?.value ? this.tr(f.value, { scope: new Map([[iName, 'i']]), params: new Set(), owner }) : this.hole(null, init.span);
    };
    const step = item('step') ?? fail('an algorithm needs `step mem pub := ...`', decl.span);
    if (step.args.length > 2) fail('step takes the memory and the public state: step mem pub := ... (sensors are read by name)', step.span);
    const [m, p] = [step.args[0] ?? 'mem', step.args[1] ?? 'pub'];
    const line = item('line');
    for (const i of decl.items) {
      const known = ['Pub', 'Mem', 'init', 'step', 'line'];
      if (!known.includes(i.name) && !i.name.startsWith('output.')) fail(`unknown algorithm field ${i.name} (expected one of ${known.join(', ')}, or output)`, i.span);
    }
    const mem = typeOf('Mem');
    return dropUndefined({
      name: decl.name,
      uses: decl.uses,
      pub: typeOf('Pub'),
      mem,
      init: { pub: initOf('pub'), mem: mem.k === 'unit' && !fields.some(f => f.t === 'field' && f.name === 'mem') ? this.lit(T.unit, null, init.span) : initOf('mem') },
      step: this.tr(step.value, { scope: new Map([[m, 'mem'], [p, 'pub']]), params: new Set(), owner, decision: { pub: 'pub', mem: 'mem' } }),
      line: line && this.tr(line.value, { scope: new Map([[line.args[0] ?? 'mem', 'mem']]), params: new Set(), owner }),
      source: { file: decl.span.file, line: decl.span.start.line, endLine: decl.span.end.line },
    });
  }

  /** A structured algorithm (procedures, `main`), lowered to a state machine (`lower.ts`). */
  private structured(decl: Extract<SDecl, { d: 'algorithm' }>, memory: Model['memory']): Algorithm {
    const owner = decl.name;
    const procs = new Map<string, Procedure>();
    let main: Procedure | undefined;
    for (const i of decl.items) {
      if (!i.proc) continue;
      if (i.name === 'main') main = i.proc;
      else procs.set(i.name, i.proc);
    }
    if (!main) return fail(`${decl.name}: a structured algorithm needs \`main := ...\``, decl.span);
    for (const i of decl.items) {
      if (!i.proc && !['Pub', 'init'].includes(i.name) && !i.name.startsWith('output.')) {
        fail(`unknown field ${i.name} of a structured algorithm (expected Pub, init, output, def, main; memory is derived)`, i.span);
      }
    }
    const pubItem = decl.items.find(i => i.name === 'Pub');
    const pub = pubItem ? (pubItem.value.t === 'typeValue' ? this.type(pubItem.value.type) : fail('Pub is a type', pubItem.span)) : T.unit;
    const init = decl.items.find(i => i.name === 'init');
    let initPub: Expr = this.lit(T.unit, null, decl.span);
    if (init) {
      if (init.value.t !== 'record') fail('init is a record { pub := ... }', init.value.span);
      const f = (init.value as { items: SRecordItem[] }).items.find(x => x.t === 'field' && x.name === 'pub') as { value?: SExpr } | undefined;
      if (f?.value) initPub = this.tr(f.value, { scope: new Map([[init.args[0] ?? 'i', 'i']]), params: new Set(), owner });
    }
    const lowered = lower(decl.name, procs, main.body, memory === 'oblivious', {
      tr: (e, scope, constants) => this.tr(e, { scope, params: new Set(), owner, constants }),
      type: t => this.type(t),
      fail: (msg, span) => fail(msg, span),
    });
    return dropUndefined({
      name: decl.name, uses: decl.uses, pub, mem: lowered.mem,
      init: { pub: initPub, mem: lowered.initMem },
      step: lowered.step, line: lowered.line,
      source: {
        file: decl.span.file, line: decl.span.start.line, endLine: decl.span.end.line,
        ...(Object.keys(lowered.calls).length ? { calls: lowered.calls } : {}),
      },
    });
  }

  /** The outputs an algorithm declares (`output claim := pub.bh`). */
  private outputs(decl: Extract<SDecl, { d: 'algorithm' }>): Map<string, SExpr> {
    return new Map(decl.items.filter(i => i.name.startsWith('output.')).map(i => [i.name.slice('output.'.length), i.value]));
  }

  private task(decl: Extract<SDecl, { d: 'task' }>, outputs = new Map<string, SExpr>()): Task {
    const C = decl.params.find(p => runtimeBinder(p.type) === 'C')?.name ?? 'C';
    return dropUndefined({
      name: decl.name,
      goal: this.goals.get(decl.name)?.goal ?? 'eventually',
      verdict: this.tr(decl.body, { scope: new Map([[C, 'C']]), params: new Set(), owner: decl.name, outputs }),
      equivariant: this.equivariant(decl),
    });
  }

  /** Elaborates, resolves and checks an experiment of the entry module. */
  experiment(name: string): ElabResult {
    try {
      const decl = this.globals.get(name);
      if (!decl || decl.d !== 'experiment') fail(`no experiment ${name}`);
      const exp = this.buildExperiment(decl as Extract<SDecl, { d: 'experiment' }>);
      const first = check(exp);
      const diagnostics = first.diagnostics.map(d => this.locate(d, decl!.span));
      if (diagnostics.length) return { diagnostics: [...this.diagnostics, ...diagnostics] };
      const types = resolveTypes(exp, first.resolutions, (from, to) => {
        const s = this.spans.get(from);
        if (s) this.spans.set(to, s);
      });
      // After resolution, which replaces literals (and carries their spans over).
      const resolved = { ...types, algorithm: this.located(types.algorithm) };
      const second = check(resolved);
      return second.errors.length
        ? { diagnostics: [...this.diagnostics, ...second.diagnostics.map(d => this.locate(d, decl!.span))] }
        : { experiment: resolved, diagnostics: this.diagnostics };
    } catch (e) {
      if (!(e instanceof ElabError)) throw e;
      return { diagnostics: [...this.diagnostics, { message: e.message, span: e.span }] };
    }
  }

  private locate(d: CheckDiagnostic, fallback: Span): Diagnostic {
    return { message: d.message, span: (d.node && this.spans.get(d.node)) ?? fallback };
  }

  private buildExperiment(decl: Extract<SDecl, { d: 'experiment' }>): Experiment {
    const uses = this.uses = new Map();
    try {
      this.use(decl);
      return this.experimentOf(decl, uses);
    } finally {
      this.uses = undefined;
    }
  }

  /** Records that the experiment being built uses `decl` (display only). */
  private use(decl: SDecl) {
    const kind = declKind(decl);
    const name = 'name' in decl ? decl.name : undefined;
    if (!this.uses || !kind || !name || this.uses.has(`${kind} ${name}`)) return;
    this.uses.set(`${kind} ${name}`, { kind, name, file: decl.span.file, line: decl.span.start.line, endLine: decl.span.end.line });
  }

  private experimentOf(decl: Extract<SDecl, { d: 'experiment' }>, uses: Map<string, DeclSource>): Experiment {
    const item = (n: string) => decl.items.find(i => i.name === n && !i.param);
    const required = (n: string) => item(n) ?? fail(`an experiment needs \`${n} := ...\``, decl.span);
    // Parameters named in the model (`Graphs.Cycle N`) stay symbolic: they are evaluated per setting.
    const symbolic = new Map<string, MV>(decl.items.filter(i => i.param).map(i => [i.name, { m: 'expr', e: this.mark({ e: 'param', name: i.name }, i.span) }]));
    const modelValue = this.meval(required('model').value, symbolic, { t: 'name', name: 'Model', args: [], span: decl.span });
    const ref = (n: string, kind: 'algorithm' | 'task') => {
      const v = required(n).value;
      const d = v.t === 'name' ? this.globals.get(v.name) : undefined;
      if (!d || d.d !== kind) fail(`expected the name of ${kind === 'algorithm' ? 'an algorithm' : 'a task'}`, v.span);
      return d!;
    };
    const algDecl = ref('algorithm', 'algorithm') as Extract<SDecl, { d: 'algorithm' }>;
    const algorithm = this.withDefs(() => this.algorithm(algDecl, (modelValue as { ir: Model }).ir.memory));
    const task = this.withDefs(() => this.task(ref('task', 'task') as Extract<SDecl, { d: 'task' }>, this.outputs(algDecl)));
    const paramNames = new Set<string>();
    // Definitions called by parameter domains and initial positions belong to the model (plan 3.9).
    const used = new Set<string>();
    const outer = this.calledDefs;
    this.calledDefs = used;
    const params: Param[] = decl.items.filter(i => i.param).map(i => {
      const p: Param = { name: i.name, type: this.type(i.param!.type) };
      if (i.value.t !== 'nothing') p.domain = this.tr(i.value, { scope: new Map(), params: new Set(paramNames), owner: decl.name });
      paramNames.add(i.name);
      if (i.param!.accepts) p.accepts = this.tr(i.param!.accepts, { scope: new Map(), params: new Set(paramNames), owner: decl.name });
      return p;
    });
    const ictx = (extra: [string, string][] = []): OCtx => ({ scope: new Map(extra), params: paramNames, owner: decl.name });
    const pos = item('position');
    const limits = item('limits');
    for (const i of decl.items) {
      const known = ['model', 'algorithm', 'task', 'agents', 'position', 'limits'];
      if (!i.param && !known.includes(i.name)) fail(`unknown experiment field ${i.name} (expected one of ${known.join(', ')}, or param)`, i.span);
    }
    const model0 = modelValue.m === 'model' ? modelValue.ir : fail('expected a model', required('model').span);
    const actions = model0.components.flatMap(c => c.actions ?? []);
    let agents: Experiment['agents'];
    try {
      agents = {
        count: this.tr(required('agents').value, ictx()),
        pos: pos ? this.tr(pos.value, ictx([[pos.args[0] ?? 'i', 'i']])) : fail('an experiment needs `position i := ...`', decl.span),
      };
    } finally {
      this.calledDefs = outer;
    }
    const model = used.size ? { ...model0, defs: [...(model0.defs ?? []), ...this.defsIn(used)] } : model0;
    this.use(algDecl);
    const taskDecl = ref('task', 'task') as Extract<SDecl, { d: 'task' }>;
    this.use(taskDecl);
    const goal = this.goals.get(taskDecl.name);
    if (goal) uses.set(`goal ${taskDecl.name}`, { kind: 'goal', name: taskDecl.name, file: goal.span.file, line: goal.span.start.line, endLine: goal.span.end.line });
    for (const d of [...model.defs ?? [], ...algorithm.defs ?? [], ...task.defs ?? []]) {
      const span = this.objectDefs.get(d.name)?.span;
      if (span) uses.set(`definition ${d.name}`, { kind: 'definition', name: d.name, file: span.file, line: span.start.line, endLine: span.end.line });
    }
    return dropUndefined({
      irVersion: IR_VERSION,
      name: decl.name,
      model,
      algorithm: algorithm.native ? algorithm : { ...algorithm, step: fillActionDefaults(algorithm.step, actions) },
      task,
      params,
      agents,
      limits: limits && this.limits(limits),
      source: { file: decl.span.file, line: decl.span.start.line, endLine: decl.span.end.line, uses: [...uses.values()] },
    });
  }

  private limits(i: SWhereItem): Experiment['limits'] {
    if (i.value.t !== 'record') return fail('limits is a record { depth := n, states := n }', i.span);
    const out: Record<string, number> = {};
    for (const it of i.value.items) {
      if (it.t !== 'field' || !it.value || it.value.t !== 'num') fail('expected `depth := n` or `states := n`', it.span);
      out[(it as { name: string }).name] = ((it as { value: { value: number } }).value).value;
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // Object-level definitions

  /** Elaborates an algorithm or a task, with the definitions it calls. */
  private withDefs<X extends Algorithm | Task>(f: () => X): X {
    const outer = this.calledDefs;
    const used = this.calledDefs = new Set();
    try {
      const x = f();
      return used.size ? { ...x, defs: this.defsIn(used) } : x;
    } finally {
      this.calledDefs = outer;
    }
  }

  /**
   * For the explanation of a step (display only): the source lines of the algorithm's step and
   * of its definitions (`at`), and where the definitions are written (`source.defs`).
   */
  private located(a: Algorithm): Algorithm {
    const mark = (x: unknown): void => {
      if (!x || typeof x !== 'object') return;
      if (Array.isArray(x)) { x.forEach(mark); return; }
      const o = x as Record<string, unknown>;
      if (typeof o.e === 'string' && o.at === undefined) {
        const span = this.spans.get(o as Expr);
        if (span) o.at = span.start.line;
      }
      for (const [k, v] of Object.entries(o)) if (k !== 'type') mark(v);
    };
    mark(a.step);
    for (const d of a.defs ?? []) mark(d.body);
    const defs = (a.defs ?? []).flatMap(d => {
      const span = this.objectDefs.get(d.name)?.span;
      return span ? [{ name: d.name, file: span.file, line: span.start.line, endLine: span.end.line }] : [];
    });
    return defs.length && a.source ? { ...a, source: { ...a.source, defs } } : a;
  }

  /** The definitions named in `used`, callees first. */
  private defsIn(used: Set<string>): Def[] {
    return [...this.objectDefs].filter(([n]) => used.has(n)).map(([, d]) => d.def!);
  }

  /** Records a call to an object-level definition (elaborating it the first time). */
  private useDef(decl: Extract<SDecl, { d: 'def' }>, span: Span): Def {
    let entry = this.objectDefs.get(decl.name);
    if (!entry) {
      if (BUILTINS[decl.name]) fail(`${decl.name} is a builtin: give the definition another name`, decl.span);
      entry = { deps: new Set(), span: decl.span };
      this.objectDefs.set(decl.name, entry);
      const outer = this.calledDefs;
      this.calledDefs = entry.deps;
      try {
        const params: Field[] = decl.params.map(p => ({ name: p.name, type: this.type(p.type) }));
        const scope = new Map(params.map(p => [p.name, p.name]));
        const body = this.tr(decl.body!, { scope, params: new Set(), owner: decl.name });
        // Callees first: the map keeps insertion order, so re-insert after the dependencies.
        this.objectDefs.delete(decl.name);
        this.objectDefs.set(decl.name, entry);
        entry.def = { name: decl.name, params, ret: this.type(decl.type!), body };
      } catch (e) {
        this.objectDefs.delete(decl.name);
        throw e;
      } finally {
        this.calledDefs = outer;
      }
    } else if (!entry.def) {
      fail(`definitions cannot be recursive: ${decl.name}`, span);
    }
    if (this.calledDefs) {
      this.calledDefs.add(decl.name);
      for (const d of entry.deps) this.calledDefs.add(d);
    }
    return entry.def!;
  }

  // -------------------------------------------------------------------------
  // Object level

  private mark<E extends Expr>(e: E, span: Span): E {
    this.spans.set(e, span);
    return e;
  }

  private lit(type: Type, value: Json, span: Span): Expr {
    return this.mark({ e: 'lit', type, value }, span);
  }

  private hole(value: Json, span: Span): Expr {
    return this.lit(T.infer, value, span);
  }

  private call(fn: string, args: Expr[], span: Span): Expr {
    return this.mark({ e: 'call', fn, args }, span);
  }

  /** A lambda from a surface expression: `fun x => e`, a section, or the name of a function (eta-expanded). */
  private lambda(e: SExpr, ctx: OCtx): Expr {
    if (e.t === 'fun') return this.tr(e, ctx);
    const depth = ctx.depth ?? 0;
    const x = `x${depth}`;
    const inner: OCtx = { ...ctx, scope: new Map(ctx.scope).set(x, x), depth: depth + 1 };
    const call = this.tr({ t: 'app', fn: e, args: [{ value: { t: 'name', name: x, span: e.span } }], span: e.span }, inner);
    return this.mark({ e: 'fn', params: [{ name: x }], body: call }, e.span);
  }

  tr(e: SExpr, ctx: OCtx): Expr {
    const span = e.span;
    const tail = { effects: ctx.effects, decision: ctx.decision };
    const inner: OCtx = { ...ctx, effects: undefined, decision: undefined };
    switch (e.t) {
      case 'num': return this.hole(e.value, span);
      case 'str': return this.lit(T.string, e.value, span);
      case 'bool': return this.lit(T.bool, e.value, span);
      case 'ctor': return this.hole(e.name, span);
      case 'unit': return this.lit(T.unit, null, span);
      case 'nothing':
        if (!ctx.effects) fail('`nothing` is an effect, returned by hooks', span);
        return this.mark({ e: 'effect' }, span);
      case 'param': return this.mark({ e: 'param', name: e.name }, span);
      case 'name': return this.name(e.name, span, ctx);
      case 'proj': return this.projection(this.tr(e.on, inner), e.field, [], span, inner);
      case 'app': return this.app(e, inner);
      case 'binop': {
        if (e.op === '∧' || e.op === '∨') {
          const parts = flatten(e, e.op).map(x => this.tr(x, inner));
          return this.call(e.op === '∧' ? 'and' : 'or', parts, span);
        }
        const [l, r] = [this.tr(e.l, inner), this.tr(e.r, inner)];
        if (e.op === '++') return this.call(isStringy(e.l) || isStringy(e.r) ? 'concat' : 'append', [l, r], span);
        return this.call(BINOPS[e.op] ?? fail(`unknown operator ${e.op}`, span), [l, r], span);
      }
      case 'unop': {
        if (e.op === '-' && e.e.t === 'num') return this.lit(T.int, -e.e.value, span);
        if (e.op === '-') return fail('negation applies to number literals', span);
        return this.call('not', [this.tr(e.e, inner)], span);
      }
      case 'if':
        return this.mark({ e: 'if', cond: this.tr(e.cond, inner), then: this.tr(e.then, ctx), else: this.tr(e.else, ctx) }, span);
      case 'let': {
        const value = this.tr(e.value, { ...inner, letName: e.name });
        const body = this.tr(e.body, { ...ctx, scope: new Map(ctx.scope).set(e.name, e.name) });
        return this.mark({ e: 'let', name: e.name, value, body }, span);
      }
      case 'match': {
        const cases: Record<string, Expr> = {};
        let otherwise: Expr | undefined;
        for (const c of e.cases) {
          const body = this.tr(c.body, ctx);
          if (c.pat.t === 'wild') otherwise = body;
          else if (c.pat.t === 'ctor') cases[c.pat.name.split('.').pop()!] = body;
          else fail('only constructors and _ can be matched for now', c.pat.span);
        }
        return this.mark({ e: 'match', on: this.tr(e.on, inner), cases, ...(otherwise ? { else: otherwise } : {}) }, span);
      }
      case 'fun': {
        const scope = new Map(ctx.scope);
        const depth = ctx.depth ?? 0;
        const params = e.params.map(p => {
          const n = p.name === '·' ? `x${depth}` : p.name;
          scope.set(p.name, n);
          return p.type ? { name: n, type: this.type(p.type) } : { name: n };
        });
        return this.mark({ e: 'fn', params, body: this.tr(e.body, { ...inner, scope, depth: depth + 1 }) }, span);
      }
      case 'list':
        return e.items.length ? this.call('list', e.items.map(i => this.tr(i, inner)), span) : this.hole([], span);
      case 'record':
        return this.record(e, ctx, tail);
      case 'choose': {
        const from = this.tr(e.from, inner);
        const site = `${ctx.owner}.${ctx.letName ?? 'choice'}`;
        const such = e.such && this.lambda(e.such, inner);
        let label: Expr | undefined;
        if (e.labels?.t === 'list') {
          if (e.from.t !== 'list') fail('a list of labels needs a list of options: give a function instead', e.labels.span);
          const x = `x${inner.depth ?? 0}`;
          const lctx: OCtx = { ...inner, scope: new Map(inner.scope).set(x, x), depth: (inner.depth ?? 0) + 1 };
          const options = (e.from as { items: SExpr[] }).items;
          const labels = e.labels.items;
          let body: Expr = this.lit(T.string, '', e.labels.span);
          for (let k = options.length - 1; k >= 0; k--) {
            const cond = this.call('eq', [this.mark({ e: 'var', name: x }, span), this.tr(options[k], lctx)], span);
            body = this.mark({ e: 'if', cond, then: this.tr(labels[k], lctx), else: body }, span);
          }
          label = this.mark({ e: 'fn', params: [{ name: x }], body }, e.labels.span);
        } else if (e.labels) {
          label = this.lambda(e.labels, inner);
        }
        return this.mark({ e: 'choose', site, from, ...(such ? { such } : {}), ...(label ? { label } : {}) }, span);
      }
      case 'ascribe': {
        const x = this.tr(e.e, inner);
        if (x.e === 'lit' && x.type.k === 'infer') return this.lit(this.type(e.type), x.value, span);
        return x;
      }
      case 'hole': return fail('· is only allowed inside parentheses', span);
      case 'typeValue': return fail('a type is not a value', span);
      case 'flag': case 'action': return fail(`${e.t} declarations belong to components`, span);
    }
  }

  private record(e: Extract<SExpr, { t: 'record' }>, ctx: OCtx, tail: { effects?: boolean; decision?: OCtx['decision'] }): Expr {
    const span = e.span;
    const inner: OCtx = { ...ctx, effects: undefined, decision: undefined };
    const fieldsOf = (items: SRecordItem[], c: OCtx) => {
      const out: Record<string, Expr> = {};
      for (const it of items) {
        if (it.t !== 'field') fail('`raise` only appears in an effect', it.span);
        const f = it as { name: string; value?: SExpr; span: Span };
        out[f.name] = this.tr(f.value ?? { t: 'name', name: f.name, span: f.span }, { ...c, letName: f.name });
      }
      return out;
    };
    if (tail.effects && !e.base) {
      // An effect: `{ world := { C.world with f := v }, raise flag := agents or predicate }`.
      const world: Record<string, Expr> = {};
      const raise: Record<string, Expr> = {};
      let agentsUpdate: Expr | undefined;
      let activate: Expr | undefined;
      for (const it of e.items) {
        if (it.t === 'raise') {
          const v = it.value;
          raise[it.flag] = this.tr(v, inner);
        } else if (it.name === 'agents') {
          // New values of the component's own agent fields: `agents := fun a => { field := value }`.
          if (!it.value) fail('agents := fun a => { field := value, ... }', it.span);
          agentsUpdate = this.lambda(it.value!, inner);
        } else if (it.name === 'activate') {
          // The agents that take their next event (a scheduler's `schedule`): agents or a predicate.
          if (!it.value) fail('activate := agents, or activate := fun a => condition', it.span);
          activate = this.tr(it.value!, inner);
        } else if (it.name === 'world') {
          const w = it.value;
          if (!w || w.t !== 'record' || !w.base) fail('world := { C.world with f := v, ... }', it.span);
          Object.assign(world, fieldsOf((w as { items: SRecordItem[] }).items, inner));
        } else {
          fail(`an effect has \`world :=\`, \`raise flag :=\`, \`agents :=\` and, in a scheduler, \`activate :=\`, not ${it.name}`, it.span);
        }
      }
      return this.mark({
        e: 'effect', ...(Object.keys(world).length ? { world } : {}), ...(Object.keys(raise).length ? { raise } : {}),
        ...(agentsUpdate ? { agents: agentsUpdate } : {}),
        ...(activate ? { activate } : {}),
      }, span);
    }
    if (e.base) return this.mark({ e: 'with', on: this.tr(e.base, inner), fields: fieldsOf(e.items, inner) }, span);
    const fields = fieldsOf(e.items, inner);
    if (tail.decision) {
      // A decision keeps the public state and the memory unless it sets them.
      fields.pub ??= this.mark({ e: 'var', name: tail.decision.pub }, span);
      fields.mem ??= this.mark({ e: 'var', name: tail.decision.mem }, span);
      if (!fields.move) fail('a decision needs a move', span);
    }
    return this.mark({ e: 'record', fields }, span);
  }

  /** A possibly dotted name: a local with projections, a parameter, a constructor, or a definition. */
  private name(full: string, span: Span, ctx: OCtx): Expr {
    const parts = full.split('.');
    for (let n = parts.length; n >= 1; n--) {
      const head = parts.slice(0, n).join('.');
      const local = ctx.scope.get(head);
      const constant = ctx.constants?.get(head);
      const param = n === 1 && local === undefined && ctx.params.has(head);
      if (local !== undefined || constant || param) {
        let e: Expr = constant ? this.mark({ ...constant }, span)
          : param ? this.mark({ e: 'param', name: head }, span)
          : this.mark({ e: 'var', name: local! }, span);
        for (const f of parts.slice(n)) e = this.projection(e, f, [], span, ctx);
        return e;
      }
    }
    // `visible.length`, `otherStates.isEmpty`, `Line.window.length`: a builtin name, a sensor or a
    // definition without parameters, followed by projections.
    for (let n = parts.length - 1; n >= 1; n--) {
      const head = parts.slice(0, n).join('.');
      const g = this.globals.get(head);
      if (BUILTIN_NAMES.has(head) || this.sensorNames.has(head) || (isObjectDef(g) && !g.params.length)) {
        let e = this.name(head, span, ctx);
        for (const f of parts.slice(n)) e = this.projection(e, f, [], span, ctx);
        return e;
      }
    }
    if (full === 'none') return this.hole(null, span);
    if (BUILTIN_NAMES.has(full)) return this.call(full, [], span);
    // A sensor read by an algorithm, once per Look (a per-location sensor is applied to a location).
    if (this.sensorNames.has(full)) return this.mark({ e: 'sense', sensor: full }, span);
    if (parts.length >= 2) {
      const enumName = parts.slice(0, -1).join('.');
      const t = enumName === 'Verdict' ? T.verdict : this.enums.get(enumName);
      if (t) {
        const ctor = parts[parts.length - 1];
        const ctors = t.k === 'enum' ? t.ctors : ['success', 'failure', 'inProgress'];
        if (!ctors.includes(ctor)) fail(`${ctor} is not a constructor of ${enumName}`, span);
        return this.lit(t, ctor, span);
      }
    }
    if (BUILTIN_FUNCTIONS.has(full)) return fail(`${full} needs arguments`, span);
    const g = this.globals.get(full);
    if (isObjectDef(g)) {
      if (g.params.length) fail(`${full} needs ${g.params.length} argument(s)`, span);
      this.useDef(g, span);
      return this.call(full, [], span);
    }
    return fail(`unknown name ${full}`, span);
  }

  /** `e.f`, with methods of collections, options, configurations and moves. */
  private projection(on: Expr, field: string, args: SArg[], span: Span, ctx: OCtx): Expr {
    const rest = args.map((a, i) => COLLECTION_METHODS_WITH_FN.has(field) && i === 0 ? this.lambda(a.value, ctx) : this.tr(a.value, ctx));
    const noArgs = () => { if (args.length) fail(`${field} takes no arguments`, span); };
    switch (field) {
      case 'length': case 'card': noArgs(); return this.call('length', [on], span);
      case 'isEmpty': case 'sum': case 'isSome': case 'isNone': case 'toMultiset': case 'toList': case 'dedup':
        noArgs(); return this.call(field, [on], span);
      case 'toNat': noArgs(); return this.call('toNat', [on], span);
      case 'agents': case 'eligible':
        // On the configuration (always `C` in IR): builtins.
        if (on.e === 'var' && on.name === 'C') { noArgs(); return this.call(field, [on], span); }
        break;
      case 'positions':
        if (on.e === 'var' && on.name === 'C') { noArgs(); return this.call('positions', [], span); }
        break;
      case 'size': case 'nodes':
        if (on.e === 'var' && on.name === 'C') fail(`C.${field} is gone: use C.positions (finite spaces)`, span);
        break;
      case 'resolve': case 'follow': case 'occupants': case 'position': case 'edgePresent': {
        // `C.resolve a i`, `C.follow a i k`; in sensors, `L.occupants l`, `L.position l`, `L.edgePresent a b`.
        const arity = ({ resolve: 2, follow: 3, occupants: 1, position: 1, edgePresent: 2 } as Record<string, number>)[field];
        if (!args.length) break;
        if (rest.length !== arity) fail(`${field} takes ${arity} argument(s)`, span);
        return this.call(field, [on, ...rest], span);
      }
      case 'filter': case 'map': case 'any': case 'all': case 'count': case 'getD': case 'diff': case 'at':
        if (rest.length !== 1) fail(`${field} takes one argument`, span);
        return this.call(field, [on, ...rest], span);
      case 'contains':
        if (rest.length !== 1) fail('contains takes one argument', span);
        return this.call('mem', [rest[0], on], span);
    }
    if (args.length) fail(`${field} is a field, not a function`, span);
    const output = ctx.outputs?.get(field);
    if (output) {
      // An output of the algorithm, read on an agent: its definition, with the agent's state.
      const constants = new Map<string, Expr>([['pub', { e: 'get', on, field: 'pub' }], ['mem', { e: 'get', on, field: 'mem' }]]);
      return this.tr(output, { scope: new Map(), params: new Set(), owner: ctx.owner, constants });
    }
    return this.mark({ e: 'get', on, field }, span);
  }

  private app(e: Extract<SExpr, { t: 'app' }>, ctx: OCtx): Expr {
    const span = e.span;
    if (e.args.some(a => a.name)) fail('named arguments are only for definitions of models and components', span);
    // `x.method args`: the last part of a dotted name, or a projection.
    if (e.fn.t === 'proj') return this.projection(this.tr(e.fn.on, ctx), e.fn.field, e.args, span, ctx);
    if (e.fn.t === 'name') {
      const name = e.fn.name;
      const parts = name.split('.');
      if (parts.length > 1 && !this.globals.has(name)) {
        const recv = this.name(parts.slice(0, -1).join('.'), e.fn.span, ctx);
        return this.projection(recv, parts[parts.length - 1], e.args, span, ctx);
      }
      if (this.sensorNames.has(name) && ctx.scope.get(name) === undefined) {
        if (e.args.length !== 1) fail(`${name} is read at one location: ${name} l`, span);
        return this.mark({ e: 'sense', sensor: name, loc: this.tr(e.args[0].value, ctx) }, span);
      }
      if (BUILTIN_FUNCTIONS.has(name)) {
        const fnArgs = FUNCTION_ARGS[name] ?? [];
        const args = e.args.map((a, i) => fnArgs.includes(i) ? this.lambda(a.value, ctx) : this.tr(a.value, ctx));
        // `subsetsUpTo k xs`, as in the syntax document; the IR takes the collection first.
        if (name === 'subsetsUpTo' && args.length === 2) args.reverse();
        return this.call(name, args, span);
      }
      const local = ctx.scope.get(name);
      if (local !== undefined) fail(`${name} is not a function`, span);
      const g = this.globals.get(name);
      if (isObjectDef(g)) {
        if (e.args.length !== g.params.length) fail(`${name} takes ${g.params.length} argument(s)`, span);
        this.useDef(g, span);
        return this.call(name, e.args.map(a => this.tr(a.value, ctx)), span);
      }
    }
    return fail('unknown function', e.fn.span);
  }
}

/** Binders bound by the semantics: the configuration of a task, the Look and location of a sensor. */
function runtimeBinder(t: SType): string | undefined {
  if (t.t !== 'name') return undefined;
  return ({ Config: 'C', Look: 'L', Loc: 'l' } as Record<string, string>)[t.name];
}

function flatten(e: SExpr, op: string): SExpr[] {
  return e.t === 'binop' && e.op === op ? [...flatten(e.l, op), ...flatten(e.r, op)] : [e];
}

function isStringy(e: SExpr): boolean {
  return e.t === 'str' || (e.t === 'app' && e.fn.t === 'name' && e.fn.name === 'show') || (e.t === 'binop' && e.op === '++' && (isStringy(e.l) || isStringy(e.r)));
}

function stripType(v: MV): unknown {
  return v.m === 'enum' ? { m: 'enum', ctor: v.ctor, type: v.type.name } : v;
}

function dropUndefined<O extends object>(o: O): O {
  return Object.fromEntries(Object.entries(o).filter(([, x]) => x !== undefined)) as O;
}

/** Compiles the experiments of an entry module. */
export function compile(program: Program): { experiments: Record<string, ElabResult>; diagnostics: Diagnostic[] } {
  const elab = new Elaborator(program);
  const experiments: Record<string, ElabResult> = {};
  for (const name of elab.experiments()) experiments[name] = elab.experiment(name);
  return { experiments, diagnostics: elab.diagnostics };
}
