/**
 * Checks and resolves a component or a scheduler on its own, in the smallest
 * experiment that contains it. The Lean library is generated from pieces resolved
 * this way, independently of any model.
 */
import { check } from './check';
import type { Component, Experiment, Expr, Param, Scheduler, Type } from './ir';
import { IR_VERSION } from './ir';
import { resolveTypes } from './resolve';
import { T } from './types';

/** Experiment parameters read by the piece's initial values (`site := param site`), with their types. */
function inputs(c: Pick<Component, 'world' | 'agent' | 'init'>): Param[] {
  const found = new Map<string, Type>();
  const fields = [...(c.world ?? []), ...(c.agent ?? [])];
  for (const f of fields) {
    const init = c.init?.world?.[f.name] ?? c.init?.agent?.[f.name];
    if (init?.e === 'param') found.set(init.name, f.type);
  }
  return [...found].map(([name, type]) => ({ name, type }));
}

const FSYNC: Scheduler = {
  name: 'FSync', events: [['look', 'compute', 'move']], fairness: 'none',
  schedule: { e: 'effect', activate: { e: 'call', fn: 'eligible', args: [{ e: 'var', name: 'C' }] } },
};

/** The smallest experiment with component `c` (if any) and scheduler `sc` (FSYNC by default). */
export function standaloneExperiment(c: Component | undefined, sc: Scheduler = FSYNC): Experiment {
  const name = c?.name ?? sc.name;
  const lit = (type: Type, value: unknown): Expr => ({ e: 'lit', type, value } as Expr);
  return {
    irVersion: IR_VERSION,
    name: `${name} alone`,
    model: {
      name,
      space: {
        kind: 'graph', name: 'Graphs.Cycle', params: [{ name: 'n', type: T.nat }], args: { n: { e: 'param', name: 'N' } }, vertex: T.nat,
        vertices: { e: 'call', fn: 'range', args: [{ e: 'var', name: 'n' }] },
        neighbors: { vertex: 'v', body: { e: 'call', fn: 'list', args: [{ e: 'var', name: 'v' }] } },
        automorphisms: { kind: 'computed' },
      },
      observation: { kind: 'radius', r: lit(T.nat, 1) }, frames: { kind: 'identity' },
      sensors: [], memory: 'persistent', movement: 'alongEdges', components: c ? [c] : [], symmetries: 'derived', scheduler: sc,
    },
    algorithm: {
      name: 'idle', uses: [], pub: T.unit, mem: T.unit, init: { pub: lit(T.unit, null), mem: lit(T.unit, null) },
      step: { e: 'record', fields: { move: { e: 'call', fn: 'here', args: [] }, pub: { e: 'var', name: 'pub' }, mem: { e: 'var', name: 'mem' } } },
    },
    task: { name: 'none', goal: 'safety', verdict: lit(T.verdict, 'inProgress') },
    params: [{ name: 'N', type: T.nat }, ...(c ? inputs(c) : []), ...inputs(sc)],
    agents: { count: lit(T.nat, 1), pos: { e: 'call', fn: 'pos', args: [lit(T.nat, 0)] } },
  };
}

export function resolveComponent(c: Component): Component {
  const exp = standaloneExperiment(c);
  const checked = check(exp);
  if (checked.errors.length) throw new Error(`${c.name}:\n${checked.errors.join('\n')}`);
  return resolveTypes(exp, checked.resolutions).model.components[0];
}

export function resolveScheduler(sc: Scheduler): Scheduler {
  const exp = standaloneExperiment(undefined, sc);
  const checked = check(exp);
  if (checked.errors.length) throw new Error(`${sc.name}:\n${checked.errors.join('\n')}`);
  return resolveTypes(exp, checked.resolutions).model.scheduler;
}
