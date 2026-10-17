/**
 * Hand-written builder components for conformance and unit tests.
 * Project simulations and Lean generation use ../../sim/components.sim; see ../../README.md.
 * "Hazards" and "faults" are namespaces: each component owns state, raises
 * flags, and reacts at the hook points of the round.
 */
import {
  agents, and, choose, component, concat, correct, decisionOf, effect, flag, frames, ite, let_, lit, param, present,
  ofFn, sensor, show, str, subsets, type X,
} from '@bramas/simulant-lang/builder';
import type { Component, Equivariance } from '@bramas/simulant-lang/ir';
import { T } from '@bramas/simulant-lang/types';

const equivariant: Equivariance = { rotations: true, reflections: true };

const crashed = flag('crashed', 'visible', 'never');

const crashLabel = (S: X) => ite(S.isEmpty(), str('no crash'), concat('crash ', show(S)));

export type HolePolicy = 'none' | 'initiallyPresent' | 'mayEmerge';
export const HolePolicyT = T.enum('HolePolicy', ['none', 'initiallyPresent', 'mayEmerge']);

export const Hazards = {
  /**
   * A black hole at `param site`. In `afterMove` it chooses whether to
   * activate (under `mayEmerge`), and kills the present agents on its site.
   * Once active, no branch makes it inactive again.
   */
  BlackHole: (policy: HolePolicy): Component => component({
    name: 'BlackHole',
    params: { policy: HolePolicyT },
    args: { policy },
    world: { site: T.node, active: T.bool },
    flags: [flag('dead', 'hidden', 'never')],
    init: { world: { site: param('site'), active: p => p.policy.eq(lit(HolePolicyT, 'initiallyPresent')) } },
    afterMove: (C, p) => let_('active',
      ite(and(p.policy.eq(lit(HolePolicyT, 'mayEmerge')), C.world.active.not()),
        choose('BlackHole.active', lit(T.list(T.bool), [false, true]), {
          label: b => ite(b, str('activates'), str('stays inactive')),
        }),
        C.world.active),
      active => effect({
        world: { active },
        raise: { dead: a => and(present(a), active, a.pos.eq(C.world.site)) },
      })),
    equivariance: equivariant,
  }),
};

export const Faults = {
  /** Up to `f` agents crash, at the start of any round. No counter: flags are never cleared. */
  CrashStop: (f: number): Component => component({
    name: 'CrashStop',
    params: { f: T.nat },
    args: { f },
    flags: [crashed],
    beforeLook: (C, p) => let_('S', choose('CrashStop.S', subsets(agents(C).filter(a => correct(a))), {
      such: S => agents(C).count(a => a.crashed).add(S.length()).le(p.f),
      label: crashLabel,
    }), S => effect({ raise: { crashed: S } })),
    equivariance: equivariant,
  }),

  /**
   * Robots on the faulty node (`param crashNode`) may crash instead of
   * executing the move they decided.
   */
  CrashAtNode: (): Component => component({
    name: 'CrashAtNode',
    world: { crashNode: T.node },
    flags: [crashed],
    init: { world: { crashNode: param('crashNode') } },
    beforeMove: C => let_('S', choose('CrashAtNode.S', subsets(agents(C).filter(a => and(correct(a), a.pos.eq(C.world.crashNode)))), {
      label: crashLabel,
    }), S => effect({ raise: { crashed: S } })),
    equivariance: equivariant,
  }),
};

export const Vision = {
  Radius: (): Component => component({
    name: 'Radius', world: { phi: T.nat },
    init: { world: { phi: param('phi') } }, equivariance: equivariant,
  }),
};

export const PebbleAction = T.enum('PebbleAction', ['none', 'drop', 'pick']);

export const Storage = {
  /** Fixed finite palette, initial color 0 and optional color updates. */
  Lights: (colors: number): Component => component({
    name: 'Lights', params: { colors: T.nat }, args: { colors },
    world: { colorCount: T.nat, lights: T.list(T.nat) }, agent: { slot: T.nat },
    actions: [{ name: 'light', type: T.option(T.nat), default: null }],
    init: { world: { colorCount: p => p.colors, lights: lit(T.list(T.nat), []) }, agent: { slot: i => i } },
    beforeMove: C => effect({ world: { lights: ofFn(agents(C).length(), i =>
      let_('previous', ite(i.lt(C.world.lights.length()), C.world.lights.at(i), 0), previous =>
        let_('updates', agents(C).filter(a => and(a.slot.eq(i), decisionOf(a).decided,
          decisionOf(a).light.isSome(), decisionOf(a).light.getD(0).lt(C.world.colorCount))), updates =>
          ite(updates.isEmpty(), previous, updates.map((a: X) => decisionOf(a).light.getD(0)).sum())))) } }),
    equivariance: equivariant,
  }),
  /**
   * Pebbles on nodes, one multiset entry per pebble. Dropping and picking are
   * actions, applied in `beforeMove`. Conflicts: all drops succeed; picks at
   * a node succeed up to the number of pebbles there (multiset difference is
   * truncated), so two agents cannot pick the same pebble.
   */
  Pebbles: (): Component => component({
    name: 'Pebbles',
    world: { pebbles: T.multiset(T.node) },
    actions: [{ name: 'pebble', type: PebbleAction, default: 'none' }],
    sensors: [sensor('pebblesHere', T.nat, ({ C, me }) => C.world.pebbles.count((n: X) => n.eq(me.pos)), equivariant)],
    init: { world: { pebbles: lit(T.multiset(T.node), []) } },
    beforeMove: C => {
      const doing = (what: string) => agents(C)
        .filter(a => and(decisionOf(a).decided, decisionOf(a).pebble.eq(lit(PebbleAction, what))))
        .map(a => a.pos);
      return effect({ world: { pebbles: C.world.pebbles.diff(doing('pick')).append(doing('drop')) } });
    },
    equivariance: equivariant,
  }),
};

export const Frames = {
  /** Each agent has its own orientation, chosen at initialisation and fixed for the execution. */
  PersistentReflection: (): Component => component({
    name: 'PersistentReflection',
    agent: { mirrored: T.frame },
    init: { agent: { mirrored: () => choose('PersistentReflection.mirrored', frames(), { label: f => concat('frame ', show(f)) }) } },
    equivariance: equivariant,
  }),
};

export const Monitors = {
  /**
   * The nodes visited so far, stored by a monitor component for tasks that
   * depend on the history.
   */
  Visited: (): Component => component({
    name: 'Visited',
    world: { visited: T.multiset(T.node) },
    init: { world: { visited: lit(T.multiset(T.node), []) } },
    // Initial positions are recorded by the first round's beforeLook.
    beforeLook: C => effect({ world: { visited: markVisited(C) } }),
    afterMove: C => effect({ world: { visited: markVisited(C) } }),
    equivariance: equivariant,
  }),
};

function markVisited(C: X): X {
  return C.world.visited.append(agents(C).filter(a => present(a)).map(a => a.pos)).dedup();
}
