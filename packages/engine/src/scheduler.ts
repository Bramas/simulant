/**
 * Schedulers (docs/scheduler-design.md): how an agent's Look-Compute-Move cycle is cut into
 * atomic events, which agents take their next event at each step, and which executions are
 * admissible.
 */
import type { Model } from '@bramas/simulant-lang/ir';
import type { Choice, Config, Effect } from './compile';

export type Instant = 'look' | 'compute' | 'move';

/** `activation`: every agent that acts forever takes events infinitely often; `none`: every execution. */
export type Fairness = 'activation' | 'none';

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

/** FSYNC: all eligible agents; SSYNC: any nonempty subset; sequential: any singleton. */
export function roundScheduler(round: Model['round']): SchedulerRuntime {
  if (round === 'fsync') {
    return { events: ATOMIC, fairness: 'none', anonymous: true, schedule: (_C, eligible, _w, k) => k(eligible) };
  }
  const maxSize = round === 'sequential' ? 1 : Infinity;
  return {
    events: ATOMIC, fairness: 'activation', anonymous: false,
    schedule: (_C, eligible, w, k) => {
      if (eligible.length === 0) return k(eligible);
      let index = 0;
      for (const S of subsets(eligible, Math.min(maxSize, eligible.length))) {
        w.push({ site: 'activation', index: index++, label: `activates ${S.map(i => `a${i}`).join(', ')}` });
        k(S);
        w.pop();
      }
    },
  };
}

/** Nonempty subsets of at most `max` elements, smallest first, each in lexicographic order. */
function* subsets(xs: number[], max: number): Generator<number[]> {
  for (let size = 1; size <= max; size++) {
    const current: number[] = [];
    function* pick(from: number): Generator<number[]> {
      if (current.length === size) { yield current.slice(); return; }
      for (let i = from; i < xs.length; i++) {
        current.push(xs[i]);
        yield* pick(i + 1);
        current.pop();
      }
    }
    yield* pick(0);
  }
}
