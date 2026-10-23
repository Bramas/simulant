/**
 * An experiment with concrete parameters: its space, its initial configurations, the
 * successors of a configuration under the model's scheduler, and the task's verdict (docs/ir.md,
 * docs/scheduler-design.md).
 */
import { check } from '@bramas/simulant-lang/check';
import type { Component, Def, Experiment, Expr, Sensor, Space, Type } from '@bramas/simulant-lang/ir';
import type { Layout } from '@bramas/simulant-lang/layout';
import { resolvePub, T } from '@bramas/simulant-lang/types';
import {
  Compiler, Look, Runtime, type AgentV, type Choice, type Config, type DecisionV, type Effect, type RootFn, type SensorEnv,
  type TraceCall,
} from './compile';
import {
  framePermutations, isomorphicPresentation, portPresentation, rootedAutomorphisms, SpaceRuntime, viewAround,
  type AutomorphismSpec, type Presentation, type Vertex, type View,
} from './space';
import { encoder, equality, mapper, show, vertexKey, type V } from './values';
import { roundScheduler, type Instant, type SchedulerRuntime } from './scheduler';

export type { AgentV, Choice, Config, DecisionV, TraceCall };
export { Look };

/** What an activated agent saw in a step: its Look (under one morphism) and its sensor environment. */
export type StepInput = { label: string; look: Look; env: SensorEnv };

/** Why an agent took its decision in a step (`System.explain`). */
export type Explanation = {
  /** The source line of the statement that decided (`Expr.at`), when the algorithm has lines. */
  line?: number;
  /** The morphism of the Look, when the frames leave a choice. */
  frame: string;
  /** The values of the sensors that are not per location, as text. */
  view: Record<string, string>;
  /**
   * The Look's visible locations, in its order: the position behind each (which the algorithm
   * does not see), whether it is the agent's own, its neighbors as locations, and the values of
   * the per-location sensors there.
   */
  locations: { position: string; here: boolean; neighbors: number[]; sensors: Record<string, string> }[];
  /** Where the agent moves: `stay`, or the location and the position behind it (`ℓ3 (u1)`). */
  move: string;
  /** The definitions the step called, with their arguments, results and return lines. */
  calls: TraceCall[];
};

export type Successor = {
  config: Config;
  key: string;
  /** The choices of the first (smallest) witness leading to this configuration. */
  witness: Choice[];
  /** Agents (indices in the source configuration) that take an event in some witness of this step. */
  activated: Set<number>;
  /** When recording (`explain`): each agent's inputs (by index in the source configuration), and the source index of each agent of `config`. */
  inputs?: (StepInput | undefined)[];
  order?: number[];
};

export type Verdict = 'success' | 'failure' | 'inProgress';

export type SystemOptions = {
  /** Store anonymous agents sorted (default: when the scheduler allows it). Off, agents keep their index, as in Lean. */
  sortAgents?: boolean;
  /** The scheduler (default: the model's). */
  scheduler?: SchedulerRuntime;
  /** Remember the step's result for each input (default: on). */
  memoStep?: boolean;
};

export class IRError extends Error {
  constructor(readonly errors: string[]) {
    super(errors.join('\n'));
  }
}

function frameOf(fn: RootFn, args: V[]): V[] {
  const fr = new Array(fn.nslots);
  for (let i = 0; i < args.length; i++) fr[i] = args[i];
  return fr;
}

export function runDet(fn: RootFn, args: V[]): V {
  if (!fn.det) throw new Error('expected a deterministic expression');
  return fn.det(frameOf(fn, args));
}

export function runND(fn: RootFn, args: V[], k: (v: V) => void): void {
  const fr = frameOf(fn, args);
  if (fn.det) k(fn.det(fr));
  else fn.nd!(fr, k);
}

const defsOf = (...lists: (Def[] | undefined)[]) => new Map(lists.flatMap(l => l ?? []).map(d => [d.name, d]));

/** The space of a model under the current parameters (`rt.params`). */
export function buildSpace(space: Space, compiler: Compiler, defs: Map<string, Def>): SpaceRuntime {
  const value = (e: Expr, vars: [string, Type][] = [], args: V[] = []) => runDet(compiler.root(e, vars, defs), args);
  switch (space.kind) {
    case 'euclidean': throw new Error('Euclidean spaces are not supported yet');
    case 'dynamic': {
      const base = space.base.kind === 'graph' ? space.base : (() => { throw new Error('a dynamic space wraps a graph'); })();
      const g = buildSpace(base, compiler, defs);
      return new SpaceRuntime(g.name, g.vertices, v => g.neighbors(v), g.automorphismSpec, value(space.missing));
    }
    case 'graph': {
      const params = space.params ?? [];
      const vars: [string, Type][] = params.map(p => [p.name, p.type]);
      const args = params.map(p => value(space.args![p.name]));
      const vertices = space.vertices && value(space.vertices, vars, args) as V[];
      const nbrs = compiler.root(space.neighbors.body, [...vars, [space.neighbors.vertex, space.vertex]], defs);
      const auto: AutomorphismSpec = space.automorphisms.kind === 'dihedral'
        ? { kind: 'dihedral', n: value(space.automorphisms.n, vars, args) }
        : space.automorphisms;
      return new SpaceRuntime(space.name, vertices, v => runDet(nbrs, [...args, v]), auto);
    }
  }
}

