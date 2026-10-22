/**
 * Lowering of structured algorithms to state machines (plan, Section 3.8).
 *
 * `move l` (to a location of the Look), `stay` (to `here`) and `halt` end the activation. Every one of them is a
 * resume point: the program counter records where the agent resumes, and
 * the step function, for each value of the program counter, runs the code
 * from there to the next `move`, `stay` or `halt`. Procedures are inlined
 * (they are not recursive); arguments that are constants are substituted,
 * others become locals. Reaching the end of `main` restarts it at the next
 * activation, so an algorithm that ends with its only move needs no memory.
 *
 * `with { pebble := .drop }` after `move`, `stay` or `halt` sets actions of
 * the model for that activation only (a halted agent does not repeat them).
 *
 * `wait n` evaluates `n` once and stays that many activations: a counter
 * (one local shared by every `wait`, zero outside them) and a `stay`, all at
 * the line of the `wait`.
 *
 * For display, each program-counter value also records the lines of the
 * procedure calls it is inside (`calls`), outermost first.
 *
 * What is kept across activations is declared memory: the program counter
 * (when there is more than one resume point) and the typed locals. In an
 * oblivious model, an algorithm that needs either is rejected.
 */
import type { Expr, Field, Json, Type } from '../ir';
import type { SBinder, SExpr, SRecordItem, SStmt, SType } from '../parse/ast';
import type { Span } from '../parse/lexer';
import { T } from '../types';

export type Procedure = { params: SBinder[]; body: SStmt[] };

/** What the lowering needs from the elaborator. */
export type LowerHost = {
  /** Translates an expression; `scope` maps surface names to IR variables, `constants` to IR expressions. */
  tr(e: SExpr, scope: Map<string, string>, constants: Map<string, Expr>): Expr;
  type(t: SType): Type;
  fail(msg: string, span?: Span): never;
};

export type Lowered = {
  mem: Type;
  initMem: Expr;
  step: Expr;
  line?: Expr;
  /** The source line of each value of the program counter. */
  lines: Record<string, number>;
  /** The lines of the procedure calls around each value of the program counter (outermost first), when there are any. */
  calls: Record<string, number[]>;
};

/** Bindings of an inlined procedure: constants, locals (by IR name), and the lines of the calls that led to it. */
type Env = { consts: Map<string, Expr>; locals: Map<string, string>; calls: number[] };

type IStmt = { span: Span; env: Env } & (
  | { k: 'move'; dir: SExpr; actions?: SRecordItem[] }
  | { k: 'stay'; actions?: SRecordItem[] }
  | { k: 'halt'; actions?: SRecordItem[] }
  | { k: 'repeat'; body: IStmt[] }
  | { k: 'while'; cond: SExpr; body: IStmt[] }
  | { k: 'if'; cond: SExpr; then: IStmt[]; else: IStmt[] }
  | { k: 'set'; local: string | 'pub'; value: SExpr }
);

type Frame = { rest: IStmt[]; loop?: IStmt };

/** Expressions that can be substituted for a parameter without memory. */
function isConstant(e: SExpr): boolean {
  switch (e.t) {
    case 'num': case 'str': case 'bool': case 'ctor': case 'unit': return true;
    case 'name': return /^[A-Z]\w*\.\w+$/.test(e.name);        // HolePolicy.none, Port.cw
    case 'list': return e.items.every(isConstant);
    case 'unop': return e.op === '-' && e.e.t === 'num';
    default: return false;
  }
}

/** `stay`: a move to the agent's own location (a fresh node: spans are found by identity). */
const HERE = (): Expr => ({ e: 'call', fn: 'here', args: [] });

