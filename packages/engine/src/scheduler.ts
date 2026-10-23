/**
 * Schedulers (docs/scheduler-design.md): how an agent's Look-Compute-Move cycle is cut into
 * atomic events, which agents take their next event at each step, and which executions are
 * admissible.
 */
import type { Fairness, Instant } from '@bramas/simulant-lang/ir';
import type { Choice, Config, Effect } from './compile';

export type { Fairness, Instant };

export type SchedulerRuntime = {
  /** The events of a cycle, each a set of instants, in order. */
  events: Instant[][];
  fairness: Fairness;
  /** Whether configurations that differ by a permutation of agents may be merged. */
  anonymous: boolean;
  /**
   * Calls `k` once per choice of the agents that take their next event (indices in `C`), with the
   * scheduler's own effect, and with the choice pushed on `witness` while `k` runs.
   */
  schedule(C: Config, eligible: number[], witness: Choice[], k: (active: number[], eff?: Effect) => void): void;
};

export const ATOMIC: Instant[][] = [['look', 'compute', 'move']];
