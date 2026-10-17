/**
 * The conformance experiments, built with the TypeScript builder. The
 * fixtures are generated from the `.sim` versions; these must give the same
 * graphs, which checks that the builder's standard library and the `.sim`
 * one agree.
 */
import { experiment, lit, model, node, param, range, subsets } from '@bramas/simulant-lang/builder';
import type { Algorithm, Experiment, Model, Task } from '@bramas/simulant-lang/ir';
import { T } from '@bramas/simulant-lang/types';
import {
  blackHoleRing, dynamicRingRobots, Exploration, Faults, Gathering, gatheringWithCrash, Monitors, otherStatesLossy, Ring, Storage,
} from '../../stdlib/test/helpers/index';
import {
  AlwaysClockwise, cautiousPairExperiment, EveryoneActivated, MarkActivated, NearestNeighbour, Observe, PebbleTest,
} from '../../stdlib/test/helpers/examples';

function robots(m: Model, algorithm: Algorithm, task: Task): Experiment {
  return experiment({
    name: `${algorithm.name} on ${m.name}`, model: m, algorithm, task,
    params: [
      { name: 'N', type: T.nat },
      { name: 'positions', type: T.list(T.node), domain: subsets(range(param('N')).map(n => node(n))) },
      { name: 'crashNode', type: T.node, domain: lit(T.list(T.node), [0]) },
    ],
    agents: { count: param('positions').length(), pos: i => param('positions').at(i) },
  });
}

/** By fixture file. */
export const builderExperiments: Record<string, Experiment> = {
  'black-hole-emerging': cautiousPairExperiment(blackHoleRing({ policy: 'mayEmerge', size: 'unknown' })),
  'black-hole-crash-stop': cautiousPairExperiment(blackHoleRing({ policy: 'initiallyPresent', size: 'known', extra: [Faults.CrashStop(1)] })),
  'black-hole-lossy': cautiousPairExperiment(blackHoleRing({ policy: 'initiallyPresent', size: 'unknown', view: otherStatesLossy(1) })),
  pebbles: experiment({
    name: 'pebbles', model: blackHoleRing({ policy: 'none', size: 'unknown', extra: [Storage.Pebbles()] }), algorithm: PebbleTest, task: Observe,
    params: [{ name: 'N', type: T.nat }, { name: 'site', type: T.node }], agents: { count: 2, pos: () => node(0) },
  }),
  'gathering-with-crash': robots(gatheringWithCrash(), NearestNeighbour, Gathering),
  'dynamic-ring': robots(dynamicRingRobots([Monitors.Visited()]), AlwaysClockwise, Exploration),
  ssync: experiment({
    name: 'ssync', model: model({ name: 'ssync', topology: Ring(), sensors: [], round: 'ssync' }), algorithm: MarkActivated, task: EveryoneActivated,
    params: [{ name: 'N', type: T.nat }], agents: { count: 3, pos: i => node(i) },
  }),
  'parameter-acceptance': experiment({
    name: 'parameterAcceptance', model: model({ name: 'sequential', topology: Ring(), sensors: [], round: 'sequential' }), algorithm: MarkActivated, task: EveryoneActivated,
    params: [{ name: 'N', type: T.nat, accepts: param('N').ge(3) }], agents: { count: 3, pos: i => node(i) },
  }),
  sequential: experiment({
    name: 'sequential', model: model({ name: 'sequential', topology: Ring(), sensors: [], round: 'sequential' }), algorithm: MarkActivated, task: EveryoneActivated,
    params: [{ name: 'N', type: T.nat }], agents: { count: 3, pos: i => node(i) },
  }),
};
