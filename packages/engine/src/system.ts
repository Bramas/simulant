/**
 * An experiment with concrete parameters: its initial configurations, the
 * successors of a configuration under the model's round, and the task's
 * verdict (plan, Sections 3.7 and 6.4).
 */
import { check } from '@bramas/simulant-lang/check';
import type { Component, Def, Experiment, Type } from '@bramas/simulant-lang/ir';
import type { Layout } from '@bramas/simulant-lang/layout';
import { T } from '@bramas/simulant-lang/types';
import {
  Compiler, Runtime, type AgentV, type Choice, type Config, type DecisionV, type Effect, type RootFn, type TraceCall,
} from './compile';
import { DynamicRing, Ring, type Move, type TopologyRuntime } from './topology';
import { encoder, show, type V } from './values';

export type { AgentV, Choice, Config, DecisionV, TraceCall };

/** What an activated agent saw in a step: its frame and its view. */
export type StepInput = { frame: V; view: Record<string, V> };

/** Why an agent took its decision in a step (`System.explain`). */
export type Explanation = {
  /** The source line of the statement that decided (`Expr.at`), when the algorithm has lines. */
  line?: number;
  frame: string;
  /** Each sensor's value, as text. */
  view: Record<string, string>;
  /** The local move, as the algorithm returned it. */
  move: string;
  /** The definitions the step called, with their arguments, results and return lines. */
  calls: TraceCall[];
};

export type Successor = {
  config: Config;
  key: string;
  /** The choices of the first (smallest) witness leading to this configuration. */
  witness: Choice[];
  /** Agents (indices in the source configuration) activated by some witness of this step. */
  activated: Set<number>;
  /** When recording (`explain`): each agent's inputs (by index in the source configuration), and the source index of each agent of `config`. */
  inputs?: (StepInput | undefined)[];
  order?: number[];
};

export type Verdict = 'success' | 'failure' | 'inProgress';

/** Interpreter-only algorithms (`Algorithm.native`). */
export type NativeStep = (mem: V, pub: V, view: Record<string, V>) => { move: Move; pub?: V; mem?: V; [action: string]: V };

