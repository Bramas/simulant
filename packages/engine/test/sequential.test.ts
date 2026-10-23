import assert from 'node:assert/strict';
import { test } from 'node:test';
import { experiment, frames, pos, radius } from '@bramas/simulant-lang/builder';
import { T } from '@bramas/simulant-lang/types';
import { Explorer } from '@bramas/simulant-engine/explorer';
import { System } from '@bramas/simulant-engine/system';
import { EveryoneActivated, MarkActivated } from '../../stdlib/test/helpers/examples';
import { Cycle, robots } from '../../stdlib/test/helpers/models';
import { Schedulers } from '../../stdlib/test/helpers/schedulers';

const make = (count: number) => experiment({
  name: 'sequential', model: robots({ space: Cycle(), observation: radius(1), frames: frames.identity, sensors: [], scheduler: Schedulers.Sequential }),
  algorithm: MarkActivated, task: EveryoneActivated,
  params: [{ name: 'N', type: T.nat }], agents: { count, pos: i => pos(i) },
});

test('sequential rounds activate exactly one agent and preserve identities', () => {
  const system = new System(make(3), { N: 3 });
  const initial = system.initial()[0].config;
  const successors = system.successors(initial);
  assert.equal(system.anonymous, false);
  assert.equal(successors.length, 3);
  for (const [i, successor] of successors.entries()) {
    assert.deepEqual([...successor.activated], [i]);
    assert.deepEqual(successor.config.agents.map(a => a.pub.activated), [0, 1, 2].map(j => i === j));
    assert.equal(successor.witness.find(w => w.site === 'Sequential.a')?.label, `activates a${i}`);
  }
});

test('sequential fairness excludes starvation but permits repeated activations', () => {
  const explorer = new Explorer(new System(make(2), { N: 3 }));
  assert.equal(explorer.run().status, 'success');
  const starving = explorer.states.find(s => s.config.agents[0].pub.activated && !s.config.agents[1].pub.activated);
  assert.ok(starving?.succ?.includes(starving.id), 'unbounded repeated activation is permitted as a transition');
});

test('a sequential round with no eligible agent has an idle successor', () => {
  const system = new System(make(0), { N: 3 });
  const successors = system.successors(system.initial()[0].config);
  assert.equal(successors.length, 1);
  assert.deepEqual([...successors[0].activated], []);
});
