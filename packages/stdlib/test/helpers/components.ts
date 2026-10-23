/**
 * Hand-written builder components for conformance and unit tests.
 * Project simulations and Lean generation use ../../sim/components.sim; see ../../README.md.
 * "Hazards" and "faults" are namespaces: each component owns state, raises
 * flags, and reacts at the hook points of the round.
 */
import {
  agents, and, choose, component, concat, correct, decisionOf, effect, flag, ite, let_, lit, param, position, present, rec,
  sensor, show, str, subsets, type X,
} from '@bramas/simulant-lang/builder';
import type { Component } from '@bramas/simulant-lang/ir';
import { T } from '@bramas/simulant-lang/types';

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
    world: { site: T.pos, active: T.bool },
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
    equivariant: true,
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
    equivariant: true,
  }),

  /** Robots at `param crashNode` may crash after Compute, instead of moving. */
  CrashAt: (): Component => component({
    name: 'CrashAt',
    world: { crashNode: T.pos },
    flags: [crashed],
    init: { world: { crashNode: param('crashNode') } },
    beforeMove: C => let_('S', choose('CrashAt.S', subsets(agents(C).filter(a => and(correct(a), a.pos.eq(C.world.crashNode)))), {
      label: crashLabel,
    }), S => effect({ raise: { crashed: S } })),
    equivariant: true,
  }),
};

export const PebbleAction = T.enum('PebbleAction', ['none', 'drop', 'pick']);

export const Storage = {
  /** Lights with a palette of `colors` colors, initially 0, as an agent field set by `setLight`. */
  Lights: (colors: number): Component => component({
    name: 'Lights', params: { colors: T.nat }, args: { colors },
    world: { colorCount: T.nat }, agent: { light: T.nat },
    actions: [{ name: 'setLight', type: T.option(T.nat), default: null }],
    init: { world: { colorCount: p => p.colors }, agent: { light: () => 0 } },
    onCompute: (_C, p) => effect({
      agents: a => let_('c', decisionOf(a).setLight, c =>
        rec({ light: ite(and(decisionOf(a).decided, c.isSome(), c.getD(0).lt(p.colors)), c.getD(0), a.light) })),
    }),
    equivariant: true,
  }),
  /**
   * Pebbles on positions, one multiset entry per pebble. Dropping and picking are
   * actions, applied at Compute, where the agent stands before it moves: all drops succeed;
   * picks at a position succeed up to the number of pebbles there (multiset difference is truncated).
   */
  Pebbles: (): Component => component({
    name: 'Pebbles',
    world: { pebbles: T.multiset(T.pos) },
    actions: [{ name: 'pebble', type: PebbleAction, default: 'none' }],
    sensors: [sensor('pebblesHere', T.nat, ({ L }) => L.world.pebbles.count((p: X) => p.eq(position(L, L.here))))],
    init: { world: { pebbles: lit(T.multiset(T.pos), []) } },
    onCompute: C => {
      const doing = (what: string) => agents(C)
        .filter(a => and(decisionOf(a).decided, decisionOf(a).pebble.eq(lit(PebbleAction, what))))
        .map(a => a.pos);
      return effect({ world: { pebbles: C.world.pebbles.diff(doing('pick')).append(doing('drop')) } });
    },
    equivariant: true,
  }),
};

export const Monitors = {
  /** The positions visited so far, for tasks that depend on the history. */
  Visited: (): Component => component({
    name: 'Visited',
    world: { visited: T.multiset(T.pos) },
    init: { world: { visited: lit(T.multiset(T.pos), []) } },
    // Initial positions are recorded by the first round's beforeLook.
    beforeLook: C => effect({ world: { visited: markVisited(C) } }),
    afterMove: C => effect({ world: { visited: markVisited(C) } }),
    equivariant: true,
  }),
};

function markVisited(C: X): X {
  return C.world.visited.append(agents(C).filter(a => present(a)).map(a => a.pos)).dedup();
}