/** The values of the model-level expressions over parameters: two settings with equal values share a state graph. */
function instantiation(exp: Experiment, compiler: Compiler): string {
  const defs = defsOf(exp.model.defs);
  const value = (e: Expr) => runDet(compiler.root(e, [], defs), []);
  const space = (s: Space): unknown => s.kind === 'graph' ? Object.fromEntries((s.params ?? []).map(p => [p.name, value(s.args![p.name])]))
    : s.kind === 'dynamic' ? [space(s.base), value(s.missing)] : s.dim;
  const r = exp.model.observation.kind === 'radius' ? value(exp.model.observation.r) : 'full';
  return JSON.stringify([space(exp.model.space), r]);
}

/** A sensor compiled for its Look: its Look-level bindings, then its body. */
type CompiledSensor = { name: string; t: Type; perLocation: boolean; bindings: RootFn[]; body: RootFn; args: V[] };

export class System {
  readonly rt: Runtime;
  readonly lay: Layout;
  readonly space: SpaceRuntime;
  /** The observation radius (`Infinity` for a full view). */
  readonly radius: number;
  /** Anonymous agents are stored as a sorted multiset, when the scheduler allows it (or when asked). */
  readonly anonymous: boolean;
  readonly scheduler: SchedulerRuntime;
  private readonly compiler: Compiler;
  private readonly sensors: CompiledSensor[];
  private readonly hooks: Record<HookPoint, Bound[]>;
  private readonly step: (mem: V, pub: V, look: Look, env: SensorEnv) => Record<string, V>;
  private readonly verdictFn: RootFn;
  private readonly lineFn?: RootFn;
  private readonly agentKey: (a: AgentV) => string;
  private readonly worldKey: (w: Record<string, V>) => string;
  private readonly decisionKey: (d: DecisionV) => string;
  private readonly actionDefaults: Record<string, V>;
  private readonly key0: string;
  private readonly views = new Map<string, { view: View; presentations: Map<string, Presentation[]> }>();
  /** The degree port permutations range over. */
  private degree = 0;
  /** While set, successors record their agents' inputs (for `explain`). */
  private recording = false;
  private traced?: (mem: V, pub: V) => Record<string, V>;

  constructor(readonly exp: Experiment, readonly params: Record<string, V>, opts: SystemOptions = {}) {
    const checked = check(exp);
    if (checked.errors.length) throw new IRError(checked.errors);
    const lay = this.lay = checked.layout;
    const rt = this.rt = new Runtime(lay);
    for (const p of exp.params) {
      if (!(p.name in params)) throw new Error(`missing parameter ${p.name}`);
    }
    rt.params = params;
    const compiler = this.compiler = new Compiler(rt, lay, new Map(exp.params.map(p => [p.name, p.type])));
    const { model, algorithm, task } = exp;

    this.space = rt.space = buildSpace(model.space, compiler, defsOf(model.defs));
    this.checkPositions(params);
    rt.frames = model.frames;
    this.radius = model.observation.kind === 'radius' ? runDet(compiler.root(model.observation.r, [], defsOf(model.defs)), []) : Infinity;
    this.key0 = instantiation(exp, compiler);
    this.scheduler = opts.scheduler ?? roundScheduler(model.round);
    this.anonymous = opts.sortAgents ?? this.scheduler.anonymous;

    this.sensors = lay.used.map(s => this.compileSensor(s, model.components.find(c => c.name === s.owner)));

    this.hooks = { beforeLook: [], onCompute: [], beforeMove: [], afterMove: [] };
    for (const c of model.components) {
      const [vars, args] = componentParams(c);
      for (const hook of HOOK_POINTS) {
        const body = c[hook];
        if (body) this.hooks[hook].push({ fn: compiler.root(body, [['C', T.config], ...vars], defsOf(model.defs, c.defs)), args });
      }
    }

    this.actionDefaults = Object.fromEntries(lay.actions.map(a => [a.name, a.default]));
    if (algorithm.native) throw new Error(`native algorithm ${algorithm.native}: not supported by IR version 2`);
    const stepFn = compiler.root(algorithm.step, [['mem', algorithm.mem], ['pub', algorithm.pub]], defsOf(model.defs, algorithm.defs));
    const step = (mem: V, pub: V, look: Look, env: SensorEnv) => {
      rt.look = look; rt.env = env;
      try {
        return runDet(stepFn, [mem, pub]) as Record<string, V>;
      } finally {
        rt.look = undefined; rt.env = undefined;
      }
    };
    if (opts.memoStep === false) this.step = step;
    else {
      // Steps are deterministic, and see only their Look's structure and sensor values.
      const [memKey, pubKey] = [encoder(algorithm.mem), encoder(lay.pub)];
      const memo = new Map<string, Record<string, V>>();
      this.step = (mem, pub, look, env) => {
        const key = `${memKey(mem)}|${pubKey(pub)}|${this.signature(look, env)}`;
        let out = memo.get(key);
        if (!out) {
          if (memo.size >= 1 << 17) memo.clear();
          out = step(mem, pub, look, env);
          memo.set(key, out);
        }
        return out;
      };
    }
    if (algorithm.line) this.lineFn = compiler.root(algorithm.line, [['mem', algorithm.mem]], defsOf(model.defs, algorithm.defs));
    this.verdictFn = compiler.root(task.verdict, [['C', T.config]], defsOf(model.defs, task.defs));

    const fieldsKey = encoder(T.record([
      ...lay.flags.map(f => ({ name: f.name, type: T.bool })),
      ...lay.agentFields,
    ]));
    const pubKey = encoder(lay.pub);
    const memKey = encoder(lay.mem);
    const decisionKey = this.decisionKey = encoder(decisionType(lay));
    this.agentKey = a => {
      const s = vertexKey(a.pos) + (a.frame ? `/${a.frame.join(',')}` : '') + '|';
      // Between cycles (always, with atomic cycles) the key is the same as without phases.
      const cycle = a.phase ? `|@${a.phase}:${decisionKey(a.pending!)}` : '';
      return s + fieldsKey(a.f) + '|' + pubKey(a.pub) + '|' + memKey(a.mem) + cycle;
    };
    this.worldKey = encoder(lay.worldType);
  }

