/**
 * Exploration of the state graph (plan, Sections 3.10 and 6.4).
 *
 * A reachable `failure` verdict is a counterexample. Liveness goals are
 * decided on the expanded part of the graph with strongly connected
 * components: under a synchronous round every cycle counts; under SSYNC a
 * cycle counts only if it is scheduler-fair, i.e. every agent that acts in
 * it is activated somewhere on it. Flags are never cleared, so which agents
 * act is the same in every state of a component.
 */
import type { Goal } from '@bramas/simulant-lang/ir';
import { Symmetry } from './symmetry';
import type { Choice, Config, Successor, System, Verdict } from './system';

export type ExploreOptions = {
  maxDepth?: number;
  maxStates?: number;
  /** Symmetry reduction (default: on, with the derived group). */
  symmetry?: boolean;
  /** Initial configurations (default: the system's); several settings can share one graph. */
  initial?: Successor[];
};

/** Cancellation and pacing of `runAsync`. */
export type AsyncOptions = {
  signal?: AbortSignal;
  /** Milliseconds of work between two returns to the event loop (default 50). */
  slice?: number;
};

export type State = {
  id: number;
  config: Config;
  key: string;
  depth: number;
  verdict: Verdict;
  /** BFS parent, for shortest counterexamples. */
  parent?: number;
  /** Successor ids; undefined while the state is not expanded. */
  succ?: number[];
  /** Per successor edge, the agents some witness activates (SSYNC only). */
  act?: Set<number>[];
};

export type Step = { state: number; config: Config; verdict: Verdict; witness: Choice[] };

export type Counterexample = {
  kind: 'failure' | 'lasso';
  /**
   * From an initial configuration. For a lasso, the last step returns to the
   * state of `steps[cycleStart]`: the steps after `cycleStart` repeat forever.
   */
  steps: Step[];
  cycleStart?: number;
  /** The index, in the initial configurations explored, of the one the steps start from. */
  initialIndex: number;
};

export type Result = {
  status: 'success' | 'failure' | 'incomplete';
  reason: string;
  counterexample?: Counterexample;
  stats: { states: number; expanded: number; edges: number; maxDepth: number; group: number };
};

export class Explorer {
  readonly states: State[] = [];
  readonly initial: number[] = [];
  /** A concrete configuration of each initial state, before symmetry reduction, and its index. */
  private readonly concreteInitial = new Map<number, { config: Config; index: number }>();
  private readonly index = new Map<string, number>();
  readonly symmetry: Symmetry;
  private readonly goal: Goal;
  private incomplete: string | undefined;
  private edges = 0;

  constructor(readonly system: System, readonly opts: ExploreOptions = {}) {
    this.symmetry = new Symmetry(system, { enabled: opts.symmetry !== false });
    this.goal = system.exp.task.goal;
  }

  private add(s: Successor, depth: number, parent?: number): number {
    const rep = this.symmetry.trivial ? s : this.symmetry.canonical(s.config, s.key);
    const known = this.index.get(rep.key);
    if (known !== undefined) return known;
    const id = this.states.length;
    this.states.push({ id, config: rep.config, key: rep.key, depth, verdict: this.system.verdict(rep.config), parent });
    this.index.set(rep.key, id);
    return id;
  }

  /** Whether the successors of a state matter for the goal. */
  private shouldExpand(s: State) {
    if (s.verdict === 'failure') return false;
    return !(this.goal === 'eventually' && s.verdict === 'success');
  }

  run(): Result {
    const work = this.work();
    for (;;) {
      const r = work.next();
      if (r.done) return r.value;
    }
  }

  /** As `run`, returning to the event loop regularly, so that work can be cancelled (watch mode). */
  async runAsync(opts: AsyncOptions = {}): Promise<Result> {
    const work = this.work();
    const slice = opts.slice ?? 50;
    const check = () => { if (opts.signal?.aborted) throw opts.signal.reason ?? new Error('aborted'); };
    check();
    for (let start = Date.now(); ;) {
      const r = work.next();
      if (r.done) return r.value;
      check();
      if (Date.now() - start >= slice) {
        await new Promise(resolve => setImmediate(resolve));
        check();
        start = Date.now();
      }
    }
  }

