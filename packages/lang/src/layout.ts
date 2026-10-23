/**
 * The composed state of an experiment: which fields, flags, sensors and
 * actions exist, and which component owns each of them.
 */
import type { Action, Def, Experiment, Field, Flag, Sensor, Type } from './ir';
import { resolvePub, T } from './types';

export type Owned<X> = X & { owner: string };

export type Layout = {
  world: Owned<Field>[];
  agentFields: Owned<Field>[];
  flags: Owned<Flag>[];
  sensors: Owned<Sensor>[];
  actions: Owned<Action>[];
  worldType: Type;
  pub: Type;
  mem: Type;
  /** The sensors the algorithm uses, by the name it reads them with. */
  used: Owned<Sensor>[];
  /** What `step` returns. */
  decision: Type;
  /** Definitions visible from every piece: the model's. */
  defs: Def[];
  errors: string[];
};

export const MODEL = 'model';

export function layout(exp: Experiment): Layout {
  const errors: string[] = [];
  const unique = <X extends { name: string }>(what: string, items: Owned<X>[]) => {
    const seen = new Map<string, string>();
    for (const item of items) {
      const other = seen.get(item.name);
      if (other !== undefined) errors.push(`${what} '${item.name}' is declared by both ${other} and ${item.owner}`);
      seen.set(item.name, item.owner);
    }
    return items;
  };
  const owned = <X>(owner: string, items: X[] | undefined) => (items ?? []).map(x => ({ ...x, owner }));
  const { model, algorithm } = exp;
  // The scheduler owns world and agent fields like a component.
  const owners = [...model.components, model.scheduler];
  const world = unique('world field', owners.flatMap(c => owned(c.name, c.world)));
  const agentFields = unique('agent field', owners.flatMap(c => owned(c.name, c.agent)));
  const flags = unique('flag', model.components.flatMap(c => owned(c.name, c.flags)));
  const sensors = unique('sensor', [...owned(MODEL, model.sensors), ...model.components.flatMap(c => owned(c.name, c.sensors))])
    .map(s => ({ ...s, type: resolvePub(s.type, algorithm.pub) }));
  const actions = unique('action', model.components.flatMap(c => owned(c.name, c.actions)));
  const reserved = new Set(['pos', 'pub', 'mem', 'decided', 'target', 'phase']);
  for (const f of [...agentFields, ...flags]) {
    if (reserved.has(f.name)) errors.push(`agent field '${f.name}' of ${f.owner} is reserved`);
  }
  for (const f of agentFields) {
    if (flags.some(g => g.name === f.name)) errors.push(`'${f.name}' is both an agent field and a flag`);
  }
  for (const a of actions) {
    if (['move', 'pub', 'mem'].includes(a.name)) errors.push(`action '${a.name}' of ${a.owner} is reserved`);
  }
  const used: Owned<Sensor>[] = [];
  for (const name of algorithm.uses) {
    const sensor = sensors.find(s => s.name === name);
    if (sensor) used.push(sensor);
    else errors.push(`algorithm ${algorithm.name} uses sensor '${name}', which the model does not provide`);
  }
  return {
    world, agentFields, flags, sensors, actions, errors,
    worldType: T.record(world.map(({ name, type }) => ({ name, type }))),
    pub: algorithm.pub,
    mem: algorithm.mem,
    used,
    decision: T.record([
      { name: 'move', type: T.loc }, { name: 'pub', type: algorithm.pub }, { name: 'mem', type: algorithm.mem },
      ...actions.map(({ name, type }) => ({ name, type })),
    ]),
    defs: model.defs ?? [],
  };
}
