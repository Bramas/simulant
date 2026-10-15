/**
 * Checks of experiments, for the CLI and the UI (plan, Phase 6).
 *
 * `checkSettings` explores many settings at once: settings with the same ring
 * size share one state graph. This is sound because parameters reach only
 * the initialisation and the topology size (the checker enforces it), so the
 * transition relation is the same for every setting of a size; a
 * counterexample starts from the initial configuration of one setting, which
 * is reported with it. Initial configurations equal up to the symmetry group
 * merge, which is the enumeration "up to the group" of plan Section 3.11.
 *
 * A counterexample is also given as a path of the execution adapter
 * (`packages/simulator-ui/src/sim/execution.ts`): the first index chooses an
 * initial configuration of the setting, each further index a successor, in
 * the order of `System.successors`. With the setting, it replays in the UI.
 */
import type { Experiment } from '@bramas/simulant-lang/ir';
import { Explorer, type AsyncOptions, type Counterexample, type Result } from './explorer';
import { System, type Config, type Successor, type SystemOptions, type Verdict } from './system';
import type { V } from './values';

export type CheckLimits = {
  maxDepth?: number;
  maxStates?: number;
  symmetry?: boolean;
  /** Options of the systems built (native steps). */
  system?: SystemOptions;
};

export type Trace = {
  kind: Counterexample['kind'];
  settings: Record<string, V>;
  /** A path of the execution adapter, from the setting's initial configurations. */
  path: number[];
  /**
   * For a lasso: the index (in `path` and `steps`) of the configuration the last step returns to,
   * up to the symmetry group; the steps after it repeat forever.
   */
  cycleStart?: number;
  steps: { config: Config; verdict: Verdict; label: string }[];
};

export type CheckResult = {
  status: Result['status'];
  reason: string;
  stats: Result['stats'];
  trace?: Trace;
};

export type CheckAllResult = CheckResult & {
  /** Settings checked, and state graphs explored (one per ring size when shared). */
  settings: number;
  graphs: number;
};

const run = (explorer: Explorer, async?: AsyncOptions) => async ? explorer.runAsync(async) : Promise.resolve(explorer.run());

/** The experiment's own limits (`limits := { depth, states }`), unless the caller gives others. */
export function withExperimentLimits<L extends CheckLimits>(exp: Experiment, limits: L): L {
  return { ...limits, maxDepth: limits.maxDepth ?? exp.limits?.depth, maxStates: limits.maxStates ?? exp.limits?.states };
}

/** The adapter path of a counterexample whose first configuration is `initial[initialIndex]`. */
export function tracePath(system: System, cx: Counterexample, settings: Record<string, V>, initialIndex: number): Trace {
  const path = [initialIndex];
  for (let i = 1; i < cx.steps.length; i++) {
    const key = system.key(cx.steps[i].config);
    const index = system.successors(cx.steps[i - 1].config).findIndex(t => t.key === key);
    if (index < 0) throw new Error('tracePath: a step of the counterexample is not a successor');
    path.push(index);
  }
  return {
    kind: cx.kind, settings, path, cycleStart: cx.cycleStart,
    steps: cx.steps.map(s => ({ config: s.config, verdict: s.verdict, label: s.witness.map(c => c.label).join('; ') })),
  };
}

/** Checks one setting. */
export async function checkSetting(exp: Experiment, settings: Record<string, V>, limits: CheckLimits = {}, async?: AsyncOptions): Promise<CheckResult> {
  limits = withExperimentLimits(exp, limits);
  const system = new System(exp, settings, limits.system);
  const r = await run(new Explorer(system, limits), async);
  return { ...r, trace: r.counterexample && tracePath(system, r.counterexample, settings, r.counterexample.initialIndex) };
}

/**
 * Checks every setting, sharing a state graph between settings of the same ring size
 * (`shared: false` explores each setting alone). Stops at the first failure.
 */
