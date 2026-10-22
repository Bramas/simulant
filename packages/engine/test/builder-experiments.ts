/**
 * The conformance experiments, built with the TypeScript builder. The
 * fixtures are generated from the `.sim` versions; these must give the same
 * graphs, which checks that the builder's standard library and the `.sim`
 * one agree.
 */
import {
  agents, algorithm, choose, component, dynamic, effect, emptyList, experiment, frames, full, here, ite, let_, list,
  param, pos, radius, rec, sense, task, unit, verdict, visible,
} from '@bramas/simulant-lang/builder';
import type { Algorithm, Experiment, Model, Task, Type } from '@bramas/simulant-lang/ir';
import { T } from '@bramas/simulant-lang/types';
import {
  blackHoleRobots, colors, count, Cycle, Dispersion, edgeTo, Exploration, Faults, Gathering, Line, Monitors, occupied, otherStatesLossy,
  robots, Star, Storage,
} from '../../stdlib/test/helpers/index';
import {
  AlwaysClockwise, cautiousPairExperiment, CycleLight, Disperse, EveryoneActivated, MarkActivated, NearestNeighbour, Observe,
  PebbleTest, ToHub,
} from '../../stdlib/test/helpers/examples';

/** Agents at the positions of the parameter `positions` (a list of positions). */
function placed(m: Model, algorithm: Algorithm, task: Task, extra: { name: string; type: Type }[] = []): Experiment {
  return experiment({
    name: `${algorithm.name} on ${m.name}`, model: m, algorithm, task,
    params: [{ name: 'N', type: T.nat }, { name: 'positions', type: T.list(T.pos) }, ...extra],
    agents: { count: param('positions').length(), pos: i => param('positions').at(i) },
  });
}

const onCycle = (round: Model['round']) => robots({ space: Cycle(), observation: radius(1), frames: frames.identity, sensors: [], round });
const exploring = (f: Model['frames'], space = Cycle()) =>
  robots({ space, observation: radius(1), frames: f, sensors: [count], components: [Monitors.Visited()] });
const three = (name: string, m: Model, accepts?: boolean) => experiment({
  name, model: m, algorithm: MarkActivated, task: EveryoneActivated,
  params: [{ name: 'N', type: T.nat, ...(accepts ? { accepts: param('N').ge(3) } : {}) }], agents: { count: 3, pos: i => pos(i) },
});

const fieldChoices = component({
  name: 'FieldChoices', agent: { x: T.nat, y: T.nat },
  init: { agent: { x: () => 0, y: () => 0 } },
  beforeLook: () => let_('b', choose('FieldChoices.b', list(false, true)), b =>
    effect({ agents: () => rec({ x: ite(b, 12, 1), y: ite(b, 3, 23) }) })),
});

/** By fixture file. */
export const builderExperiments: Record<string, Experiment> = {
  'agent-fields': experiment({
    name: 'agentFields',
    model: robots({ space: Cycle(), observation: radius(1), frames: frames.identity, sensors: [], components: [fieldChoices], symmetries: 'none' }),
    algorithm: algorithm({ name: 'Stay', uses: [], pub: T.unit, init: { pub: unit }, step: () => ({ move: here() }) }),
    task: task({ name: 'SafeFields', goal: 'safety', verdict: C => ite(agents(C).any(a => a.x.eq(12)), verdict('failure'), verdict('inProgress')) }),
    params: [{ name: 'N', type: T.nat }], agents: { count: 1, pos: () => pos(0) },
  }),
  'edge-presence': experiment({
    name: 'edgePresence',
    model: robots({ space: dynamic(Cycle(), 1), observation: radius(2), frames: frames.identity, sensors: [edgeTo] }),
    algorithm: algorithm({
      name: 'ReadEdges', uses: ['edgeTo'], pub: T.record({ edges: T.list(T.bool) }),
      init: { pub: () => rec({ edges: emptyList(T.bool) }) },
      step: () => ({ move: here(), pub: rec({ edges: visible().map(l => sense('edgeTo', l)) }) }),
    }),
    task: Observe,
    params: [{ name: 'N', type: T.nat }], agents: { count: 1, pos: () => pos(0) },
  }),
  'black-hole-emerging': cautiousPairExperiment(blackHoleRobots({ policy: 'mayEmerge', size: 'unknown' })),
  'black-hole-crash-stop': cautiousPairExperiment(blackHoleRobots({ policy: 'initiallyPresent', size: 'known', extra: [Faults.CrashStop(1)] })),
  'black-hole-lossy': cautiousPairExperiment(blackHoleRobots({ policy: 'initiallyPresent', size: 'unknown', view: otherStatesLossy(1) })),
  'two-node-cycle': cautiousPairExperiment(blackHoleRobots({ policy: 'mayEmerge', size: 'unknown' })),
  pebbles: experiment({
    name: 'pebbles', model: blackHoleRobots({ policy: 'none', size: 'unknown', extra: [Storage.Pebbles()] }), algorithm: PebbleTest, task: Observe,
    params: [{ name: 'N', type: T.nat }, { name: 'site', type: T.pos }], agents: { count: 2, pos: () => pos(0) },
  }),
  'gathering-with-crash': placed(
    robots({ space: Cycle(), observation: full, frames: frames.isomorphisms, sensors: [occupied], components: [Faults.CrashAt()] }),
    NearestNeighbour, Gathering, [{ name: 'crashNode', type: T.pos }]),
  'dynamic-ring': placed(exploring(frames.identity, dynamic(Cycle(), 1)), AlwaysClockwise, Exploration),
  'own-orientation': placed(exploring(frames.portPermutations('perRobot')), AlwaysClockwise, Exploration),
  'port-permutations': placed(exploring(frames.portPermutations('perLook', 'symmetries')), AlwaysClockwise, Exploration),
  ssync: three('ssync', onCycle('ssync')),
  sequential: three('sequential', onCycle('sequential')),
  'parameter-acceptance': three('parameterAcceptance', onCycle('sequential'), true),
  lights: experiment({
    name: 'lights',
    model: robots({ space: Line(), observation: radius(param('phi')), frames: frames.isomorphisms, sensors: [colors], components: [Storage.Lights(3), Faults.CrashAt()] }),
    algorithm: CycleLight, task: Observe,
    params: [{ name: 'positions', type: T.list(T.int) }, { name: 'phi', type: T.nat }, { name: 'crashNode', type: T.pos }],
    agents: { count: param('positions').length(), pos: i => pos(param('positions').at(i)) },
  }),
  'star-gathering': experiment({
    name: 'starGathering', model: robots({ space: Star(), observation: radius(1), frames: frames.isomorphisms, sensors: [occupied] }),
    algorithm: ToHub, task: Gathering,
    params: [{ name: 'k', type: T.nat }, { name: 'start', type: T.list(T.nat) }],
    agents: { count: param('start').length(), pos: i => pos(param('start').at(i)) },
  }),
  'star-dispersion': experiment({
    name: 'starDispersion', model: robots({ space: Star(), observation: radius(1), frames: frames.isomorphisms, sensors: [count] }),
    algorithm: Disperse, task: Dispersion,
    params: [{ name: 'k', type: T.nat }], agents: { count: 3, pos: () => pos(0) },
  }),
};
