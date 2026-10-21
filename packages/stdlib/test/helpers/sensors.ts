/**
 * Hand-written builder sensors for conformance and unit tests.
 * Project simulations and Lean generation use ../../sim/sensors.sim; see ../../README.md.
 */
import {
  and, choose, concat, ite, let_, locationSensor, occupants, present, range, sensor, show, str, subsetsUpTo, type X,
} from '@bramas/simulant-lang/builder';
import { T } from '@bramas/simulant-lang/types';

const seenHere = (L: X) => occupants(L, L.here).filter(b => and(b.ne(L.me), present(b))).map(b => b.pub);

/** Is someone at this location? (weak multiplicity) */
export const occupied = locationSensor('occupied', T.bool, ({ L, l }) => occupants(L, l).any(a => present(a)));

/** How many agents are at this location (strong multiplicity). */
export const count = locationSensor('count', T.nat, ({ L, l }) => occupants(L, l).count(a => present(a)));

/** The colors present at this location, in palette order. Needs `Storage.Lights`. */
export const colors = locationSensor('colors', T.list(T.nat), ({ L, l }) =>
  range(L.world.colorCount).filter(c => occupants(L, l).any(a => and(present(a), a.light.eq(c)))));

/** Public states of the other agents on my node. */
export const otherStates = sensor('otherStates', T.multiset(T.pub), ({ L }) => seenHere(L));

/** The adversary may hide up to `k` of the agents on my node (fixed for the Look). */
export const otherStatesLossy = (k: number) => sensor('otherStates', T.multiset(T.pub), ({ L }) =>
  let_('seen', seenHere(L), seen =>
    let_('hidden', choose('otherStatesLossy.hidden', subsetsUpTo(seen, k), {
      label: h => ite(h.isEmpty(), str('hides nobody'), concat('hides ', show(h))),
    }), hidden => seen.diff(hidden))));

/** Knowledge of the size of a finite space. */
export const spaceSize = sensor('spaceSize', T.nat, ({ L }) => L.spaceSize);