export async function checkSettings(
  exp: Experiment, settings: Iterable<Record<string, V>>,
  limits: CheckLimits & { shared?: boolean; maxConfigs?: number } = {}, async?: AsyncOptions,
  onProgress?: (done: number, total: number) => void,
): Promise<CheckAllResult> {
  limits = withExperimentLimits(exp, limits);
  const all: Record<string, V>[] = [];
  const maxConfigs = limits.maxConfigs ?? Infinity;
  if (maxConfigs > 0) {
    for (const setting of settings) {
      all.push(setting);
      if (all.length >= maxConfigs) break;
    }
  }
  const stats: Result['stats'] = { states: 0, expanded: 0, edges: 0, maxDepth: 0, group: 0 };
  const add = (s: Result['stats']) => {
    stats.states += s.states; stats.expanded += s.expanded; stats.edges += s.edges;
    stats.maxDepth = Math.max(stats.maxDepth, s.maxDepth); stats.group = Math.max(stats.group, s.group);
  };
  let incomplete: string | undefined;
  let graphs = 0;
  const groups: Record<string, V>[][] = [];
  if (limits.shared === false) {
    for (const s of all) groups.push([s]);
  } else if (all.length) {
    const sizer = new System(exp, all[0], limits.system);
    const bySize = new Map<number, Record<string, V>[]>();
    for (const s of all) {
      const size = sizer.sizeWith(s);
      const group = bySize.get(size);
      if (group) group.push(s);
      else bySize.set(size, [s]);
    }
    for (const group of bySize.values()) groups.push(group);
  }
  let done = 0;
  for (const group of groups) {
    const system = new System(exp, group[0], limits.system);
    // Each initial configuration, with the setting it comes from and its index there.
    const initial: Successor[] = [];
    const origin: { settings: Record<string, V>; index: number }[] = [];
    for (const s of group) {
      system.initialWith(s).forEach((t, index) => { initial.push(t); origin.push({ settings: s, index }); });
    }
    const r = await run(new Explorer(system, { ...limits, initial }), async);
    graphs++;
    add(r.stats);
    done += group.length;
    onProgress?.(done, all.length);
    if (r.status === 'failure') {
      const at = origin[r.counterexample!.initialIndex];
      return { status: 'failure', reason: r.reason, stats, settings: all.length, graphs, trace: tracePath(system, r.counterexample!, at.settings, at.index) };
    }
    if (r.status === 'incomplete') incomplete ??= group.length > 1 ? `${r.reason} (settings of size ${system.topo.size})` : `${r.reason} (${JSON.stringify(group[0])})`;
  }
  if (incomplete) return { status: 'incomplete', reason: incomplete, stats, settings: all.length, graphs };
  return { status: 'success', reason: 'every admissible execution of every setting satisfies the task', stats, settings: all.length, graphs };
}

/**
 * Follows the first successor at each step until the verdict decides the goal on this single
 * execution: a failure, a success under `eventually`, or a repeated configuration (the execution
 * is then a lasso, judged by the goal on its cycle). For `simulant check`, a quick smoke test.
 */
export function checkFirstBranch(exp: Experiment, settings: Record<string, V>, limits: CheckLimits = {}): CheckResult {
  limits = withExperimentLimits(exp, limits);
  const system = new System(exp, settings, limits.system);
  const goal = exp.task.goal;
  const first = system.initial()[0];
  const steps = [{ config: first.config, verdict: system.verdict(first.config), label: '' }];
  const path = [0];
  const seen = new Map<string, number>([[first.key, 0]]);
  const maxDepth = limits.maxDepth ?? Infinity;
  const stats = () => ({ states: steps.length, expanded: steps.length - 1, edges: steps.length - 1, maxDepth: steps.length - 1, group: 1 });
  const trace = (kind: Trace['kind'], cycleStart?: number): Trace => ({ kind, settings, path: [...path], cycleStart, steps: [...steps] });
  for (;;) {
    const last = steps[steps.length - 1];
    if (last.verdict === 'failure') return { status: 'failure', reason: 'the first branch reaches a failing configuration', stats: stats(), trace: trace('failure') };
    if (goal === 'eventually' && last.verdict === 'success') return { status: 'success', reason: 'the first branch reaches a success', stats: stats() };
    if (steps.length - 1 >= maxDepth) return { status: 'incomplete', reason: `depth limit ${maxDepth} reached`, stats: stats() };
    const next = system.successors(last.config)[0];
    if (!next) return { status: 'incomplete', reason: 'the first branch ends in a configuration without successor', stats: stats() };
    path.push(0);
    steps.push({ config: next.config, verdict: system.verdict(next.config), label: next.witness.map(c => c.label).join('; ') });
    const again = seen.get(next.key);
    if (again === undefined) { seen.set(next.key, steps.length - 1); continue; }
    // A lasso: the steps from `again` repeat forever.
    const cycle = steps.slice(again, -1);
    const ok = goal === 'safety' || (goal === 'eventually' ? false : cycle.every(s => s.verdict === 'success'));
    return ok
      ? { status: 'success', reason: 'the first branch repeats a cycle that satisfies the goal', stats: stats() }
      : { status: 'failure', reason: `the first branch repeats a cycle that never satisfies "${goal}"`, stats: stats(), trace: trace('lasso', again) };
  }
}

export type StateGraph = {
  states: { id: number; config: Config; verdict: Verdict; depth: number }[];
  edges: { from: number; to: number; label: string }[];
  complete: boolean;
};

/** The explored state graph of a setting (concrete states, no symmetry reduction), for drawing. */
export function stateGraph(exp: Experiment, settings: Record<string, V>, limits: CheckLimits = {}): StateGraph {
  limits = withExperimentLimits(exp, limits);
  const system = new System(exp, settings, limits.system);
  const explorer = new Explorer(system, { ...limits, symmetry: false });
  const r = explorer.run();
  const ids = new Map(explorer.states.map(s => [s.key, s.id]));
  const edges: StateGraph['edges'] = [];
  for (const s of explorer.states) {
    if (!s.succ) continue;
    for (const t of system.successors(s.config)) {
      const to = ids.get(t.key);
      if (to !== undefined) edges.push({ from: s.id, to, label: t.witness.map(c => c.label).join('; ') });
    }
  }
  return {
    states: explorer.states.map(s => ({ id: s.id, config: s.config, verdict: s.verdict, depth: s.depth })),
    edges, complete: r.status !== 'incomplete',
  };
}