export type SystemOptions = {
  natives?: Record<string, NativeStep>;
  /** Store anonymous agents sorted (default: under FSYNC). Off, agents keep their index, as in Lean. */
  sortAgents?: boolean;
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

export function makeTopology(exp: Experiment, size: number): TopologyRuntime {
  const t = exp.model.topology;
  return t.kind === 'ring' ? new Ring(size) : new DynamicRing(size, t.k);
}

const MOVES: Move[] = ['stay', 'cw', 'ccw'];

export class System {
  readonly rt: Runtime;
  readonly lay: Layout;
  readonly topo: TopologyRuntime;
  /** Anonymous agents are stored as a sorted multiset; under SSYNC (or when asked) they keep their identity. */
  readonly anonymous: boolean;
  private readonly compiler: Compiler;
  /** Compiled roots, with the values of their component's parameters (passed after the root's own variables). */
  private readonly sensors: Bound[];
  private readonly sensorNames: string[];
  private readonly hooks: Record<'beforeLook' | 'beforeMove' | 'afterMove', Bound[]>;
  private readonly step: (mem: V, pub: V, view: Record<string, V>) => Record<string, V>;
  private readonly verdictFn: RootFn;
  private readonly lineFn?: RootFn;
  private readonly agentKey: (a: AgentV) => string;
  private readonly worldKey: (w: Record<string, V>) => string;
  private readonly decisionKey: (d: DecisionV) => string;
  private readonly actionDefaults: Record<string, V>;
  private readonly showFrame: (f: V) => string;
  /** While set, successors record their agents' inputs (for `explain`). */
  private recording = false;
  private traced?: (mem: V, pub: V, view: Record<string, V>) => Record<string, V>;

  constructor(readonly exp: Experiment, readonly params: Record<string, V>, opts: SystemOptions = {}) {
    const checked = check(exp);
    if (checked.errors.length) throw new IRError(checked.errors);
    const lay = this.lay = checked.layout;
    const rt = this.rt = new Runtime(lay);
    for (const p of exp.params) {
      if (!(p.name in params)) throw new Error(`missing parameter ${p.name}`);
    }
    rt.params = params;
    const paramTypes = new Map(exp.params.map(p => [p.name, p.type]));
    const compiler = this.compiler = new Compiler(rt, lay, paramTypes);
    const { model, algorithm, task } = exp;
    const defsOf = (...lists: (Def[] | undefined)[]) => new Map(lists.flatMap(l => l ?? []).map(d => [d.name, d]));

    this.topo = rt.topo = makeTopology(exp, runDet(compiler.root(model.topology.size, [], defsOf(model.defs)), []));
    this.anonymous = opts.sortAgents ?? model.round === 'fsync';

    const sensorVars: [string, Type][] = [['C', T.config], ['me', T.agent], ['frame', T.frame]];
    const sensorDefs = new Map(lay.sensors.map(s => {
      const owner = model.components.find(c => c.name === s.owner);
      const [vars, args] = componentParams(owner);
      return [s.name, { fn: compiler.root(s.body, [...sensorVars, ...vars], defsOf(model.defs, owner?.defs)), args }];
    }));
    this.sensorNames = algorithm.uses;
    this.sensors = algorithm.uses.map(name => sensorDefs.get(name)!);

    this.hooks = { beforeLook: [], beforeMove: [], afterMove: [] };
    for (const c of model.components) {
      const [vars, args] = componentParams(c);
      for (const hook of ['beforeLook', 'beforeMove', 'afterMove'] as const) {
        const body = c[hook];
        if (body) this.hooks[hook].push({ fn: compiler.root(body, [['C', T.config], ...vars], defsOf(model.defs, c.defs)), args });
      }
    }

    this.actionDefaults = Object.fromEntries(lay.actions.map(a => [a.name, a.default]));
    if (algorithm.native) {
      const native = opts.natives?.[algorithm.native];
      if (!native) throw new Error(`native algorithm ${algorithm.native} is not registered`);
      this.step = native;
    } else {
      const stepFn = compiler.root(algorithm.step, [['mem', algorithm.mem], ['pub', algorithm.pub], ['view', lay.view]], defsOf(model.defs, algorithm.defs));
      const step = (mem: V, pub: V, view: Record<string, V>) => runDet(stepFn, [mem, pub, view]) as Record<string, V>;
      if (opts.memoStep === false) this.step = step;
      else {
        // Steps are deterministic: an algorithm that computes much (views of a whole ring) runs once per input.
        const [memKey, pubKey, viewKey] = [encoder(algorithm.mem), encoder(lay.pub), encoder(lay.view)];
        const memo = new Map<string, Record<string, V>>();
        this.step = (mem, pub, view) => {
          const key = `${memKey(mem)}|${pubKey(pub)}|${viewKey(view)}`;
          let out = memo.get(key);
          if (!out) {
            if (memo.size >= 1 << 17) memo.clear();
            out = step(mem, pub, view);
            memo.set(key, out);
          }
          return out;
        };
      }
    }
    if (algorithm.line) this.lineFn = compiler.root(algorithm.line, [['mem', algorithm.mem]], defsOf(model.defs, algorithm.defs));
    this.verdictFn = compiler.root(task.verdict, [['C', T.config]], defsOf(model.defs, task.defs));

    const pos = encoder(T.node);
    const fields = [
      ...lay.flags.map(f => (a: AgentV) => a.f[f.name] ? '1' : '0'),
      ...lay.agentFields.map(f => { const e = encoder(f.type); return (a: AgentV) => e(a.f[f.name]); }),
    ];
    const pubKey = encoder(lay.pub);
    const memKey = encoder(lay.mem);
    this.agentKey = a => {
      let s = pos(a.pos) + '|';
      for (const f of fields) s += f(a);
      return s + '|' + pubKey(a.pub) + '|' + memKey(a.mem);
    };
    this.worldKey = encoder(lay.worldType);
    this.decisionKey = encoder(lay.decision);
    this.showFrame = show(T.frame);
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
    const view = Object.fromEntries(lay.view.k === 'record'
      ? lay.view.fields.map(f => [f.name, show(f.type, true)(input.view[f.name])])
      : Object.entries(input.view).map(([k, v]) => [k, String(v)]));
    if (exp.algorithm.native) {
      const local = this.step(a.mem, a.pub, input.view);
      return { frame: this.showFrame(input.frame), view, move: String(local.move), calls: [] };
    }
    if (!this.traced) {
      const { model, algorithm } = exp;
      const compiler = new Compiler(rt, lay, new Map(exp.params.map(p => [p.name, p.type])), true);
      const defs = new Map([...(model.defs ?? []), ...(algorithm.defs ?? [])].map(d => [d.name, d]));
      const fn = compiler.root(algorithm.step, [['mem', algorithm.mem], ['pub', algorithm.pub], ['view', lay.view]], defs);
      this.traced = (mem, pub, v) => runDet(fn, [mem, pub, v]) as Record<string, V>;
    }
    rt.trace = { stack: [[]], count: 0 };
    try {
      const local = this.traced(a.mem, a.pub, input.view);
      return { line: rt.trace.line, frame: this.showFrame(input.frame), view, move: String(local.move), calls: rt.trace.stack[0] };
    } finally {
      rt.trace = undefined;
    }
  }

  verdict(C: Config): Verdict {
    return runDet(this.verdictFn, [C]);
  }

  line(a: AgentV): number | undefined {
    return this.lineFn && runDet(this.lineFn, [a.mem]);
  }

  // -------------------------------------------------------------------------
  // Initial configurations

  /** The ring size under other parameter values. */
  sizeWith(params: Record<string, V>): number {
    const saved = this.rt.params;
    this.rt.params = params;
    try {
      const defs = new Map((this.exp.model.defs ?? []).map(d => [d.name, d]));
      return runDet(this.compiler.root(this.exp.model.topology.size, [], defs), []);
    } finally {
      this.rt.params = saved;
    }
  }

  /**
   * The initial configurations under other parameter values with the same ring size. Parameters
   * reach only the initialisation and the topology size (the checker enforces it), so this system
   * explores them exactly as `new System(exp, params)` would.
   */
  initialWith(params: Record<string, V>): Successor[] {
    if (this.sizeWith(params) !== this.topo.size) throw new Error('initialWith: another ring size needs another system');
    const saved = this.rt.params;
    this.rt.params = params;
    try {
      return this.initial();
    } finally {
      this.rt.params = saved;
    }
  }

  initial(): Successor[] {
    const { exp, compiler, lay, rt } = this;
    const defs = new Map((exp.model.defs ?? []).map(d => [d.name, d]));
    const algDefs = new Map([...(exp.model.defs ?? []), ...(exp.algorithm.defs ?? [])].map(d => [d.name, d]));
    const k: number = runDet(compiler.root(exp.agents.count, [], defs), []);
    const posFn = compiler.root(exp.agents.pos, [['i', T.nat]], defs);
    const pubFn = compiler.root(exp.algorithm.init.pub, [['i', T.nat]], algDefs);
    const memFn = compiler.root(exp.algorithm.init.mem, [['i', T.nat]], algDefs);
    const flags = Object.fromEntries(lay.flags.map(f => [f.name, false]));
    const base: AgentV[] = Array.from({ length: k }, (_, i) => ({
      pos: runDet(posFn, [i]) % this.topo.size, pub: runDet(pubFn, [i]), mem: runDet(memFn, [i]), f: { ...flags },
    }));

    // Choices of initial values: agent fields (per agent), then world fields.
    type Slot = { fn: RootFn; args: V[]; set: (agents: AgentV[], world: Record<string, V>, v: V) => void; agent?: number };
    const slots: Slot[] = [];
    for (const c of exp.model.components) {
      const cdefs = new Map([...(exp.model.defs ?? []), ...(c.defs ?? [])].map(d => [d.name, d]));
      const [vars, args] = componentParams(c);
      for (const f of c.agent ?? []) {
        const fn = compiler.root(c.init!.agent![f.name], [['i', T.nat], ...vars], cdefs);
        for (let i = 0; i < k; i++) slots.push({ fn, args: [i, ...args], agent: i, set: (agents, _w, v) => { agents[i].f[f.name] = v; } });
      }
    }
    for (const c of exp.model.components) {
      const cdefs = new Map([...(exp.model.defs ?? []), ...(c.defs ?? [])].map(d => [d.name, d]));
      const [vars, args] = componentParams(c);
      for (const f of c.world ?? []) {
        const fn = compiler.root(c.init!.world![f.name], vars, cdefs);
        slots.push({ fn, args, set: (_a, world, v) => { world[f.name] = v; } });
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
      runND(s.fn, s.args, v => {
        values[j] = v;
        if (s.agent !== undefined) for (let i = depth; i < rt.witness.length; i++) rt.witness[i] = prefix(rt.witness[i], s.agent);
        go(j + 1);
      });
    };
    go(0);
    return [...out.values()];
  }

  // -------------------------------------------------------------------------
  // The standard round (plan 3.7)

  successors(C: Config): Successor[] {
    const { rt, topo } = this;
    const out = new Map<string, Successor>();
    const states = topo.states();
    rt.witness = [];
    states.forEach(({ state, label }, si) => {
      // 1. The topology state, then beforeLook.
      rt.topoState = state;
      if (states.length > 1) rt.witness.push({ site: 'topology', index: si, label });
      this.parallel(C, this.hooks.beforeLook, eff => {
        const C1 = this.apply(C, eff);
        // 2. Activation.
        this.activate(C1, active => {
          // 3. Frames, look and compute.
          this.decide(C1, active, (decisions, inputs) => {
            rt.decisions = decisions;
            // 4. beforeMove, with the decisions.
            this.parallel(C1, this.hooks.beforeMove, eff2 => {
              // 5. Move.
              const C3 = this.move(this.apply(C1, eff2), decisions);
              // 6. afterMove.
              this.parallel(C3, this.hooks.afterMove, eff3 => {
                const { config, order } = this.canonicalOrder(this.apply(C3, eff3));
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
      if (states.length > 1) rt.witness.pop();
    });
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
    for (const [flag, marks] of Object.entries(eff.raise)) {
      for (let i = 0; i < agents.length; i++) {
        if (!marks[i] || agents[i].f[flag]) continue;
        if (agents === C.agents) agents = agents.slice();
        agents[i] = { ...agents[i], f: { ...agents[i].f, [flag]: true } };
      }
    }
    return agents === C.agents && world === C.world ? C : { agents, world };
  }

  /** FSYNC: all eligible agents; SSYNC: any nonempty subset; sequential: any singleton. */
  private activate(C: Config, k: (active: number[]) => void) {
    const eligible = C.agents.flatMap((a, i) => this.rt.acts(a) === 'never' ? [] : [i]);
    if (this.exp.model.round === 'fsync' || eligible.length === 0) return k(eligible);
    const w = this.rt.witness;
    let index = 0;
    const maxSize = this.exp.model.round === 'sequential' ? 1 : eligible.length;
    for (let size = 1; size <= maxSize; size++) {
      const pick = (from: number, current: number[]) => {
        if (current.length === size) {
          w.push({ site: 'activation', index: index++, label: `activates ${current.map(i => `a${i}`).join(', ')}` });
          k(current.slice());
          w.pop();
          return;
        }
        for (let i = from; i < eligible.length; i++) {
          current.push(eligible[i]);
          pick(i + 1, current);
          current.pop();
        }
      };
      pick(0, []);
    }
  }

  private idle(a: AgentV): DecisionV {
    return { decided: false, move: 'stay', pub: a.pub, mem: a.mem, ...this.actionDefaults };
  }

  /** The product, over the activated agents, of their possible decisions (with the inputs of each, by agent). */
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

  private frameChoices(a: AgentV): V[] {
    const fm = this.exp.model.frame;
    if (fm.kind === 'common') return [this.topo.identityFrame];
    if (fm.kind === 'dynamicReflection') return this.topo.frames;
    return [a.f[fm.field]];
  }

  /**
   * The decisions an agent may take: one per frame and per outcome of its
   * sensors' choices, deduplicated by their effect (global move, new state,
   * actions), keeping the first witness.
   */
  private options(C: Config, i: number): { d: DecisionV; w: Choice[]; input?: StepInput }[] {
    const { rt } = this;
    const a = C.agents[i];
    if (rt.acts(a) === 'adversary') {
      return MOVES.map((move, index) => ({
        d: { ...this.idle(a), decided: true, move },
        w: [{ site: `adversary a${i}`, index, label: `a${i} (adversary): ${move}` }],
      }));
    }
    const saved = rt.witness;
    const found = new Map<string, { d: DecisionV; w: Choice[]; input?: StepInput }>();
    const frames = this.frameChoices(a);
    frames.forEach((frame, fi) => {
      rt.witness = frames.length > 1 ? [{ site: `frame a${i}`, index: fi, label: `a${i}: ${this.showFrame(frame)}` }] : [];
      const depth = rt.witness.length;
      this.view(C, i, frame, view => {
        const local = this.step(a.mem, a.pub, view);
        const d: DecisionV = {
          ...this.actionDefaults, ...local, decided: true,
          move: this.topo.toGlobal(frame, local.move as Move), pub: local.pub ?? a.pub, mem: local.mem ?? a.mem,
        };
        const key = this.decisionKey(d);
        if (!found.has(key)) {
          found.set(key, { d, w: rt.witness.map((c, j) => j < depth ? c : prefix(c, i)), ...(this.recording ? { input: { frame, view } } : {}) });
        }
      });
    });
    rt.witness = saved;
    return [...found.values()];
  }

  /** The sensors of an activation, evaluated once each (with their choices). */
  private view(C: Config, i: number, frame: V, k: (view: Record<string, V>) => void) {
    const { sensors, sensorNames } = this;
    const view: Record<string, V> = {};
    const go = (j: number): void => {
      if (j === sensors.length) return k({ ...view });
      runND(sensors[j].fn, [C, i, frame, ...sensors[j].args], v => { view[sensorNames[j]] = v; go(j + 1); });
    };
    go(0);
  }

  /** Rigid movement along the edges present in this round; only agents that still act apply their decision. */
  private move(C: Config, decisions: DecisionV[]): Config {
    const { rt, topo } = this;
    let changed = false;
    const agents = C.agents.map((a, i) => {
      const d = decisions[i];
      if (!d.decided || rt.acts(a) === 'never') return a;
      const pos = d.move !== 'stay' && topo.canMove(rt.topoState, a.pos, d.move) ? topo.target(a.pos, d.move) : a.pos;
      if (pos === a.pos && d.pub === a.pub && d.mem === a.mem) return a;
      changed = true;
      return { ...a, pos, pub: d.pub, mem: d.mem };
    });
    return changed ? { agents, world: C.world } : C;
  }
}

type Bound = { fn: RootFn; args: V[] };

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
  }
  return eff;
}

/**
 * The values of the experiment's parameters, for `check-all`: each domain
 * is evaluated with the earlier parameters fixed.
 */
export function* parameterValues(exp: Experiment): Generator<Record<string, V>> {
  const checked = check(exp);
  if (checked.errors.length) throw new IRError(checked.errors);
  const rt = new Runtime(checked.layout);
  const compiler = new Compiler(rt, checked.layout, new Map(exp.params.map(p => [p.name, p.type])));
  const defs = new Map((exp.model.defs ?? []).map(d => [d.name, d]));
  const size = compiler.root(exp.model.topology.size, [], defs);
  const domains = exp.params.map(p => p.domain && compiler.root(p.domain, [], defs));
  function* go(i: number, params: Record<string, V>): Generator<Record<string, V>> {
    if (i === exp.params.length) { yield { ...params }; return; }
    const domain = domains[i];
    if (!domain) throw new Error(`parameter ${exp.params[i].name} has no domain`);
    rt.params = params;
    try {
      rt.topo = makeTopology(exp, runDet(size, []));
    } catch {
      // The size depends on a later parameter: domains cannot use the topology yet.
    }
    for (const v of runDet(domain, []) as V[]) yield* go(i + 1, { ...params, [exp.params[i].name]: v });
  }
  yield* go(0, {});
}

const definitionCache = new WeakMap<Experiment, Map<string, (...args: V[]) => V>>();

/**
 * A definition of an experiment (`def f (x : T) : R := e` in `.sim`), as a function on values:
 * renderers and tests reuse the algorithm's own definitions. Deterministic definitions only.
 */
export function definition(exp: Experiment, name: string): (...args: V[]) => V {
  let cache = definitionCache.get(exp);
  if (!cache) definitionCache.set(exp, cache = new Map());
  let f = cache.get(name);
  if (!f) {
    const checked = check(exp);
    if (checked.errors.length) throw new IRError(checked.errors);
    const compiler = new Compiler(new Runtime(checked.layout), checked.layout, new Map(exp.params.map(p => [p.name, p.type])));
    const defs = new Map([...(exp.model.defs ?? []), ...(exp.algorithm.defs ?? []), ...(exp.task.defs ?? [])].map(d => [d.name, d]));
    const def = defs.get(name);
    if (!def) throw new Error(`${exp.name} has no definition ${name}`);
    const fn = compiler.root(def.body, def.params.map(p => [p.name, p.type]), defs);
    f = (...args: V[]) => runDet(fn, args);
    cache.set(name, f);
  }
  return f;
}
