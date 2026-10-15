/**
 * IR conformance fixtures (plan, Section 6.1): an experiment's IR, its
 * parameters, and the beginning of its unreduced state graph in BFS order,
 * with each edge's witness. Any interpreter of the IR must reproduce them.
 */
import type { Experiment } from '@bramas/simulant-lang/ir';
import { Explorer } from './explorer';
import { System, type Config } from './system';
import type { V } from './values';

export type ConformanceFixture = {
  name: string;
  experiment: Experiment;
  params: Record<string, V>;
  maxStates: number;
  states: { config: Config; verdict: string }[];
  /** Edges of the expanded states, in successor order. */
  edges: { from: number; to: number; witness: string[]; activated: number[] }[];
};

export function conformanceGraph(name: string, experiment: Experiment, params: Record<string, V>, maxStates = 40): ConformanceFixture {
  const system = new System(experiment, params);
  const explorer = new Explorer(system, { symmetry: false, maxStates });
  explorer.run();
  const ids = new Map(explorer.states.map(s => [s.key, s.id]));
  const edges: ConformanceFixture['edges'] = [];
  for (const s of explorer.states) {
    if (!s.succ) continue;
    for (const t of system.successors(s.config)) {
      edges.push({ from: s.id, to: ids.get(t.key)!, witness: t.witness.map(w => w.label), activated: [...t.activated].sort() });
    }
  }
  return {
    name, experiment, params, maxStates,
    states: explorer.states.map(s => ({ config: { agents: s.config.agents, world: s.config.world }, verdict: s.verdict })),
    edges,
  };
}
