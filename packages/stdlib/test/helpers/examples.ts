/**
 * Hand-written builder algorithms and experiments for conformance and unit tests.
 * The compiled .sim examples are in ../../sim/examples.sim; see ../../README.md.
 */
import {
  agents, algorithm, ctor, experiment, ite, let_, match, move, nat, node, none, param, range, rec, some, task, unit, verdict,
  type X,
} from '@bramas/simulant-lang/builder';
import type { Model } from '@bramas/simulant-lang/ir';
import { T } from '@bramas/simulant-lang/types';
import { PebbleAction } from './components';
import { IdentifyBlackHole } from './tasks';

const PC = T.enum('PC', ['probe', 'back', 'advance', 'wait1', 'wait2', 'check', 'halted']);
const pc = (name: string) => ctor(PC, name);
const Pub = T.record({ id: T.nat, bh: T.option(T.move) });

/**
 * A cautious walk of two agents: agent 0 probes the
 * next node and comes back; agent 1 waits, and declares the hole in the
 * direction `cw` if agent 0 does not come back.
 */
export const CautiousPair = algorithm({
  name: 'CautiousPair',
  uses: ['otherStates'],
  pub: Pub,
  mem: T.record({ pc: PC }),
  init: {
    pub: i => rec({ id: i, bh: none(T.move) }),
    mem: i => rec({ pc: ite(i.eq(0), pc('probe'), pc('wait1')) }),
  },
  step: ({ mem, pub, view }) => {
    const go = (next: string, m: 'stay' | 'cw' | 'ccw', p: X = pub) => rec({ move: move(m), pub: p, mem: rec({ pc: pc(next) }) });
    const leaderBack = view.otherStates.any((s: X) => s.id.eq(0));
    const d = match(mem.pc, {
      probe: go('back', 'cw'),
      back: go('advance', 'ccw'),
      advance: go('probe', 'cw'),
      wait1: go('wait2', 'stay'),
      wait2: go('check', 'stay'),
      check: ite(leaderBack, go('wait1', 'cw'), go('halted', 'stay', pub.with({ bh: some(move('cw')) }))),
      halted: go('halted', 'stay'),
    });
    return { move: d.move, pub: d.pub, mem: d.mem };
  },
  line: mem => match(mem.pc, { probe: 3, back: 4, advance: 5, wait1: 8, wait2: 9, check: 10, halted: 12 }),
});

/** Agents at node 0, the hole anywhere else, rings of size 3 to `maxN`. */
export function cautiousPairExperiment(m: Model, opts: { agents?: number; maxN?: number } = {}) {
  return experiment({
    name: `CautiousPair on ${m.name}`,
    model: m,
    algorithm: CautiousPair,
    task: IdentifyBlackHole,
    params: [
      { name: 'N', type: T.nat, domain: range(nat((opts.maxN ?? 6) + 1)).filter(n => n.ge(3)) },
      { name: 'site', type: T.node, domain: range(param('N')).filter(n => n.ge(1)).map(n => node(n)) },
    ],
    agents: { count: opts.agents ?? 2, pos: () => node(0) },
  });
}

/** Oblivious robots: move towards the nearest robot, stay on a tie or when alone. */
export const NearestNeighbour = algorithm({
  name: 'NearestNeighbour',
  uses: ['ringPresence'],
  pub: T.unit,
  init: { pub: () => unit() },
  step: ({ view }) => {
    const v = view.ringPresence;
    const n = v.length();
    const cw = range(n).filter(i => i.gt(0).and(v.at(i)));
    const ccw = range(n).filter(i => i.gt(0).and(v.at(n.sub(i))));
    return {
      move: ite(cw.isEmpty(), move('stay'),
        let_('dcw', cw.at(0), dcw => let_('dccw', ccw.at(0), dccw =>
          ite(dcw.lt(dccw), move('cw'), ite(dccw.lt(dcw), move('ccw'), move('stay')))))),
    };
  },
});

/** Oblivious robots that always try to move clockwise. */
export const AlwaysClockwise = algorithm({
  name: 'AlwaysClockwise',
  uses: ['ringCount'],
  pub: T.unit,
  init: { pub: () => unit() },
  step: () => ({ move: move('cw') }),
});

/** Each agent records, in its public state, that it has been activated. */
export const MarkActivated = algorithm({
  name: 'MarkActivated',
  uses: [],
  pub: T.record({ activated: T.bool }),
  init: { pub: () => rec({ activated: false }) },
  step: ({ pub }) => ({ move: move('stay'), pub: pub.with({ activated: true }) }),
});

export const EveryoneActivated = task({
  name: 'EveryoneActivated',
  goal: 'eventually',
  verdict: C => ite(agents(C).all(a => a.pub.activated), verdict('success'), verdict('inProgress')),
  equivariance: { rotations: true, reflections: true },
});

/** Never fails, never succeeds: for tests that only look at the reachable configurations. */
export const Observe = task({
  name: 'Observe', goal: 'safety', verdict: () => verdict('inProgress'), equivariance: { rotations: true, reflections: true },
});

/** Agent 0 drops a pebble in the first round; in the second round, every agent tries to pick one up. */
export const PebbleTest = algorithm({
  name: 'PebbleTest',
  uses: ['pebblesHere'],
  pub: T.record({ id: T.nat }),
  mem: T.record({ round: T.nat }),
  init: { pub: i => rec({ id: i }), mem: () => rec({ round: 0 }) },
  step: ({ mem, pub, view }) => ({
    move: move('stay'),
    mem: rec({ round: mem.round.add(1) }),
    pebble: ite(mem.round.eq(0).and(pub.id.eq(0)), ctor(PebbleAction, 'drop'),
      ite(mem.round.eq(1).and(view.pebblesHere.gt(0)), ctor(PebbleAction, 'pick'), ctor(PebbleAction, 'none'))),
  }),
});
