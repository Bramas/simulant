/**
 * Hand-written builder schedulers for conformance and unit tests.
 * Project simulations and Lean generation use ../../sim/schedulers.sim; see ../../README.md.
 */
import {
  and, choose, concat, effect, eligible, ite, let_, lit, nonemptySubsets, or, rec, scheduler, show, type X,
} from '@bramas/simulant-lang/builder';
import type { Instant, Scheduler } from '@bramas/simulant-lang/ir';
import { T } from '@bramas/simulant-lang/types';

const activates = (S: X) => concat('activates ', show(S));

export const Schedulers = {
  /** Every agent able to act, every step: fully synchronous. */
  FSync: scheduler({
    name: 'FSync', fairness: 'none',
    schedule: C => effect({ activate: eligible(C) }),
    equivariant: true,
  }),
  /** A nonempty set of agents, chosen by the adversary at each step: semi-synchronous. */
  SSync: scheduler({
    name: 'SSync',
    schedule: C => let_('S', choose('SSync.S', nonemptySubsets(eligible(C)), { label: activates }),
      S => effect({ activate: S })),
    equivariant: true,
  }),
  /** One agent per step, chosen by the adversary. */
  Sequential: scheduler({
    name: 'Sequential',
    schedule: C => let_('a', choose('Sequential.a', eligible(C), { label: activates }),
      a => effect({ activate: (b: X) => b.eq(a) })),
    equivariant: true,
  }),
  /** Asynchronous agents: a nonempty set takes its next event at each step; `events` cuts the cycle. */
  Async: (events: Instant[][] = [['look'], ['compute'], ['move']]) => scheduler({
    name: 'Async', events,
    schedule: C => let_('S', choose('Async.S', nonemptySubsets(eligible(C)), { label: activates }), S => effect({ activate: S })),
    equivariant: true,
  }),
  /** A nonempty set at each step, such that each agent takes an event at least once every `k` steps. */
  Bounded: (k: number) => scheduler({
    name: 'Bounded', params: { k: T.nat }, args: { k },
    agent: { waited: T.nat }, init: { agent: { waited: () => lit(T.nat, 0) } }, fairness: 'none',
    schedule: (C, p) => let_('S', choose('Bounded.S',
      nonemptySubsets(eligible(C)).filter((S: X) => eligible(C).all(a => or(a.waited.add(1).lt(p.k), S.has(a)))),
      { label: activates }), S => effect({
      activate: S,
      agents: a => rec({ waited: ite(or(S.has(a), eligible(C).has(a).not()), lit(T.nat, 0), a.waited.add(1)) }),
    })),
    equivariant: true,
  }),
  /** One agent at a time, in passes in which every agent able to act takes one event, in an order chosen for each pass. */
  Permutation: scheduler({
    name: 'Permutation', agent: { done: T.bool }, init: { agent: { done: () => lit(T.bool, false) } }, fairness: 'none',
    schedule: C => let_('left', eligible(C).filter(a => a.done.not()), left =>
      let_('a', choose('Permutation.a', ite(left.isEmpty(), eligible(C), left), { label: activates }), a => effect({
        activate: (b: X) => b.eq(a),
        agents: b => rec({ done: or(b.eq(a), and(left.isEmpty().not(), b.done)) }),
      }))),
    equivariant: true,
  }),
} satisfies Record<string, Scheduler | ((...args: never[]) => Scheduler)>;
