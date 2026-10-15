/**
 * Topologies of the semantic core (plan, Section 3.6): nodes, moves, frames,
 * the per-round state chosen by the adversary, and the automorphisms.
 */
import type { Action, V } from './values';

export type Move = 'stay' | 'cw' | 'ccw';

export type Automorphism = Action & {
  label: string;
  /** Rotations keep orientation; reflections reverse it. */
  reflects: boolean;
  inverse: () => Automorphism;
};

export interface TopologyRuntime {
  readonly kind: string;
  readonly size: number;
  /** The states the adversary may choose at the start of a round; one state for a static topology. */
  states(): { state: V; label: string }[];
  /** The neighbour of `n` in global direction `m`. */
  target(n: number, m: Move): number;
  /** Whether the edge used by moving from `n` in direction `m` is present in `state`. */
  canMove(state: V, n: number, m: Move): boolean;
  /** The node seen at local offset `i` from `n`, in frame `f`. */
  offset(n: number, f: V, i: number): number;
  toGlobal(f: V, m: Move): Move;
  readonly frames: V[];
  readonly identityFrame: V;
  automorphisms(): Automorphism[];
}

const flip = (m: Move): Move => m === 'cw' ? 'ccw' : m === 'ccw' ? 'cw' : 'stay';

export function opposite(m: Move): Move {
  return flip(m);
}

export class Ring implements TopologyRuntime {
  readonly kind: string = 'ring';
  readonly frames = [false, true];
  readonly identityFrame = false;

  constructor(readonly size: number) {
    if (!Number.isInteger(size) || size < 2) throw new Error(`a ring needs at least 2 nodes, got ${size}`);
  }

  states(): { state: V; label: string }[] {
    return [{ state: null, label: '' }];
  }

  target(n: number, m: Move) {
    const N = this.size;
    return m === 'cw' ? (n + 1) % N : m === 'ccw' ? (n + N - 1) % N : n;
  }

  canMove(_state: V, _n: number, _m: Move) {
    return true;
  }

  offset(n: number, f: V, i: number) {
    const N = this.size;
    return f ? ((n - i) % N + N) % N : (n + i) % N;
  }

  toGlobal(f: V, m: Move): Move {
    return f ? flip(m) : m;
  }

  automorphisms(): Automorphism[] {
    const N = this.size;
    const make = (k: number, reflects: boolean): Automorphism => ({
      label: reflects ? `reflection ${k}` : `rotation ${k}`,
      reflects,
      node: reflects ? n => ((k - n) % N + N) % N : n => (n + k) % N,
      frame: reflects ? f => !f : f => f,
      inverse: () => reflects ? make(k, true) : make((N - k) % N, false),
    });
    return [...Array.from({ length: N }, (_, k) => make(k, false)), ...Array.from({ length: N }, (_, k) => make(k, true))];
  }
}

/**
 * A ring where, at the start of every round, the adversary removes up to `k`
 * edges. Edge `i` joins nodes `i` and `i + 1`. The state is the sorted list
 * of missing edges; it is not kept between rounds.
 */
export class DynamicRing extends Ring {
  readonly kind = 'dynamicRing';
  private readonly choices: { state: number[]; label: string }[];

  constructor(size: number, readonly k: number) {
    super(size);
    const N = size;
    const sets: number[][] = [[]];
    const extend = (from: number, current: number[]) => {
      for (let e = from; e < N; e++) {
        const next = [...current, e];
        if (next.length > k) continue;
        sets.push(next);
        extend(e + 1, next);
      }
    };
    extend(0, []);
    this.choices = sets.map(state => ({
      state,
      label: state.length ? `missing ${state.map(e => `u${e}–u${(e + 1) % N}`).join(', ')}` : 'all edges present',
    }));
  }

  states() {
    return this.choices;
  }

  canMove(state: number[], n: number, m: Move) {
    if (m === 'stay' || !state.length) return true;
    const edge = m === 'cw' ? n : (n + this.size - 1) % this.size;
    return !state.includes(edge);
  }
}
