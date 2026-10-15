/**
 * Hand-written builder model families for conformance and unit tests.
 * Project simulations and Lean generation use ../../sim/models.sim; see ../../README.md.
 */
import { dynamicRing, model, param, ring } from '@bramas/simulant-lang/builder';
import type { Component, FrameModel, Model, Sensor, Topology } from '@bramas/simulant-lang/ir';
import { Faults, Hazards, type HolePolicy } from './components';
import { otherStates, ringCount, ringPresence, ringSize } from './sensors';

export const Ring = (): Topology => ring(param('N'));
export const DynamicRing = (k = 1): Topology => dynamicRing(param('N'), k);

/** The black-hole family: three hole policies, known or unknown size, any extra components. */
export function blackHoleRing(opts: {
  policy: HolePolicy;
  size: 'known' | 'unknown';
  extra?: Component[];
  topology?: Topology;
  view?: Sensor;
}): Model {
  return model({
    name: `blackHoleRing(${opts.policy}, ${opts.size})`,
    topology: opts.topology ?? Ring(),
    sensors: [opts.view ?? otherStates, ...(opts.size === 'known' ? [ringSize] : [])],
    components: [Hazards.BlackHole(opts.policy), ...(opts.extra ?? [])],
  });
}

/** Oblivious robots with a global view. */
export function obliviousRing(opts: {
  topology?: Topology;
  sensor?: Sensor;
  frame?: FrameModel;
  components?: Component[];
  round?: Model['round'];
  name?: string;
} = {}): Model {
  return model({
    name: opts.name ?? 'obliviousRing',
    topology: opts.topology ?? Ring(),
    sensors: [opts.sensor ?? ringPresence],
    memory: 'oblivious',
    frame: opts.frame ?? { kind: 'dynamicReflection' },
    components: opts.components ?? [],
    round: opts.round,
  });
}

export const gatheringWithCrash = () =>
  obliviousRing({ name: 'gatheringWithCrash', components: [Faults.CrashAtNode()] });

export const dynamicRingRobots = (components: Component[] = []) =>
  obliviousRing({ name: 'dynamicRing', topology: DynamicRing(1), sensor: ringCount, frame: { kind: 'common' }, components });

export const dynamicRingBH = () =>
  blackHoleRing({ policy: 'mayEmerge', size: 'unknown', topology: DynamicRing(1) });