  /** Parameters holding positions must hold vertices of the space. */
  private checkPositions(params: Record<string, V>) {
    for (const p of this.exp.params) {
      const m = mapper(p.type);
      if (!m || params[p.name] === undefined) continue;
      m(params[p.name], { vertex: v => {
        if (!this.space.has(v)) throw new Error(`parameter ${p.name}: ${vertexKey(v)} is not a vertex of ${this.space.name}`);
        return v;
      } });
    }
  }

  private compileSensor(s: Sensor & { owner: string }, owner: Component | undefined): CompiledSensor {
    const { compiler, exp } = this;
    const [vars, args] = componentParams(owner);
    const defs = defsOf(exp.model.defs, owner?.defs);
    const scope: [string, Type][] = [['L', T.look], ...(s.perLocation ? [['l', T.loc] as [string, Type]] : [])];
    const bindings: RootFn[] = [];
    const bound: [string, Type][] = [];
    for (const b of s.look ?? []) {
      // A Look-level binding sees the Look and the earlier bindings (no location).
      const fn = compiler.root(b.value, [['L', T.look], ...bound, ...vars, ['#C', T.config]], defs);
      bindings.push(fn);
      bound.push([b.name, fn.t]);
    }
    const body = compiler.root(s.body, [...scope, ...bound, ...vars, ['#C', T.config]], defs);
    return { name: s.name, t: resolvePub(s.type, this.lay.pub), perLocation: s.perLocation, bindings, body, args };
  }

  // -------------------------------------------------------------------------
  // Configurations

  key(C: Config): string {
    let s = '';
    for (const a of C.agents) s += this.agentKey(a) + ';';
    return s + '#' + this.worldKey(C.world);
  }

  /** Sorts anonymous agents, so that no order leaks into state equality. */
  canonical(C: Config): Config {
    return this.canonicalOrder(C).config;
  }

  /** `canonical`, with the index in `C` of each agent of the result. */
  private canonicalOrder(C: Config): { config: Config; order: number[] } {
    const identity = C.agents.map((_, i) => i);
    if (!this.anonymous || C.agents.length < 2) return { config: C, order: identity };
    const keyed = C.agents.map((a, i) => [this.agentKey(a), a, i] as const);
    keyed.sort((x, y) => x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0);
    return { config: { agents: keyed.map(([, a]) => a), world: C.world }, order: keyed.map(([, , i]) => i) };
  }

  /** Why the agent at `index` in the successor of `C` with key `key` took its decision (see `explainAll`). */
  explain(C: Config, key: string, index: number): Explanation | undefined {
    return this.explainAll(C, key)[index];
  }

  /**
   * Why each agent of the successor of `C` with key `key` (by index in it) took its decision: the
   * step is replayed with the same inputs, by a traced compilation of the algorithm. Undefined for
   * agents that were not activated (or did not decide) in that step.
   */
  explainAll(C: Config, key: string): (Explanation | undefined)[] {
    this.recording = true;
    let succ: Successor | undefined;
    try {
      succ = this.successors(C).find(s => s.key === key);
    } finally {
      this.recording = false;
    }
    if (!succ?.order || !succ.inputs) return [];
    return succ.order.map(from => {
      const input = succ!.inputs![from];
      return input && this.explainStep(C.agents[from], input);
    });
  }

  private explainStep(a: AgentV, input: StepInput): Explanation {
    const { rt, exp, lay } = this;
    const { look, env } = input;
    const perLocation = this.sensors.filter(s => s.perLocation);
    const view = Object.fromEntries(this.sensors.filter(s => !s.perLocation).map(s => [s.name, show(s.t, true)(env.get(s.name)!.value)]));
    const locations = Array.from({ length: look.size }, (_, l) => ({
      position: show(T.pos)(look.vertex(l)), here: l === look.here, neighbors: look.neighbors(l),
      sensors: Object.fromEntries(perLocation.map(s => [s.name, show(s.t, true)(env.get(s.name)!.at!(l))])),
    }));
    if (!this.traced) {
      const { model, algorithm } = exp;
      const compiler = new Compiler(rt, lay, new Map(exp.params.map(p => [p.name, p.type])), true);
      const fn = compiler.root(algorithm.step, [['mem', algorithm.mem], ['pub', algorithm.pub]], defsOf(model.defs, algorithm.defs));
      this.traced = (mem, pub) => runDet(fn, [mem, pub]) as Record<string, V>;
    }
    rt.trace = { stack: [[]], count: 0 };
    rt.look = look; rt.env = env;
    try {
      const local = this.traced(a.mem, a.pub);
      const target = look.vertex(local.move);
      const move = vertexKey(target) === vertexKey(a.pos) ? 'stay' : `${show(T.loc)(local.move)} (${show(T.pos)(target)})`;
      return { line: rt.trace.line, frame: input.label, view, locations, move, calls: rt.trace.stack[0] };
    } finally {
      rt.trace = undefined; rt.look = undefined; rt.env = undefined;
    }
  }

