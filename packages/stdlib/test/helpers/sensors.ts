/**
 * Hand-written builder sensors for conformance and unit tests.
 * Project simulations and Lean generation use ../../sim/sensors.sim; see ../../README.md.
 */
import {
  agents, and, choose, concat, ite, let_, ofFn, offset, present, sensor, show, size, str, subsetsUpTo, type X,
} from '@bramas/simulant-lang/builder';
import type { Equivariance } from '@bramas/simulant-lang/ir';
import { T } from '@bramas/simulant-lang/types';

/** Library sensors only use the topology through the observer's frame. */
const equivariant: Equivariance = { rotations: true, reflections: true };

const seenHere = (C: X, me: X) =>
  agents(C).filter(b => and(b.ne(me), present(b), b.pos.eq(me.pos))).map(b => b.pub);

/** Public states of the other agents on my node. */
export const otherStates = sensor('otherStates', T.multiset(T.pub), ({ C, me }) => seenHere(C, me), equivariant);

/** The adversary may hide up to `k` of the agents on my node (fixed for the activation). */
export const otherStatesLossy = (k: number) => sensor('otherStates', T.multiset(T.pub), ({ C, me }) =>
  let_('seen', seenHere(C, me), seen =>
    let_('hidden', choose('otherStatesLossy.hidden', subsetsUpTo(seen, k), {
      label: h => ite(h.isEmpty(), str('hides nobody'), concat('hides ', show(h))),
    }), hidden => seen.diff(hidden))), equivariant);

/** Knowledge of the ring size. */
export const ringSize = sensor('ringSize', T.nat, ({ C }) => size(C), equivariant);

/** Which local offsets are occupied (weak multiplicity). States are not visible. */
export const ringPresence = sensor('ringPresence', T.list(T.bool), ({ C, me, frame }) =>
  ofFn(size(C), i => agents(C).any(b => and(present(b), b.pos.eq(offset(me.pos, frame, i))))), equivariant);

/** How many agents are at each local offset (strong multiplicity). */
export const ringCount = sensor('ringCount', T.list(T.nat), ({ C, me, frame }) =>
  ofFn(size(C), i => agents(C).count(b => and(present(b), b.pos.eq(offset(me.pos, frame, i))))), equivariant);