  /** The exploration, yielding every few hundred expanded states. */
  private *work(): Generator<void, Result> {
    const { system, opts } = this;
    const maxDepth = opts.maxDepth ?? Infinity;
    const maxStates = opts.maxStates ?? Infinity;
    (opts.initial ?? system.initial()).forEach((s, index) => {
      const id = this.add(s, 0);
      if (!this.concreteInitial.has(id)) {
        this.initial.push(id);
        this.concreteInitial.set(id, { config: s.config, index });
      }
    });
    const ssync = system.exp.model.round === 'ssync';
    for (let cursor = 0; cursor < this.states.length; cursor++) {
      if ((cursor & 255) === 255) yield;
      const s = this.states[cursor];
      if (s.verdict === 'failure') {
        return this.result('failure', 'a reachable configuration fails the task', this.counterexample('failure', this.pathIds(s.id)));
      }
      if (!this.shouldExpand(s)) continue;
      if (s.depth >= maxDepth) { this.incomplete ??= `depth limit ${maxDepth} reached`; continue; }
      if (this.states.length >= maxStates) { this.incomplete ??= `state limit ${maxStates} reached`; break; }
      const succ: number[] = [];
      const act: Set<number>[] = [];
      const successorIndex = new Map<number, number>();
      for (const t of system.successors(s.config)) {
        const id = this.add(t, s.depth + 1, s.id);
        const at = successorIndex.get(id);
        if (at === undefined) {
          successorIndex.set(id, succ.length);
          succ.push(id); act.push(new Set(t.activated));
        } else if (ssync) for (const i of t.activated) act[at].add(i);
      }
      s.succ = succ;
      if (ssync) s.act = act;
      this.edges += succ.length;
    }
    const lasso = this.goal === 'safety' ? undefined : this.findLasso(ssync);
    if (lasso) return this.result('failure', `an execution never satisfies "${this.goal}"`, lasso);
    if (this.incomplete) return this.result('incomplete', this.incomplete);
    return this.result('success', 'every admissible execution satisfies the task');
  }

  private result(status: Result['status'], reason: string, counterexample?: Counterexample): Result {
    return {
      status, reason, counterexample,
      stats: {
        states: this.states.length,
        expanded: this.states.filter(s => s.succ).length,
        edges: this.edges,
        maxDepth: this.states.reduce((m, s) => Math.max(m, s.depth), 0),
        group: this.symmetry.group.length,
      },
    };
  }

  /** States that may lie on a bad cycle. */
  private inGraph(s: State) {
    if (!s.succ) return false;
    return this.goal === 'eventually' ? s.verdict !== 'success' : true;
  }

  private findLasso(ssync: boolean): Counterexample | undefined {
    for (const scc of this.sccs()) {
      const members = new Set(scc);
      const inside = (u: number) => this.states[u].succ!.map((v, j) => [v, j] as const).filter(([v]) => members.has(v));
      const nontrivial = scc.length > 1 || inside(scc[0]).some(([v]) => v === scc[0]);
      if (!nontrivial) continue;
      // The bad state the cycle must visit.
      const bad = this.goal === 'eventually' ? scc[0] : scc.find(u => this.states[u].verdict !== 'success');
      if (bad === undefined) continue;
      // Scheduler fairness: every acting agent is activated on some edge of the component.
      const needed: [number, number][] = [];
      if (ssync) {
        const C = this.states[scc[0]].config;
        const acting = C.agents.flatMap((a, i) => this.system.rt.acts(a) === 'never' ? [] : [i]);
        let fair = true;
        for (const agent of acting) {
          const edge = scc.flatMap(u => inside(u).filter(([, j]) => this.states[u].act![j].has(agent)).map(([v]) => [u, v] as [number, number]))[0];
          if (!edge) { fair = false; break; }
          needed.push(edge);
        }
        if (!fair) continue;
      }
      return this.lasso(bad, members, needed);
    }
  }

