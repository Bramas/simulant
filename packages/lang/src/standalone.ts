/**
 * Checks and resolves a component on its own, in the smallest experiment
 * that contains it. The Lean library is generated from components resolved
 * this way, independently of any model.
 */
import { check } from './check';
import type { Component, Experiment, Expr, Param, Type } from './ir';
import { IR_VERSION } from './ir';
import { resolveTypes } from './resolve';
import { T } from './types';

/** Experiment parameters read by the component's initial values (`site := param site`), with their types. */
function inputs(c: Component): Param[] {
  const found = new Map<string, Type>();
  const fields = [...(c.world ?? []), ...(c.agent ?? [])];
  for (const f of fields) {
    const init = c.init?.world?.[f.name] ?? c.init?.agent?.[f.name];
    if (init?.e === 'param') found.set(init.name, f.type);
  }
  return [...found].map(([name, type]) => ({ name, type }));
}

export function standaloneExperiment(c: Component): Experiment {
  const lit = (type: Type, value: unknown): Expr => ({ e: 'lit', type, value } as Expr);
  return {
    irVersion: IR_VERSION,
    name: `${c.name} alone`,
    model: {
      name: c.name,
      space: {
        kind: 'graph', name: 'Graphs.Cycle', params: [{ name: 'n', type: T.nat }], args: { n: { e: 'param', name: 'N' } }, vertex: T.nat,
        vertices: { e: 'call', fn: 'range', args: [{ e: 'var', name: 'n' }] },
        neighbors: { vertex: 'v', body: { e: 'call', fn: 'list', args: [{ e: 'var', name: 'v' }] } },
        automorphisms: { kind: 'computed' },
      },
      observation: { kind: 'radius', r: lit(T.nat, 1) }, frames: { kind: 'identity' },
      sensors: [], memory: 'persistent', movement: 'alongEdges', components: [c], symmetries: 'derived',
      scheduler: {
        name: 'FSync', events: [['look', 'compute', 'move']], fairness: 'none',
        schedule: { e: 'effect', activate: { e: 'call', fn: 'eligible', args: [{ e: 'var', name: 'C' }] } },
      },
    },
    algorithm: {
      name: 'idle', uses: [], pub: T.unit, mem: T.unit, init: { pub: lit(T.unit, null), mem: lit(T.unit, null) },
      step: { e: 'record', fields: { move: { e: 'call', fn: 'here', args: [] }, pub: { e: 'var', name: 'pub' }, mem: { e: 'var', name: 'mem' } } },
    },
    task: { name: 'none', goal: 'safety', verdict: lit(T.verdict, 'inProgress') },
    params: [{ name: 'N', type: T.nat }, ...inputs(c)],
    agents: { count: lit(T.nat, 1), pos: { e: 'call', fn: 'pos', args: [lit(T.nat, 0)] } },
  };
}

export function resolveComponent(c: Component): Component {
  const exp = standaloneExperiment(c);
  const checked = check(exp);
  if (checked.errors.length) throw new Error(`${c.name}:\n${checked.errors.join('\n')}`);
  return resolveTypes(exp, checked.resolutions).model.components[0];
}