export function lower(
  name: string, procs: Map<string, Procedure>, main: SStmt[], oblivious: boolean, host: LowerHost,
): Lowered {
  const locals = new Map<string, { type?: Type; span: Span }>();
  let fresh = 0;

  // 1. Inlining
  let waitLocal: string | undefined;
  const inline = (stmts: SStmt[], env: Env, stack: string[]): IStmt[] => stmts.flatMap((s): IStmt[] => {
    const at = { span: s.span, env };
    switch (s.s) {
      case 'move': return [{ ...at, k: 'move', dir: s.dir, actions: s.actions }];
      case 'stay': return [{ ...at, k: 'stay', actions: s.actions }];
      case 'halt': return [{ ...at, k: 'halt', actions: s.actions }];
      case 'wait': {
        if (!waitLocal) {
          waitLocal = `wait_${fresh++}`;
          locals.set(waitLocal, { type: T.nat, span: s.span });
        }
        // `#wait` is not a surface name: the counter cannot clash with the algorithm's names.
        const w = { ...env, locals: new Map(env.locals).set('#wait', waitLocal) };
        const span = s.span;
        const left: SExpr = { t: 'name', name: '#wait', span };
        return [
          { span, env, k: 'set', local: waitLocal, value: s.count },
          { span, env: w, k: 'while', cond: { t: 'binop', op: '>', l: left, r: { t: 'num', value: 0, span }, span }, body: [
            { span, env: w, k: 'set', local: waitLocal, value: { t: 'binop', op: '-', l: left, r: { t: 'num', value: 1, span }, span } },
            { span, env: w, k: 'stay' },
          ] },
        ];
      }
      case 'repeat': return [{ ...at, k: 'repeat', body: inline(s.body, env, stack) }];
      case 'while': return [{ ...at, k: 'while', cond: s.cond, body: inline(s.body, env, stack) }];
      case 'if': return [{ ...at, k: 'if', cond: s.cond, then: inline(s.then, env, stack), else: inline(s.else ?? [], env, stack) }];
      case 'let': {
        // Locals are scoped to their procedure (one declaration per name).
        if (env.locals.has(s.name)) host.fail(`${s.name} is already declared in this procedure`, s.span);
        const local = `${s.name}_${fresh++}`;
        locals.set(local, { type: s.type && host.type(s.type), span: s.span });
        env.locals.set(s.name, local);
        return [{ ...at, k: 'set', local, value: s.value }];
      }
      case 'assign': {
        if (s.name === 'pub') return [{ ...at, k: 'set', local: 'pub', value: s.value }];
        const local = env.locals.get(s.name) ?? host.fail(`${s.name} is not a local variable (declare it with let)`, s.span);
        return [{ ...at, k: 'set', local, value: s.value }];
      }
      case 'call': {
        const p = procs.get(s.name) ?? host.fail(`unknown procedure ${s.name}`, s.span);
        if (stack.includes(s.name)) host.fail(`procedures cannot be recursive: ${[...stack, s.name].join(' → ')}`, s.span);
        if (s.args.length !== p.params.length) host.fail(`${s.name} takes ${p.params.length} argument(s)`, s.span);
        const callee: Env = { consts: new Map(env.consts), locals: new Map(), calls: [...env.calls, s.span.start.line] };
        const setup: IStmt[] = [];
        p.params.forEach((param, i) => {
          const arg = s.args[i];
          if (isConstant(arg)) {
            callee.consts.set(param.name, host.tr(arg, new Map(), new Map()));
          } else {
            const local = `${param.name}_${fresh++}`;
            locals.set(local, { type: host.type(param.type), span: param.span });
            callee.locals.set(param.name, local);
            setup.push({ span: arg.span, env, k: 'set', local, value: arg });
          }
        });
        return [...setup, ...inline(p.body, callee, [...stack, s.name])];
      }
    }
  });
  const program = inline(main, { consts: new Map(), locals: new Map(), calls: [] }, []);

  // 2. Resume points
  type Resume = { pc: string; cont: Frame[]; line: number; calls: number[] };
  const resumes = new Map<IStmt, Resume>();
  const halts = new Map<IStmt, string>();
  const order: Resume[] = [];
  // Program-counter values are numbered by kind in program order, not by line, so that an
  // edit that only moves lines (a comment) keeps the experiment, its states and Lean names.
  const counts = new Map<string, number>();
  const pcName = (prefix: string, _line: number) => {
    const k = (counts.get(prefix) ?? 0) + 1;
    counts.set(prefix, k);
    return `${prefix}${k}`;
  };
  const typedLocals = () => [...locals].filter(([, l]) => l.type).map(([n, l]) => ({ name: n, type: l.type! }));
  const ended = (cont: Frame[]) => cont.every(f => f.rest.length === 0 && !f.loop);

  type State = { pub: string; values: Map<string, string> };
  let tmp = 0;
  /** The type of the program counter; its constructors are known at the end. */
  const PC = { k: 'enum' as const, name: `${name}PC`, ctors: [] as string[] };

  /** The decision ending this activation, resuming at `pc` (with continuation `cont`), with the activation's actions. */
  const decision = (move: Expr, pc: string, st: State, span: Span, actions: Record<string, Expr> = {}, cont: Frame[] = [], line: number | null = span?.start.line ?? null): Expr => {
    const mem: Record<string, Expr> = {};
    const restart = pc === 'start';
    for (const l of typedLocals()) {
      // At a restart nothing is kept: locals go back to their initial values, so equal states stay equal.
      mem[l.name] = restart
        ? { e: 'lit', type: l.type, value: defaultValue(l.type, host, span) }
        : { e: 'var', name: st.values.get(l.name) ?? host.fail('internal: lost local', span) };
    }
    if (!restart) {
      for (const [l, info] of locals) {
        // An untyped local only matters if what follows reads it before writing it.
        if (!info.type && st.values.has(l) && live(cont, l) === 'read') {
          host.fail(`${l.replace(/_\d+$/, '')} is kept across a move: give its type (let x : T := ...)`, info.span);
        }
      }
    }
    return {
      e: 'record',
      fields: { move, pub: { e: 'var', name: st.pub }, mem: { e: 'record', fields: { pc: { e: 'lit', type: PC, value: pc }, ...mem } }, ...actions },
      // The statement that decides (display only, see `Expr.at`).
      ...(line !== null ? { at: line } : {}),
    };
  };
  const actionsOf = (s: { actions?: SRecordItem[]; env: Env }, st: State): Record<string, Expr> => {
    const out: Record<string, Expr> = {};
    for (const item of s.actions ?? []) {
      if (item.t !== 'field' || !item.value) continue;
      if (['move', 'pub', 'mem'].includes(item.name)) host.fail(`${item.name} is not an action`, item.span);
      out[item.name] = tr(item.value, s.env, st);
    }
    return out;
  };

  const scopeOf = (env: Env, st: State) => {
    const scope = new Map<string, string>([['pub', st.pub]]);
    for (const [surface, local] of env.locals) {
      const v = st.values.get(local);
      if (v) scope.set(surface, v);
    }
    return scope;
  };
  const tr = (e: SExpr, env: Env, st: State) => host.tr(e, scopeOf(env, st), env.consts);

  const run = (cont: Frame[], st: State, seen: Set<IStmt>): Expr => {
    if (!cont.length) {
      // End of `main`: nothing more this activation; start again at the next one.
      return decision(HERE(), 'start', st, program[0]?.span ?? main[0]?.span, {}, [], null);
    }
    const [frame, ...outer] = cont;
    if (!frame.rest.length) return run(frame.loop ? [{ rest: [frame.loop] }, ...outer] : outer, st, seen);
    const [s, ...rest] = frame.rest;
    const next: Frame[] = [{ rest, loop: frame.loop }, ...outer];
    switch (s.k) {
      case 'move': case 'stay': {
        const move = s.k === 'move' ? tr(s.dir, s.env, st) : HERE();
        let pc = 'start';
        if (!ended(next)) {
          let r = resumes.get(s);
          if (!r) {
            r = { pc: pcName(s.k === 'move' ? 'move' : 'stay', s.span.start.line), cont: next, line: s.span.start.line, calls: s.env.calls };
            resumes.set(s, r);
            order.push(r);
          }
          pc = r.pc;
          if (oblivious) host.fail(`${name}: in an oblivious model, the algorithm cannot continue after this ${s.k} (it would need memory)`, s.span);
        }
        return decision(move, pc, st, s.span, actionsOf(s, st), next);
      }
      case 'halt': {
        if (oblivious) host.fail(`${name}: in an oblivious model, an algorithm cannot halt (it would need memory)`, s.span);
        let pc = halts.get(s);
        if (!pc) { pc = pcName('halt', s.span.start.line); halts.set(s, pc); }
        return decision(HERE(), pc, st, s.span, actionsOf(s, st));
      }
      case 'set': {
        const value = tr(s.value, s.env, st);
        const v = `${s.local === 'pub' ? 'pub' : s.local.replace(/_\d+$/, '')}_v${tmp++}`;
        const st2: State = s.local === 'pub' ? { ...st, pub: v } : { ...st, values: new Map(st.values).set(s.local, v) };
        return { e: 'let', name: v, value, body: run(next, st2, seen) };
      }
      case 'if':
        return {
          e: 'if', cond: tr(s.cond, s.env, st),
          then: run([{ rest: s.then }, ...next], st, seen),
          else: run([{ rest: s.else }, ...next], st, seen),
        };
      case 'repeat': case 'while': {
        if (seen.has(s)) host.fail(`this loop can run again without move, stay or halt`, s.span);
        const seen2 = new Set(seen).add(s);
        const body = run([{ rest: s.body, loop: s }, ...next], st, seen2);
        return s.k === 'repeat' ? body : { e: 'if', cond: tr(s.cond, s.env, st), then: body, else: run(next, st, seen) };
      }
    }
  };

  // Liveness of locals across a move: is the local read before it is written?
  type Use = 'read' | 'written' | 'none';
  const readsIn = (e: unknown, env: Env, local: string): boolean => {
    if (!e || typeof e !== 'object') return false;
    if (Array.isArray(e)) return e.some(x => readsIn(x, env, local));
    const o = e as { t?: string; name?: string };
    if (o.t === 'name' && o.name && env.locals.get(o.name) === local) return true;
    return Object.entries(o).some(([k, v]) => k !== 'span' && readsIn(v, env, local));
  };
  const seq = (stmts: IStmt[], local: string, loops: Set<IStmt>): Use => {
    for (const s of stmts) {
      const u = stmt(s, local, loops);
      if (u !== 'none') return u;
    }
    return 'none';
  };
  const stmt = (s: IStmt, local: string, loops: Set<IStmt>): Use => {
    switch (s.k) {
      case 'move': return readsIn(s.dir, s.env, local) || readsIn(s.actions, s.env, local) ? 'read' : 'none';
      case 'stay': case 'halt': return readsIn(s.actions, s.env, local) ? 'read' : 'none';
      case 'set':
        if (readsIn(s.value, s.env, local)) return 'read';
        return s.local === local ? 'written' : 'none';
      case 'if': {
        if (readsIn(s.cond, s.env, local)) return 'read';
        const a = seq(s.then, local, loops), b = seq(s.else, local, loops);
        return a === 'read' || b === 'read' ? 'read' : a === 'written' && b === 'written' ? 'written' : 'none';
      }
      case 'repeat': case 'while': {
        if (loops.has(s)) return 'none';
        const inner = new Set(loops).add(s);
        if (s.k === 'while' && readsIn(s.cond, s.env, local)) return 'read';
        const u = seq(s.body, local, inner);
        return u === 'read' ? 'read' : s.k === 'repeat' ? u : 'none';
      }
    }
  };
  const live = (cont: Frame[], local: string): Use => {
    const loops = new Set<IStmt>();
    for (const f of cont) {
      const u = seq(f.rest, local, loops);
      if (u !== 'none') return u;
      if (f.loop) {
        const again = stmt(f.loop, local, loops);
        if (again !== 'none') return again;
        loops.add(f.loop);
      }
    }
    return 'none';
  };

  // 3. The step function: one case per resume point, generated until no new one appears.
  const atResume = (): State => ({ pub: 'pub', values: new Map(typedLocals().map(l => [l.name, `${l.name}_m`])) });
  /** Reads the saved locals from memory. */
  const withLocals = (body: Expr): Expr => typedLocals().reduceRight<Expr>((acc, l) =>
    ({ e: 'let', name: `${l.name}_m`, value: { e: 'get', on: { e: 'var', name: 'mem' }, field: l.name }, body: acc }), body);
  const cases: Record<string, Expr> = { start: withLocals(run([{ rest: program }], atResume(), new Set())) };
  for (let i = 0; i < order.length; i++) cases[order[i].pc] = withLocals(run(order[i].cont, atResume(), new Set()));
  for (const [s, pc] of halts) cases[pc] = withLocals(decision(HERE(), pc, atResume(), s.span));

  const pcs = Object.keys(cases);
  const lines: Record<string, number> = { start: (program[0] ?? main[0])?.span.start.line ?? 1 };
  for (const r of order) lines[r.pc] = r.line;
  for (const [s, pc] of halts) lines[pc] = s.span.start.line;
  const calls: Record<string, number[]> = {};
  const addCalls = (pc: string, c: number[] | undefined) => { if (c?.length) calls[pc] = c; };
  addCalls('start', program[0]?.env.calls);
  for (const r of order) addCalls(r.pc, r.calls);
  for (const [s, pc] of halts) addCalls(pc, s.env.calls);
  const locs = typedLocals();
  if (pcs.length === 1 && !locs.length) {
    // No memory: the program restarts at every activation.
    const step = stripMem(cases.start);
    return { mem: T.unit, initMem: { e: 'lit', type: T.unit, value: null }, step, lines, calls };
  }
  if (oblivious && locs.length) host.fail(`${name}: in an oblivious model, locals cannot be kept across activations`, locals.get(locs[0].name)!.span);
  PC.ctors.push(...pcs);
  const fields: Field[] = [{ name: 'pc', type: PC }, ...locs];
  return {
    mem: T.record(fields),
    initMem: { e: 'record', fields: { pc: { e: 'lit', type: PC, value: 'start' }, ...Object.fromEntries(locs.map(l => [l.name, { e: 'lit', type: l.type, value: defaultValue(l.type, host, locals.get(l.name)!.span) }])) } },
    step: { e: 'match', on: { e: 'get', on: { e: 'var', name: 'mem' }, field: 'pc' }, cases },
    line: { e: 'match', on: { e: 'get', on: { e: 'var', name: 'mem' }, field: 'pc' }, cases: Object.fromEntries(pcs.map(pc => [pc, { e: 'lit', type: T.nat, value: lines[pc] }])) },
    lines,
    calls,
  };
}

