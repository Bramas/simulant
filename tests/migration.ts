/**
 * Comparison of a migrated black-hole-search algorithm with the TypeScript simulation it replaced
 * (plan, Phases 4 and 7). What the old engine showed was recorded before its removal, in
 * `projects/black-hole-search/fixtures/migration/`: the configurations it reached, and random
 * executions. The old model let the hole activate only when an agent
 * stepped on it; the new one also while the site is empty. So the recorded configurations are
 * reachable in the new model, and equal to those of the new one when activations that nobody
 * observes are deferred (an exploration reduction, not a model change).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Experiment } from '@bramas/simulant-lang/ir';
import { System, type AgentV, type Config } from '@bramas/simulant-engine/system';
import { projects } from '../projects/black-hole-search/src/projects';

/** Hole active, each living agent's id, position and claim, and other world state (pebbles). */
export type View = string;
const view = (active: boolean, agents: [number, number, unknown][], world?: unknown): View =>
  JSON.stringify([active, agents.sort((x, y) => x[0] - y[0]), ...(world === undefined ? [] : [world])]);
/** A claimed port as a direction: `Port.cw` (0) is +1, `Port.ccw` (1) is -1. */
const direction = (port: number | null) => port === 0 ? 1 : port === 1 ? -1 : null;

/**
 * How an agent's claim is shown (by default `bh`, a port, as a direction: +1 clockwise, -1
 * counterclockwise), and, with `pebbles`, the nodes that hold a pebble. The recorded views show
 * claims the same way.
 */
export type Claims = { claim?: (agent: AgentV, N: number) => unknown; pebbles?: boolean };
const pebbles = (C: Config) => [...new Set<number>(C.world.pebbles)].sort((a, b) => a - b);

/** The view of a configuration of the new engine (public `id`). */
export const newView = (C: Config, claims: Claims = {}, N = 0): View =>
  view(C.world.active, C.agents.filter(a => !a.f.dead).map(a => [a.pub.id, a.pos, (claims.claim ?? (({ pub }) => direction(pub.bh)))(a, N)]), claims.pebbles ? pebbles(C) : undefined);

/** How each migrated algorithm encodes claims, when it differs from the default. */
export function claimsOf(simulation: string): Claims {
  const signed: Claims['claim'] = ({ pub }) => pub.bhPort === null ? null : direction(pub.bhPort)! * pub.bhSteps;
  switch (simulation) {
    // The claimed node.
    case 'black-hole-search-algo0':
      return { claim: ({ pos, pub }, N) => pub.bhPort === null ? null : (pos + N + direction(pub.bhPort)! * pub.bhSteps) % N };
    case 'black-hole-search-algo2': case 'black-hole-search-algo6': return { pebbles: true };
    case 'black-hole-search-algo4': return { claim: signed };
    // The suspected node, in the agents' common coordinates.
    case 'black-hole-search-algo5': return { claim: ({ pub }) => pub.bh };
    default: return {};
  }
}

/** What the old engine showed of one simulation. */
type Recorded = {
  /** `N,site,depth`: the views of the configurations reached within `depth` rounds. */
  reachable: Record<string, View[]>;
  /** `N,site`: random executions, as the view after each step. */
  runs: Record<string, { views: View[] }[]>;
};
const cache = new Map<string, Recorded>();
function recorded(simulation: string): Recorded {
  let r = cache.get(simulation);
  if (!r) {
    const file = new URL(`../projects/black-hole-search/fixtures/migration/${simulation.replace(/^black-hole-search-/, '')}.json`, import.meta.url);
    r = JSON.parse(readFileSync(file, 'utf8')) as Recorded;
    cache.set(simulation, r);
  }
  return r;
}

/** The views the old engine reached within `depth` rounds (recorded). */
export function oldReachable(simulation: string, N: number, site: number, depth: number): Set<View> {
  const views = recorded(simulation).reachable[`${N},${site},${depth}`];
  assert.ok(views, `${simulation}: nothing recorded for N = ${N}, site = ${site}, depth ${depth}`);
  return new Set(views);
}

export function newReachable(exp: Experiment, N: number, site: number, depth: number, deferUnobserved: boolean, claims: Claims = {}): Set<View> {
  const sys = new System(exp, { N, site });
  const seen = new Set<string>();
  const out = new Set<View>();
  let frontier = sys.initial().map(s => s.config);
  for (let d = 0; d <= depth; d++) {
    const next: Config[] = [];
    for (const C of frontier) {
      out.add(newView(C, claims, N));
      if (d === depth) continue;
      for (const s of sys.successors(C)) {
        if (deferUnobserved && !C.world.active && s.config.world.active && !s.config.agents.some(a => a.pos === site)) continue;
        if (!seen.has(s.key)) { seen.add(s.key); next.push(s.config); }
      }
    }
    frontier = next;
  }
  return out;
}

/** The new engine reaches the recorded configurations, up to `depth` rounds, on each setting. */
export function assertSameReachable(simulation: string, exp: Experiment, settings: [number, number][], depth: number, claims: Claims = {}) {
  for (const [N, site] of settings) {
    const old = oldReachable(simulation, N, site, depth);
    const all = newReachable(exp, N, site, depth, false, claims);
    const deferred = newReachable(exp, N, site, depth, true, claims);
    assert.deepEqual([...old].filter(v => !all.has(v)), [], `N = ${N}, site = ${site}: reached only by the old engine`);
    assert.deepEqual([...deferred].sort(), [...old].sort(), `N = ${N}, site = ${site}`);
  }
}

type Tree = { get(path: number[]): any; getChildrenCount(path: number[]): number };

/**
 * A path of the new engine whose configurations show the given views, step by step: the first
 * matching child is taken, with backtracking. Recorded paths of the old engine become paths of
 * the new one this way (presets too, see presets.test.ts).
 */
export function pathThrough(next: Tree, viewOf: (c: any) => View, views: View[]): number[] | null {
  if (!views.length || viewOf(next.get([0])) !== views[0]) return null;
  const search = (at: number[]): number[] | null => {
    if (at.length === views.length) return at;
    for (let i = 0; i < next.getChildrenCount(at); i++) {
      const child = [...at, i];
      if (viewOf(next.get(child)) !== views[at.length]) continue;
      const found = search(child);
      if (found) return found;
    }
    return null;
  };
  return search([0]);
}

/**
 * The new engine follows each recorded random execution of the old engine (`runs` of up to
 * `length` steps, from a seeded generator), configuration by configuration. `project` is a
 * registry name or a project (an experiment that is not registered).
 */
export function assertSameRuns(simulation: string, project: string | object, settings: [number, number][], runs = 10, length = 25, claims: Claims = {}) {
  const p: any = typeof project === 'string' ? (projects as any)[project] : project;
  for (const [N, site] of settings) {
    const recordedRuns = recorded(simulation).runs[`${N},${site}`];
    assert.equal(recordedRuns?.length, runs, `${simulation}: ${runs} runs not recorded for N = ${N}, site = ${site}`);
    const next = p.execute(p.setup({ N, site }));
    for (const run of recordedRuns) {
      assert.ok(run.views.length <= length + 1);
      const path = pathThrough(next, (s: any) => newView(s.config, claims, N), run.views);
      assert.ok(path, `N = ${N}, site = ${site}: no path through ${run.views.length} recorded views`);
    }
  }
}