  /** Each sensor's value, as text: per-location sensors over the visible locations, in order. */
  private showEnv(look: Look, env: SensorEnv): Record<string, string> {
    return Object.fromEntries(this.sensors.map(s => {
      const e = env.get(s.name)!;
      return [s.name, s.perLocation
        ? show(T.list(s.t), true)(Array.from({ length: look.size }, (_, l) => e.at!(l)))
        : show(s.t, true)(e.value)];
    }));
  }

  /**
   * What agent `i` can observe in `C`: its sensors' values (as in `Explanation.view`), one entry
   * per morphism of its Look and per outcome of its sensors' choices, in the order the round
   * enumerates them.
   */
  observations(C: Config, i: number): Record<string, string>[] {
    if (!this.degree) this.degree = this.space.maxDegree(C.agents.map(a => a.pos));
    const { view, presentations } = this.presentations(C.agents[i]);
    const out: Record<string, string>[] = [];
    for (const pres of presentations) {
      const look = new Look(i, C, view, pres);
      this.environments(look, env => { out.push(this.showEnv(look, env)); });
    }
    return out;
  }

  /**
   * The decisions agent `i` may take in `C`: one per morphism of its Look and per outcome of its
   * sensors' choices, deduplicated by their effect, in the order the round enumerates them.
   */
  decisionsOf(C: Config, i: number): { decision: DecisionV; witness: Choice[] }[] {
    if (!this.degree) this.degree = this.space.maxDegree(C.agents.map(a => a.pos));
    return this.options(C, i).map(o => ({ decision: o.d, witness: o.w }));
  }

  verdict(C: Config): Verdict {
    return runDet(this.verdictFn, [C]);
  }

  line(a: AgentV): number | undefined {
    return this.lineFn && runDet(this.lineFn, [a.mem]);
  }

  // -------------------------------------------------------------------------
  // Initial configurations

  /** The instantiated model under other parameter values: settings with equal ones share a state graph. */
  instantiationWith(params: Record<string, V>): string {
    const saved = this.rt.params;
    this.rt.params = params;
    try {
      return instantiation(this.exp, this.compiler);
    } finally {
      this.rt.params = saved;
    }
  }

  /**
   * The initial configurations under other parameter values with the same instantiated model.
   * Parameters reach only the initialisation and the model's arguments, so this system explores
   * them exactly as `new System(exp, params)` would.
   */
  initialWith(params: Record<string, V>): Successor[] {
    if (this.instantiationWith(params) !== this.key0) throw new Error('initialWith: another instantiated model needs another system');
    this.checkPositions(params);
    const saved = this.rt.params;
    this.rt.params = params;
    try {
      return this.initial();
    } finally {
      this.rt.params = saved;
    }
  }

  initial(): Successor[] {
    const { exp, compiler, lay, rt, space } = this;
    const defs = defsOf(exp.model.defs);
    const algDefs = defsOf(exp.model.defs, exp.algorithm.defs);
    const k: number = runDet(compiler.root(exp.agents.count, [], defs), []);
    const posFn = compiler.root(exp.agents.pos, [['i', T.nat]], defs);
    const pubFn = compiler.root(exp.algorithm.init.pub, [['i', T.nat]], algDefs);
    const memFn = compiler.root(exp.algorithm.init.mem, [['i', T.nat]], algDefs);
    const flags = Object.fromEntries(lay.flags.map(f => [f.name, false]));
    const base: AgentV[] = Array.from({ length: k }, (_, i) => {
      const pos = runDet(posFn, [i]);
      if (!space.has(pos)) throw new Error(`agent ${i}: ${vertexKey(pos)} is not a vertex of ${space.name}`);
      return { pos, pub: runDet(pubFn, [i]), mem: runDet(memFn, [i]), f: { ...flags } };
    });
    this.degree = space.maxDegree(base.map(a => a.pos));

    // Choices of initial values: kept port permutations (per agent), agent fields (per agent), then world fields.
    type Slot = { run: (k: (v: V) => void) => void; set: (agents: AgentV[], world: Record<string, V>, v: V) => void; agent?: number };
    const slots: Slot[] = [];
    const frames = exp.model.frames;
    if (frames.kind === 'portPermutations' && frames.when === 'perRobot') {
      const perms = framePermutations(space, frames, this.degree);
      for (let i = 0; i < k; i++) {
        slots.push({
          agent: i,
          run: kk => perms.forEach((p, index) => {
            rt.witness.push({ site: `frame a${i}`, index, label: `a${i}: ports ${p.join('')}` });
            kk(p);
            rt.witness.pop();
          }),
          set: (agents, _w, v) => { agents[i].frame = v; },
        });
      }
    }
    for (const c of exp.model.components) {
      const [vars, args] = componentParams(c);
      for (const f of c.agent ?? []) {
        const fn = compiler.root(c.init!.agent![f.name], [['i', T.nat], ...vars], defsOf(exp.model.defs, c.defs));
        for (let i = 0; i < k; i++) slots.push({ run: kk => runND(fn, [i, ...args], kk), agent: i, set: (agents, _w, v) => { agents[i].f[f.name] = v; } });
      }
    }
    for (const c of exp.model.components) {
      const [vars, args] = componentParams(c);
      for (const f of c.world ?? []) {
        const fn = compiler.root(c.init!.world![f.name], vars, defsOf(exp.model.defs, c.defs));
        slots.push({ run: kk => runND(fn, args, kk), set: (_a, world, v) => { world[f.name] = v; } });
      }
    }

    const out = new Map<string, Successor>();
    const values: V[] = [];
    rt.witness = [];
    const go = (j: number) => {
      if (j === slots.length) {
        const agents = base.map(a => ({ ...a, f: { ...a.f } }));
        const world: Record<string, V> = {};
        slots.forEach((s, i) => s.set(agents, world, values[i]));
        const config = this.canonical({ agents, world });
        const key = this.key(config);
        if (!out.has(key)) out.set(key, { config, key, witness: rt.witness.slice(), activated: new Set() });
        return;
      }
      const s = slots[j];
      const depth = rt.witness.length;
      s.run(v => {
        values[j] = v;
        if (s.agent !== undefined) for (let i = depth; i < rt.witness.length; i++) if (!rt.witness[i].label.startsWith(`a${s.agent}:`)) rt.witness[i] = prefix(rt.witness[i], s.agent);
        go(j + 1);
      });
    };
    go(0);
    return [...out.values()];
  }

