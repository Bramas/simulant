/**
 * Hand-written builder schedulers for conformance and unit tests.
 * Project simulations and Lean generation use ../../sim/schedulers.sim; see ../../README.md.
 */
import { choose, concat, effect, eligible, let_, nonemptySubsets, scheduler, show, type X } from '@bramas/simulant-lang/builder';
import type { Scheduler } from '@bramas/simulant-lang/ir';

export const Schedulers: Record<'FSync' | 'SSync' | 'Sequential', Scheduler> = {
  /** Every agent able to act, every step: fully synchronous. */
  FSync: scheduler({
    name: 'FSync', fairness: 'none',
    schedule: C => effect({ activate: eligible(C) }),
    equivariant: true,
  }),
  /** A nonempty set of agents, chosen by the adversary at each step: semi-synchronous. */
  SSync: scheduler({
    name: 'SSync',
    schedule: C => let_('S', choose('SSync.S', nonemptySubsets(eligible(C)), { label: S => concat('activates ', show(S)) }),
      S => effect({ activate: S })),
    equivariant: true,
  }),
  /** One agent per step, chosen by the adversary. */
  Sequential: scheduler({
    name: 'Sequential',
    schedule: C => let_('a', choose('Sequential.a', eligible(C), { label: a => concat('activates ', show(a)) }),
      a => effect({ activate: (b: X) => b.eq(a) })),
    equivariant: true,
  }),
};