/**
 * Decisions that omit an action keep its default, but the IR (and Lean) need every decision of
 * a step to have the same fields: once the model is known, each action that some decision sets
 * is added, with its default, to the decisions that omit it. Steps that set no action are
 * unchanged.
 */
export function fillActionDefaults(step: Expr, actions: { name: string; type: Type; default: Json }[]): Expr {
  const isDecision = (x: Expr): x is Extract<Expr, { e: 'record' }> => x.e === 'record' && !!x.fields.move && !!x.fields.pub && !!x.fields.mem;
  const used = new Set<string>();
  mapExprs(step, x => {
    if (isDecision(x)) for (const a of actions) if (x.fields[a.name]) used.add(a.name);
    return x;
  });
  if (!used.size) return step;
  return mapExprs(step, x => {
    if (!isDecision(x)) return x;
    const fields = { ...x.fields };
    for (const a of actions) if (used.has(a.name) && !fields[a.name]) fields[a.name] = { e: 'lit', type: a.type, value: a.default };
    return { ...x, fields };
  });
}

/** Without memory, decisions do not mention it. */
function stripMem(e: Expr): Expr {
  return mapExprs(e, x => x.e === 'record' && x.fields.mem && x.fields.move
    ? { ...x, fields: { ...x.fields, mem: { e: 'var', name: 'mem' } } } : x);
}