  // -------------------------------------------------------------------------
  // A step (docs/scheduler-design.md, section 1)

  successors(C: Config): Successor[] {
    const { rt, space, scheduler } = this;
    if (!this.degree) this.degree = space.maxDegree(C.agents.map(a => a.pos));
    const out = new Map<string, Successor>();
    const states = space.states();
    rt.witness = [];
    states.forEach(({ state, label }, si) => {
      // 1. The space state, then beforeLook.
      rt.spaceState = state;
      if (states.length > 1) rt.witness.push({ site: 'edges', index: si, label });
      this.parallel(C, this.hooks.beforeLook, eff => {
        const C1 = this.apply(C, eff);
        // The agents that take their next event, and the scheduler's own effect.
        const eligible = C1.agents.flatMap((a, i) => rt.acts(a) === 'never' ? [] : [i]);
        scheduler.schedule(C1, eligible, rt.witness, (active, effS) => {
          const C2 = this.apply(C1, effS);
          const event = (i: number) => scheduler.events[C2.agents[i].phase ?? 0];
          const has = (i: number, instant: Instant) => event(i).includes(instant);
          // 2. Looks, all from the configuration at the start of the step, and their decisions.
          this.decide(C2, active.filter(i => has(i, 'look')), (looked, inputs) => {
            const decisions = C2.agents.map((a, i) => looked[i].decided ? looked[i] : a.pending ?? looked[i]);
            const at = (instant: Instant) => {
              const now = new Set(active.filter(i => has(i, instant)));
              return decisions.map((d, i) => now.has(i) ? d : this.idle(C2.agents[i]));
            };
            // 3. onCompute, with the decisions taking effect now; then their states apply.
            const computing = at('compute');
            rt.decisions = computing;
            this.parallel(C2, this.hooks.onCompute, effC => {
              const C3 = this.compute(this.apply(C2, effC), computing);
              // 4. beforeMove, with the moves happening now; then the moves.
              const moving = at('move');
              rt.decisions = moving;
              this.parallel(C3, this.hooks.beforeMove, effM => {
                const C4 = this.move(this.apply(C3, effM), moving);
                // 5. afterMove; then the scheduled agents advance in their cycle.
                this.parallel(C4, this.hooks.afterMove, effA => {
                  const C5 = this.advance(this.apply(C4, effA), active, decisions);
                  const { config, order } = this.canonicalOrder(C5);
                  const key = this.key(config);
                  const known = out.get(key);
                  if (known) for (const i of active) known.activated.add(i);
                  else out.set(key, {
                    config, key, witness: rt.witness.slice(), activated: new Set(active),
                    ...(this.recording ? { inputs: inputs.slice(), order } : {}),
                  });
                });
              });
            });
          });
        });
      });
      if (states.length > 1) rt.witness.pop();
    });
    rt.spaceState = [];
    return [...out.values()];
  }

  /** All hooks of a hook point read the same snapshot; their effects are merged. */
  private parallel(C: Config, hooks: Bound[], k: (eff: Effect | undefined) => void) {
    if (!hooks.length) return k(undefined);
    const effects: Effect[] = new Array(hooks.length);
    const go = (i: number): void => {
      if (i === hooks.length) return k(merge(effects));
      runND(hooks[i].fn, [C, ...hooks[i].args], e => { effects[i] = e; go(i + 1); });
    };
    go(0);
  }

  private apply(C: Config, eff: Effect | undefined): Config {
    if (!eff) return C;
    const worldNames = Object.keys(eff.world);
    const world = worldNames.length ? { ...C.world, ...eff.world } : C.world;
    let agents = C.agents;
    const own = (i: number) => {
      if (agents === C.agents) agents = agents.slice();
      if (agents[i] === C.agents[i]) agents[i] = { ...agents[i], f: { ...agents[i].f } };
      return agents[i];
    };
    for (const [flag, marks] of Object.entries(eff.raise)) {
      for (let i = 0; i < agents.length; i++) if (marks[i] && !agents[i].f[flag]) own(i).f[flag] = true;
    }
    if (eff.agents) {
      eff.agents.forEach((fields, i) => {
        if (!fields) return;
        const changed = Object.entries(fields).filter(([n, v]) => !equality(this.fieldType(n))(agents[i].f[n], v));
        for (const [n, v] of changed) own(i).f[n] = v;
      });
    }
    return agents === C.agents && world === C.world ? C : { agents, world };
  }

  private fieldType(name: string): Type {
    return this.lay.agentFields.find(f => f.name === name)!.type;
  }

  private idle(a: AgentV): DecisionV {
    return { decided: false, target: a.pos, pub: a.pub, mem: a.mem, ...this.actionDefaults };
  }

