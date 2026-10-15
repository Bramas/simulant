/**
 * Hand-written builder tasks for conformance and unit tests.
 * Project simulations and Lean generation use ../../sim/tasks.sim; see ../../README.md.
 */
import { agents, correct, ite, let_, move, nodes, present, target, task, verdict } from '@bramas/simulant-lang/builder';

const invariant = { rotations: true, reflections: true };

/**
 * Every correct agent claims the direction of the black hole from its node
 * (`pub.bh : Option Move`). Fails when no agent is correct. Directions are
 * global, which holds under common chirality.
 */
export const IdentifyBlackHole = task({
  name: 'IdentifyBlackHole',
  goal: 'eventuallyAlways',
  verdict: C => let_('alive', agents(C).filter(a => correct(a)), alive =>
    ite(alive.isEmpty(), verdict('failure'),
      ite(alive.all(a => a.pub.bh.isSome().and(target(a.pos, a.pub.bh.getD(move('stay'))).eq(C.world.site))),
        verdict('success'), verdict('inProgress')))),
  equivariance: { rotations: true, reflections: false },
});

/** Every present robot is on the same node, eventually. */
export const Gathering = task({
  name: 'Gathering',
  goal: 'eventually',
  verdict: C => let_('robots', agents(C).filter(a => present(a)), robots =>
    ite(robots.all(a => robots.all(b => a.pos.eq(b.pos))), verdict('success'), verdict('inProgress'))),
  equivariance: invariant,
});

/** Every node has been visited, eventually. Needs the `Monitors.Visited` component. */
export const Exploration = task({
  name: 'Exploration',
  goal: 'eventually',
  verdict: C => ite(nodes(C).all(n => C.world.visited.has(n)), verdict('success'), verdict('inProgress')),
  equivariance: invariant,
});