  /** Tarjan's algorithm, iteratively, on the states of `inGraph`. */
  private sccs(): number[][] {
    const n = this.states.length;
    const index = new Int32Array(n).fill(-1);
    const low = new Int32Array(n);
    const onStack = new Uint8Array(n);
    const stack: number[] = [];
    const out: number[][] = [];
    let counter = 0;
    for (const root of this.states) {
      if (!this.inGraph(root) || index[root.id] >= 0) continue;
      const work: [number, number][] = [[root.id, 0]];
      index[root.id] = low[root.id] = counter++;
      stack.push(root.id); onStack[root.id] = 1;
      while (work.length) {
        const top = work[work.length - 1];
        const [u, i] = top;
        const succ = this.states[u].succ!;
        if (i < succ.length) {
          top[1]++;
          const v = succ[i];
          if (!this.inGraph(this.states[v])) continue;
          if (index[v] < 0) {
            index[v] = low[v] = counter++;
            stack.push(v); onStack[v] = 1;
            work.push([v, 0]);
          } else if (onStack[v]) {
            low[u] = Math.min(low[u], index[v]);
          }
        } else {
          work.pop();
          if (work.length) { const p = work[work.length - 1][0]; low[p] = Math.min(low[p], low[u]); }
          if (low[u] === index[u]) {
            const scc: number[] = [];
            let w: number;
            do { w = stack.pop()!; onStack[w] = 0; scc.push(w); } while (w !== u);
            out.push(scc);
          }
        }
      }
    }
    return out;
  }

  /** A shortest path inside `members` from `from` to `to` (at least one step when from === to). */
  private route(from: number, to: number, members: Set<number>): number[] {
    const prev = new Map<number, number>();
    const queue = [from];
    for (let c = 0; c < queue.length; c++) {
      const u = queue[c];
      for (const v of this.states[u].succ!) {
        if (!members.has(v) || prev.has(v)) continue;
        prev.set(v, u);
        if (v === to) {
          const path = [v];
          let w = u;
          while (w !== from) { path.push(w); w = prev.get(w)!; }
          return path.reverse();
        }
        queue.push(v);
      }
    }
    throw new Error('no route inside a strongly connected component');
  }

  private lasso(bad: number, members: Set<number>, needed: [number, number][]): Counterexample {
    const prefix = this.pathIds(bad);
    const cycle: number[] = [];
    let at = bad;
    for (const [u, v] of needed) {
      if (u !== at) cycle.push(...this.route(at, u, members));
      cycle.push(v);
      at = v;
    }
    if (at !== bad || !cycle.length) cycle.push(...this.route(at, bad, members));
    // The cycle ends at `bad`, which is the start of the loop.
    const ids = [...prefix, ...cycle.slice(0, -1)];
    return { ...this.counterexample('lasso', ids, cycle.length ? bad : undefined), cycleStart: prefix.length - 1 };
  }

  private counterexample(kind: Counterexample['kind'], ids: number[], loopTo?: number): Counterexample {
    return { kind, steps: this.steps(ids, loopTo), initialIndex: this.concreteInitial.get(ids[0])!.index };
  }

  private pathIds(id: number): number[] {
    const ids = [id];
    while (this.states[ids[0]].parent !== undefined) ids.unshift(this.states[ids[0]].parent!);
    return ids;
  }

  /** The key of the state that stores a configuration (its orbit's representative). */
  private repKey(t: Successor) {
    return this.symmetry.trivial ? t.key : this.symmetry.canonical(t.config, t.key).key;
  }

  /**
   * Steps along stored states, replayed concretely: each configuration is the
   * successor of the previous concrete one that the stored state represents,
   * so that a path does not jump around the ring.
   */
  private steps(ids: number[], loopTo?: number): Step[] {
    let concrete = this.concreteInitial.get(ids[0])!.config;
    const steps: Step[] = [{ state: ids[0], config: concrete, verdict: this.states[ids[0]].verdict, witness: [] }];
    const follow = (to: number) => {
      const target = this.states[to].key;
      const t = this.system.successors(concrete).find(t => this.repKey(t) === target);
      if (!t) throw new Error('edge not found');
      concrete = t.config;
      steps.push({ state: to, config: t.config, verdict: this.states[to].verdict, witness: t.witness });
    };
    for (const id of ids.slice(1)) follow(id);
    if (loopTo !== undefined) follow(loopTo);
    return steps;
  }
}

export function explore(system: System, opts: ExploreOptions = {}): Result {
  return new Explorer(system, opts).run();
}