  /** The product, over the looking agents, of their possible decisions (with the inputs of each, by agent); idle for the others. */
  private decide(C: Config, active: number[], k: (decisions: DecisionV[], inputs: (StepInput | undefined)[]) => void) {
    const options = active.map(i => this.options(C, i));
    const decisions = C.agents.map(a => this.idle(a));
    const inputs: (StepInput | undefined)[] = C.agents.map(() => undefined);
    const w = this.rt.witness;
    const go = (j: number): void => {
      if (j === active.length) return k(decisions.slice(), inputs);
      for (const { d, w: parts, input } of options[j]) {
        decisions[active[j]] = d;
        inputs[active[j]] = input;
        for (const p of parts) w.push(p);
        go(j + 1);
        w.length -= parts.length;
      }
    };
    go(0);
  }

  /** The view around a position, and its presentations (cached: they depend only on the position and the frame). */
  private presentations(a: AgentV): { view: View; presentations: Presentation[] } {
    const frames = this.exp.model.frames;
    const pk = vertexKey(a.pos);
    let entry = this.views.get(pk);
    if (!entry) {
      entry = { view: viewAround(this.space, a.pos, this.radius), presentations: new Map() };
      this.views.set(pk, entry);
    }
    const fk = a.frame?.join(',') ?? '';
    let ps = entry.presentations.get(fk);
    if (!ps) {
      const view = entry.view;
      if (frames.kind === 'isomorphisms') {
        const sigmas = rootedAutomorphisms(view);
        ps = sigmas.map((s, j) => isomorphicPresentation(view, s, sigmas.length > 1 ? (j === 0 ? 'as is' : `isomorphism ${j}`) : ''));
      } else if (frames.kind === 'portPermutations' && frames.when === 'perLook') {
        const perms = framePermutations(this.space, frames, this.degree);
        ps = perms.map(p => portPresentation(view, p, perms.length > 1 ? `ports ${p.join('')}` : ''));
      } else {
        ps = [portPresentation(view, a.frame ?? Array.from({ length: this.degree }, (_, i) => i), '')];
      }
      entry.presentations.set(fk, ps);
    }
    return { view: entry.view, presentations: ps };
  }

  /**
   * The decisions an agent may take: one per morphism of its Look and per outcome of its sensors'
   * choices, deduplicated by their effect (target position, new state, actions), keeping the
   * first witness.
   */
  private options(C: Config, i: number): { d: DecisionV; w: Choice[]; input?: StepInput }[] {
    const { rt } = this;
    const a = C.agents[i];
    if (rt.acts(a) === 'adversary') {
      const seen = new Set<string>();
      const targets = [a.pos, ...this.space.neighbors(a.pos)].filter(v => { const k = vertexKey(v); if (seen.has(k)) return false; seen.add(k); return true; });
      return targets.map((target, index) => ({
        d: { ...this.idle(a), decided: true, target },
        w: [{ site: `adversary a${i}`, index, label: `a${i} (adversary): ${index === 0 ? 'stay' : show(T.pos)(target)}` }],
      }));
    }
    const saved = rt.witness;
    const found = new Map<string, { d: DecisionV; w: Choice[]; input?: StepInput }>();
    const { view, presentations } = this.presentations(a);
    presentations.forEach((pres, pi) => {
      rt.witness = presentations.length > 1 ? [{ site: `frame a${i}`, index: pi, label: `a${i}: ${pres.label}` }] : [];
      const depth = rt.witness.length;
      const look = new Look(i, C, view, pres);
      this.environments(look, env => {
        const local = this.step(a.mem, a.pub, look, env);
        const d: DecisionV = {
          ...this.actionDefaults, ...local, decided: true,
          target: look.vertex(local.move), pub: local.pub ?? a.pub, mem: local.mem ?? a.mem,
        };
        delete (d as Record<string, V>).move;
        const key = this.decisionKey(d);
        if (!found.has(key)) {
          found.set(key, { d, w: rt.witness.map((c, j) => j < depth ? c : prefix(c, i)), ...(this.recording ? { input: { label: pres.label, look, env } } : {}) });
        }
      });
    });
    rt.witness = saved;
    return [...found.values()];
  }

  /** The sensor environments of a Look: the outcomes of its sensors' Look-level choices, in order of `uses`. */
  private environments(look: Look, k: (env: SensorEnv) => void) {
    const { sensors } = this;
    const env: SensorEnv = new Map();
    const C = look.config;
    const go = (j: number): void => {
      if (j === sensors.length) return k(new Map(env));
      const s = sensors[j];
      const bound: V[] = [];
      const bind = (b: number): void => {
        if (b === s.bindings.length) {
          if (!s.perLocation) {
            runND(s.body, [look, ...bound, ...s.args, C], v => { env.set(s.name, { value: v }); go(j + 1); });
            return;
          }
          const memo = new Map<number, V>();
          const values = bound.slice();
          env.set(s.name, {
            at: l => {
              if (!(l >= 0 && l < look.size)) throw new Error(`sensor ${s.name}: location ${l} is not in the Look`);
              let v = memo.get(l);
              if (v === undefined && !memo.has(l)) { v = runDet(s.body, [look, l, ...values, ...s.args, C]); memo.set(l, v); }
              return v;
            },
          });
          go(j + 1);
          return;
        }
        runND(s.bindings[b], [look, ...bound, ...s.args, C], v => { bound[b] = v; bind(b + 1); bound.length = b; });
      };
      bind(0);
    };
    go(0);
  }

