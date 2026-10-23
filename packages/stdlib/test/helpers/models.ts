/**
 * Hand-written builder spaces and model families for conformance and unit tests.
 * Project simulations and Lean generation use ../../sim/spaces.sim and models.sim; see ../../README.md.
 */
import { cycle, frames as F, graph, int, ite, list, lit, model, param, radius, range, type Arg } from '@bramas/simulant-lang/builder';
import type { Component, Frames, Model, Observation, Scheduler, Sensor, Space } from '@bramas/simulant-lang/ir';
import { T } from '@bramas/simulant-lang/types';
import { Hazards, type HolePolicy } from './components';
import { Schedulers } from './schedulers';
import { otherStates, spaceSize } from './sensors';

/** The cycle C_n (`Graphs.Cycle`); its size is the experiment parameter `N` by default. */
export const Cycle = (n: Arg = param('N')): Space => cycle(n);

/** The infinite line (`Graphs.Line`). */
export const Line = (): Space => graph({
  name: 'Graphs.Line', vertex: T.int,
  neighbors: v => list(v.add(int(1)), v.sub(int(1))),
  automorphisms: { kind: 'translationsAndReflection' },
});

/** A star with a center (vertex 0) and `k` leaves (`Graphs.Star`). */
export const Star = (k: Arg = param('k')): Space => graph({
  name: 'Graphs.Star', vertex: T.nat, params: { k: { type: T.nat, value: k } },
  vertices: p => range(p.k.add(1)),
  neighbors: (v, p) => ite(v.eq(0), range(p.k).map(x => x.add(1)), lit(T.list(T.nat), [0])),
});

/** Agents with the given space, observation, frames and sensors (`robots`). */
export function robots(opts: {
  name?: string; space: Space; observation: Observation; frames: Frames; sensors: Sensor[]; components?: Component[];
  memory?: Model['memory']; scheduler?: Scheduler; symmetries?: Model['symmetries'];
}): Model {
  return model({
    name: opts.name ?? 'robots', space: opts.space, observation: opts.observation, frames: opts.frames, sensors: opts.sensors,
    components: opts.components, memory: opts.memory ?? 'oblivious', scheduler: opts.scheduler ?? Schedulers.FSync, symmetries: opts.symmetries,
  });
}

/** Black-hole search: chirality, radius-1 views, co-located states (`blackHoleRobots`). */
export function blackHoleRobots(opts: {
  space?: Space; policy: HolePolicy; size: 'known' | 'unknown'; extra?: Component[]; view?: Sensor; scheduler?: Scheduler;
}): Model {
  return robots({
    name: `blackHoleRobots(${opts.policy}, ${opts.size})`,
    space: opts.space ?? Cycle(), observation: radius(1), frames: F.identity,
    sensors: [opts.view ?? otherStates, ...(opts.size === 'known' ? [spaceSize] : [])],
    components: [Hazards.BlackHole(opts.policy), ...(opts.extra ?? [])], memory: 'persistent', scheduler: opts.scheduler,
  });
}