/**
 * Applies `f` bottom-up. Unchanged subtrees are kept, not copied: the elaborator finds the
 * source span of an expression by its identity, and diagnostics need the spans of the
 * translated statements.
 */
function mapExprs(e: Expr, f: (x: Expr) => Expr): Expr {
  const walk = (x: unknown): unknown => {
    if (!x || typeof x !== 'object') return x;
    if (Array.isArray(x)) {
      const items = x.map(walk);
      return items.some((v, i) => v !== x[i]) ? items : x;
    }
    const entries = Object.entries(x as object);
    const walked = entries.map(([k, v]) => [k, walk(v)] as const);
    const o = walked.some(([, v], i) => v !== entries[i][1]) ? Object.fromEntries(walked) : x;
    return typeof (o as { e?: unknown }).e === 'string' ? f(o as Expr) : o;
  };
  return walk(e) as Expr;
}

function defaultValue(t: Type, host: LowerHost, span: Span): Json {
  switch (t.k) {
    case 'nat': case 'int': return 0;
    case 'bool': return false;
    case 'string': return '';
    case 'unit': case 'option': return null;
    case 'list': case 'multiset': return [];
    case 'enum': return t.ctors[0];
    case 'record': return Object.fromEntries(t.fields.map(f => [f.name, defaultValue(f.type, host, span)]));
    case 'loc': return host.fail('a location is valid for one activation and cannot be kept across a move: keep a port index (Nat) instead', span);
    default: return host.fail(`a local of type ${t.k} cannot be kept in memory`, span);
  }
}