  /** What the step can observe: the Look's structure and every sensor value, as a key for its memo. */
  private signature(look: Look, env: SensorEnv): string {
    let s = `${look.here}:${look.pres.nbrs.map(n => n.join(',')).join(';')}`;
    for (const sensor of this.sensors) {
      const e = env.get(sensor.name)!;
      const enc = encoder(sensor.t);
      s += '|' + (sensor.perLocation ? Array.from({ length: look.size }, (_, l) => enc(e.at!(l))).join(',') : enc(e.value));
    }
    return s;
  }

  /** Compute: the public states and memories of the decisions taking effect, for agents that still act. */
  private compute(C: Config, decisions: DecisionV[]): Config {
    const { rt } = this;
    let changed = false;
    const agents = C.agents.map((a, i) => {
      const d = decisions[i];
      if (!d.decided || rt.acts(a) === 'never' || (d.pub === a.pub && d.mem === a.mem)) return a;
      changed = true;
      return { ...a, pub: d.pub, mem: d.mem };
    });
    return changed ? { agents, world: C.world } : C;
  }

  /** Movement along edges: to the agent's position or a neighbor; through an edge missing this step, the agent stays. */
  private move(C: Config, decisions: DecisionV[]): Config {
    const { rt, space } = this;
    let changed = false;
    const agents = C.agents.map((a, i) => {
      const d = decisions[i];
      if (!d.decided || rt.acts(a) === 'never' || vertexKey(d.target) === vertexKey(a.pos)) return a;
      if (!space.neighbors(a.pos).some(w => vertexKey(w) === vertexKey(d.target))) {
        throw new Error(`a${i} moves from u${vertexKey(a.pos)} to u${vertexKey(d.target)}, which is not a neighbor`);
      }
      if (!space.edgePresent(rt.spaceState, a.pos, d.target)) return a;
      changed = true;
      return { ...a, pos: d.target };
    });
    return changed ? { agents, world: C.world } : C;
  }

  /** The scheduled agents take their event: the next one of their cycle, keeping the decision until its last. */
  private advance(C: Config, active: number[], decisions: DecisionV[]): Config {
    const n = this.scheduler.events.length;
    if (n === 1) return C;
    const agents = C.agents.slice();
    for (const i of active) {
      const phase = ((agents[i].phase ?? 0) + 1) % n;
      const { phase: _p, pending: _d, ...rest } = agents[i];
      agents[i] = phase ? { ...rest, phase, pending: decisions[i] } : rest;
    }
    return { agents, world: C.world };
  }
}

type Bound = { fn: RootFn; args: V[] };

const HOOK_POINTS = ['beforeLook', 'onCompute', 'beforeMove', 'afterMove'] as const;
type HookPoint = typeof HOOK_POINTS[number];

/** The type of a decision: whether the agent decided, its target, its new state and its actions. */
export function decisionType(lay: Layout): Type {
  return T.record([
    { name: 'decided', type: T.bool }, { name: 'target', type: T.pos }, { name: 'pub', type: lay.pub }, { name: 'mem', type: lay.mem },
    ...lay.actions.map(({ name, type }) => ({ name, type })),
  ]);
}

/** A component's parameters, as extra root variables, and their values. */
function componentParams(c: Component | undefined): [[string, Type][], V[]] {
  const params = c?.params ?? [];
  return [params.map(p => [p.name, p.type]), params.map(p => c!.args![p.name])];
}

function prefix(c: Choice, agent: number): Choice {
  return { ...c, label: `a${agent}: ${c.label}` };
}

function merge(effects: Effect[]): Effect {
  if (effects.length === 1) return effects[0];
  const eff: Effect = { world: {}, raise: {} };
  for (const e of effects) {
    Object.assign(eff.world, e.world);
    for (const [flag, marks] of Object.entries(e.raise)) {
      const into = eff.raise[flag] ??= [];
      marks.forEach((m, i) => { if (m) into[i] = true; });
    }
    if (e.agents) {
      const into = eff.agents ??= [];
      e.agents.forEach((fields, i) => { if (fields) into[i] = { ...into[i], ...fields }; });
    }
  }
  return eff;
}

/** A compiler and runtime for parameter domains: the space is built whenever its parameters are fixed. */
function domainContext(exp: Experiment) {
  const checked = check(exp);
  if (checked.errors.length) throw new IRError(checked.errors);
  const rt = new Runtime(checked.layout);
  const compiler = new Compiler(rt, checked.layout, new Map(exp.params.map(p => [p.name, p.type])));
  const defs = defsOf(exp.model.defs);
  const at = (params: Record<string, V>) => {
    rt.params = params;
    rt.space = undefined as unknown as SpaceRuntime;
    try { rt.space = buildSpace(exp.model.space, compiler, defs); } catch {
      // A parameter of the space is not fixed yet: domains cannot use positions yet.
    }
  };
  return { rt, compiler, defs, at };
}

/**
 * The values of the experiment's parameters, for `check-all`: each domain
 * is evaluated with the earlier parameters fixed.
 */
export function* parameterValues(exp: Experiment): Generator<Record<string, V>> {
  const { compiler, defs, at } = domainContext(exp);
  const domains = exp.params.map(p => p.domain && compiler.root(p.domain, [], defs));
  const accepts = exp.params.map(p => p.accepts && compiler.root(p.accepts, [], defs));
  function* go(i: number, params: Record<string, V>): Generator<Record<string, V>> {
    if (i === exp.params.length) { yield { ...params }; return; }
    const domain = domains[i];
    if (!domain) throw new Error(`parameter ${exp.params[i].name} has no finite domain; provide checkSettings in project.ts for check-all`);
    at(params);
    for (const v of runDet(domain, []) as V[]) {
      const candidate = { ...params, [exp.params[i].name]: v };
      if (accepts[i]) {
        at(candidate);
        if (!runDet(accepts[i]!, [])) continue;
      }
      yield* go(i + 1, candidate);
    }
  }
  yield* go(0, {});
}

