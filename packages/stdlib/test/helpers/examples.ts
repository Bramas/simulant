/**
 * Hand-written builder algorithms and experiments for conformance and unit tests.
 * The compiled .sim versions are in ../../sim/examples.sim and conformance.sim; see ../../README.md.
 */
import {
  agents, algorithm, callDef, ctor, def, distance, experiment, here, ite, let_, match, nat, neighbors, none, param, pos, range,
  rec, sense, some, task, unit, verdict, visible, type Arg, type X,
} from '@bramas/simulant-lang/builder';
import type { Model } from '@bramas/simulant-lang/ir';
import { T } from '@bramas/simulant-lang/types';
import { PebbleAction } from './components';
import { IdentifyBlackHole } from './tasks';

/** The neighbor behind my port `i` (`port i` in the library). */
const port = (i: Arg) => neighbors(here()).at(i);

const PC = T.enum('PC', ['probe', 'back', 'advance', 'wait1', 'wait2', 'check', 'halted']);
const pc = (name: string) => ctor(PC, name);
const Pub = T.record({ id: T.nat, bh: T.option(T.nat) });

/**
 * A cautious walk of two agents: agent 0 probes its clockwise neighbor and
 * comes back; agent 1 waits, and claims the hole behind its clockwise port
 * if agent 0 does not come back.
 */
export const CautiousPair = algorithm({
  name: 'CautiousPair',
  uses: ['otherStates'],
  pub: Pub,
  mem: T.record({ pc: PC }),
  init: {
    pub: i => rec({ id: i, bh: none(T.nat) }),
    mem: i => rec({ pc: ite(i.eq(0), pc('probe'), pc('wait1')) }),
  },
  step: ({ mem, pub }) => {
    const go = (next: string, to: X, p: X = pub) => rec({ move: to, pub: p, mem: rec({ pc: pc(next) }) });
    const leaderBack = sense('otherStates').any((s: X) => s.id.eq(0));
    const d = match(mem.pc, {
      probe: go('back', port(0)),
      back: go('advance', port(1)),
      advance: go('probe', port(0)),
      wait1: go('wait2', here()),
      wait2: go('check', here()),
      check: ite(leaderBack, go('wait1', port(0)), go('halted', here(), pub.with({ bh: some(nat(0)) }))),
      halted: go('halted', here()),
    });
    return { move: d.move, pub: d.pub, mem: d.mem };
  },
  line: mem => match(mem.pc, { probe: 3, back: 4, advance: 5, wait1: 8, wait2: 9, check: 10, halted: 12 }),
});

/** Agents at vertex 0, the hole anywhere else, cycles of size 3 to `maxN`. */
export function cautiousPairExperiment(m: Model, opts: { agents?: number; maxN?: number } = {}) {
  return experiment({
    name: `CautiousPair on ${m.name}`,
    model: m,
    algorithm: CautiousPair,
    task: IdentifyBlackHole,
    params: [
      { name: 'N', type: T.nat, domain: range(nat((opts.maxN ?? 6) + 1)).filter(n => n.ge(3)) },
      { name: 'site', type: T.pos, domain: range(param('N')).filter(n => n.ge(1)).map(n => pos(n)) },
    ],
    agents: { count: opts.agents ?? 2, pos: () => pos(0) },
  });
}

/** The distance from a location to the nearest of `others`. */
const nearest = def('nearest', { from: T.loc, others: T.list(T.loc) }, T.nat, ({ from, others }) =>
  range(visible().length()).filter(k => others.any(l => distance(from, l).eq(k))).at(0));

/** Oblivious robots with a full view: move to the neighbor closer to the nearest robot, stay on a tie or when alone. */
export const NearestNeighbour = algorithm({
  name: 'NearestNeighbour',
  uses: ['occupied'],
  pub: T.unit,
  init: { pub: () => unit() },
  step: () => {
    const others = visible().filter(l => l.ne(here()).and(sense('occupied', l)));
    return {
      move: ite(others.isEmpty(), here(),
        let_('d', callDef('nearest', here(), others), d =>
          let_('closer', neighbors(here()).filter(n => callDef('nearest', n, others).lt(d)), closer =>
            ite(closer.length().eq(1), closer.at(0), here())))),
    };
  },
  defs: [nearest],
});

/** Oblivious robots that always move through their port 0. */
export const AlwaysClockwise = algorithm({
  name: 'AlwaysClockwise',
  uses: ['count'],
  pub: T.unit,
  init: { pub: () => unit() },
  step: () => ({ move: port(0) }),
});

/** Each agent records, in its public state, that it has been activated. */
export const MarkActivated = algorithm({
  name: 'MarkActivated',
  uses: [],
  pub: T.record({ activated: T.bool }),
  init: { pub: () => rec({ activated: false }) },
  step: ({ pub }) => ({ move: here(), pub: pub.with({ activated: true }) }),
});

export const EveryoneActivated = task({
  name: 'EveryoneActivated',
  goal: 'eventually',
  verdict: C => ite(agents(C).all(a => a.pub.activated), verdict('success'), verdict('inProgress')),
  equivariant: true,
});

/** Never fails, never succeeds: for tests that only look at the reachable configurations. */
export const Observe = task({ name: 'Observe', goal: 'safety', verdict: () => verdict('inProgress'), equivariant: true });

/** Agent 0 drops a pebble in the first round; in the second round, every agent tries to pick one up. */
export const PebbleTest = algorithm({
  name: 'PebbleTest',
  uses: ['pebblesHere'],
  pub: T.record({ id: T.nat }),
  mem: T.record({ round: T.nat }),
  init: { pub: i => rec({ id: i }), mem: () => rec({ round: 0 }) },
  step: ({ mem, pub }) => ({
    move: here(),
    mem: rec({ round: mem.round.add(1) }),
    pebble: ite(mem.round.eq(0).and(pub.id.eq(0)), ctor(PebbleAction, 'drop'),
      ite(mem.round.eq(1).and(sense('pebblesHere').gt(0)), ctor(PebbleAction, 'pick'), ctor(PebbleAction, 'none'))),
  }),
});

/** A three-color palette: move through port 0, and request the next color after the sum of those here. */
export const CycleLight = algorithm({
  name: 'CycleLight',
  uses: ['colors'],
  pub: T.unit,
  init: { pub: () => unit() },
  step: () => ({ move: port(0), setLight: some(sense('colors', here()).sum().add(1).mod(3)) }),
});

/** Robots on leaves move to the center; robots at the center stay. */
export const ToHub = algorithm({
  name: 'ToHub',
  uses: ['occupied'],
  pub: T.unit,
  init: { pub: () => unit() },
  step: () => ({ move: ite(neighbors(here()).length().eq(1), port(0), here()) }),
});

/** Dispersion on any graph: leave a crowded node for an empty neighbor. */
export const Disperse = algorithm({
  name: 'Disperse',
  uses: ['count'],
  pub: T.unit,
  init: { pub: () => unit() },
  step: () => ({
    move: let_('free', neighbors(here()).filter(l => sense('count', l).eq(0)), free =>
      ite(sense('count', here()).gt(1).and(free.isEmpty().not()), free.at(0), here())),
  }),
});