/** A simple editable fallback, independent of the parameter's declared domain. */
function defaultValue(t: Type): V {
  switch (t.k) {
    case 'nat': case 'int': case 'pos': return 0;
    case 'bool': return false;
    case 'enum': return t.ctors[0];
    case 'verdict': return 'inProgress';
    case 'string': return '';
    case 'list': case 'multiset': return [];
    case 'record': return Object.fromEntries(t.fields.map(f => [f.name, defaultValue(f.type)]));
    default: return null;
  }
}

/** Small candidate sets for predicate-only domains; this is not an enumeration of them. */
function* defaultCandidates(t: Type, space?: SpaceRuntime): Generator<V> {
  switch (t.k) {
    case 'nat':
      for (let n = 0; n < 64; n++) yield n;
      return;
    case 'pos':
      if (space?.vertices) yield* space.vertices.slice(0, 64);
      else for (let n = 0; n < 64; n++) { yield n; if (n) yield -n; }
      return;
    case 'int':
      yield 0;
      for (let n = 1; n < 64; n++) { yield n; yield -n; }
      return;
    case 'bool': yield false; yield true; return;
    case 'enum': yield* t.ctors; return;
    default: yield defaultValue(t);
  }
}

/**
 * Simulator starting values, separate from model semantics and check-all.
 * Search a bounded prefix for a matching setting, honoring project overrides.
 * If no complete setting is found, choose each parameter in order, falling back
 * to an editable value of its type where matching is too difficult or impossible.
 */
export function parameterDefaults(exp: Experiment, overrides: Record<string, V> = {}): Record<string, V> {
  const { rt, compiler, defs, at } = domainContext(exp);
  const domains = exp.params.map(p => p.domain && compiler.root(p.domain, [], defs));
  const accepts = exp.params.map(p => p.accepts && compiler.root(p.accepts, [], defs));
  function* candidates(i: number, params: Record<string, V>): Generator<V> {
    const p = exp.params[i];
    if (p.name in overrides) { yield overrides[p.name]; return; }
    at(params);
    try {
      yield* domains[i] ? runDet(domains[i]!, []) as V[] : defaultCandidates(p.type, rt.space);
    } catch {
      // An incomplete setting may not yet support a space-dependent domain.
    }
  }
  const matches = (i: number, params: Record<string, V>) => {
    if (exp.params[i].name in overrides || !accepts[i]) return true;
    at(params);
    try { return !!runDet(accepts[i]!, []); } catch { return false; }
  };
  let remaining = 1024;
  const search = (i: number, params: Record<string, V>): Record<string, V> | undefined => {
    if (i === exp.params.length) return params;
    for (const value of candidates(i, params)) {
      if (--remaining < 0) break;
      const next = { ...params, [exp.params[i].name]: value };
      if (!matches(i, next)) continue;
      const found = search(i + 1, next);
      if (found) return found;
    }
  };
  const found = search(0, {});
  if (found) return found;
  const fallback: Record<string, V> = {};
  for (const [i, p] of exp.params.entries()) {
    fallback[p.name] = p.name in overrides ? overrides[p.name] : defaultValue(p.type);
    let tried = 0;
    for (const value of candidates(i, fallback)) {
      if (++tried > 128) break;
      const next = { ...fallback, [p.name]: value };
      if (matches(i, next)) { fallback[p.name] = value; break; }
    }
  }
  return fallback;
}

/** Parameters outside their declared domains, without enumerating the settings product. */
export function parameterDomainViolations(exp: Experiment, params: Record<string, V>): string[] {
  const { compiler, defs, at } = domainContext(exp);
  at(params);
  return exp.params.filter(p => {
    try {
      if (p.accepts && !runDet(compiler.root(p.accepts, [], defs), [])) return true;
      // Parameters without a domain are supplied by the user and impose no domain restriction.
      if (!p.domain) return false;
      const values = runDet(compiler.root(p.domain, [], defs), []) as V[];
      const equal = equality(p.type);
      return !values.some(value => equal(value, params[p.name]));
    } catch {
      return true;
    }
  }).map(p => p.name);
}

const definitionCache = new WeakMap<Experiment, Map<string, (...args: V[]) => V>>();

/**
 * A definition of an experiment (`def f (x : T) : R := e` in `.sim`), as a function on values:
 * renderers and tests reuse the algorithm's own definitions. Deterministic definitions that do
 * not read the Look only.
 */
export function definition(exp: Experiment, name: string): (...args: V[]) => V {
  let cache = definitionCache.get(exp);
  if (!cache) definitionCache.set(exp, cache = new Map());
  let f = cache.get(name);
  if (!f) {
    const checked = check(exp);
    if (checked.errors.length) throw new IRError(checked.errors);
    const compiler = new Compiler(new Runtime(checked.layout), checked.layout, new Map(exp.params.map(p => [p.name, p.type])));
    const defs = defsOf(exp.model.defs, exp.algorithm.defs, exp.task.defs);
    const def = defs.get(name);
    if (!def) throw new Error(`${exp.name} has no definition ${name}`);
    const fn = compiler.root(def.body, def.params.map(p => [p.name, p.type]), defs);
    f = (...args: V[]) => runDet(fn, args);
    cache.set(name, f);
  }
  return f;
}
